/**
 * Unix-domain-socket control channel between the parent orchestrator and
 * running subagents.
 *
 * The channel carries only wakeups and receipts; session files remain the
 * durable source of truth for task payloads. This keeps delivery terminal-free
 * (no pane send-keys) for follow-up tasks and lets a replacement parent
 * process re-listen on a stable path after /reload or /resume.
 *
 * Protocol: newline-delimited JSON over one socket per parent process.
 *   child -> parent: {v:1, kind:"hello", runId, pid}
 *                     {v:1, kind:"ack", runId, deliveryId, state}
 *   parent -> child: {v:1, kind:"wake", deliveryId, reason}
 *   (reserved)       {v:1, kind:"deliver", deliveryId, message}
 *
 * Receipt states: "delivered" (child received), "consumed" (child acted),
 * "missed" (no connection), "timeout", "failed" (socket error).
 */
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const CONTROL_PROTOCOL_VERSION = 1;

/** Environment variable carrying the parent control socket path to children. */
export const CONTROL_SOCK_ENV = "PI_SUBAGENT_CONTROL_SOCK";

const MAX_WIRE_LINE = 64 * 1024;
const DEFAULT_RECEIPT_TIMEOUT_MS = 3000;
const CONTROL_SERVER_SLOT = "__piHerdrAgentsControlServer";
const PROBE_TIMEOUT_MS = 500;

export type ControlDeliveryKind = "wake" | "deliver";

export interface ControlDelivery {
	kind: ControlDeliveryKind;
	reason?: string;
	message?: string;
}

export type ControlReceiptState =
	| "delivered"
	| "consumed"
	| "missed"
	| "timeout"
	| "failed";

export interface ControlReceipt {
	deliveryId: string;
	state: ControlReceiptState;
	error?: string;
}

const HelloMessageSchema = Type.Object({
	v: Type.Literal(CONTROL_PROTOCOL_VERSION),
	kind: Type.Literal("hello"),
	runId: Type.String(),
	pid: Type.Integer(),
});

const AckMessageSchema = Type.Object({
	v: Type.Literal(CONTROL_PROTOCOL_VERSION),
	kind: Type.Literal("ack"),
	runId: Type.String(),
	deliveryId: Type.String(),
	state: Type.Union([
		Type.Literal("delivered"),
		Type.Literal("consumed"),
		Type.Literal("missed"),
	]),
});

const WakeMessageSchema = Type.Object({
	v: Type.Literal(CONTROL_PROTOCOL_VERSION),
	kind: Type.Literal("wake"),
	deliveryId: Type.String(),
	reason: Type.String(),
});

const DeliverMessageSchema = Type.Object({
	v: Type.Literal(CONTROL_PROTOCOL_VERSION),
	kind: Type.Literal("deliver"),
	deliveryId: Type.String(),
	message: Type.String(),
});

export type HelloMessage = Static<typeof HelloMessageSchema>;
export type AckMessage = Static<typeof AckMessageSchema>;
export type WakeMessage = Static<typeof WakeMessageSchema>;
export type DeliverMessage = Static<typeof DeliverMessageSchema>;

export type ChildToParentMessage = HelloMessage | AckMessage;
export type ParentToChildMessage = WakeMessage | DeliverMessage;

export function isChildToParentMessage(
	value: any,
): value is ChildToParentMessage {
	return (
		Value.Check(HelloMessageSchema, value) ||
		Value.Check(AckMessageSchema, value)
	);
}

export function isParentToChildMessage(
	value: any,
): value is ParentToChildMessage {
	return (
		Value.Check(WakeMessageSchema, value) ||
		Value.Check(DeliverMessageSchema, value)
	);
}

export function defaultControlSocketPath(pid: number): string {
	return join(tmpdir(), `pi-herdr-agents-control-${pid}.sock`);
}

interface WireDecoder {
	push: (chunk: string) => void;
	reset: () => void;
}

/** Split a stream into newline-delimited JSON messages; malformed lines drop. */
export function createWireDecoder(
	onMessage: (value: any) => void,
): WireDecoder {
	let buffer = "";
	return {
		push(chunk: string) {
			buffer += chunk;
			if (buffer.length > MAX_WIRE_LINE * 4) buffer = "";
			let index = buffer.indexOf("\n");
			while (index >= 0) {
				const line = buffer.slice(0, index);
				buffer = buffer.slice(index + 1);
				if (line.trim().length > 0) {
					try {
						onMessage(JSON.parse(line));
					} catch {
						// Receipts make silent drops visible; skip malformed lines.
					}
				}
				index = buffer.indexOf("\n");
			}
			if (buffer.length > MAX_WIRE_LINE) buffer = "";
		},
		reset() {
			buffer = "";
		},
	};
}

export function encodeWireMessage(
	value: ParentToChildMessage | ChildToParentMessage,
): string {
	return `${JSON.stringify(value)}\n`;
}

interface PendingReceipt {
	resolve: (receipt: ControlReceipt) => void;
	timer: ReturnType<typeof setTimeout>;
	accepted: ReadonlySet<string>;
}

interface ChildConnection {
	socket: Socket;
	pid: number;
}

/**
 * Parent-side server. One per parent process; children connect and announce
 * their runId. Survives /reload because the shared handle lives on globalThis.
 */
export class ControlServer {
	private server?: Server;
	private socketPath?: string;
	private readonly connections = new Map<string, ChildConnection>();
	private readonly pending = new Map<string, PendingReceipt>();

	constructor(
		handlers: {
			onChildConnect?: (runId: string, pid: number) => void;
			onChildDisconnect?: (runId: string, pid: number) => void;
		} = {},
	) {
		this.handlers = handlers;
	}

	private readonly handlers: {
		onChildConnect?: (runId: string, pid: number) => void;
		onChildDisconnect?: (runId: string, pid: number) => void;
	};

	get path(): string | undefined {
		return this.socketPath;
	}

	isConnected(runId: string): boolean {
		return this.connections.has(runId);
	}

	connectedRunIds(): string[] {
		return [...this.connections.keys()];
	}

	async start(path = defaultControlSocketPath(process.pid)): Promise<string> {
		if (this.server?.listening && this.socketPath) return this.socketPath;
		try {
			await this.listen(path);
		} catch (error) {
			// A stale socket file from a crashed parent holds the name. Only
			// reclaim it when nothing accepts a connection on it.
			// SAFETY: net server listen errors expose the Node errno code.
			if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
			await this.assertSocketFree(path);
			unlinkSync(path);
			await this.listen(path);
		}
		this.socketPath = path;
		return path;
	}

	private listen(path: string): Promise<void> {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const server = createServer((socket) => this.attachSocket(socket));
		this.server = server;
		server.once("error", reject);
		server.listen(path, () => {
			server.off("error", reject);
			// The channel is best-effort delivery; it must never keep a process
			// (parent, test, or CLI host) alive on its own.
			server.unref();
			resolve();
		});
		return promise;
	}

	private assertSocketFree(path: string): Promise<void> {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const probe = createConnection(path);
		probe.once("connect", () => {
			probe.destroy();
			reject(
				new Error(
					`Control socket ${path} is owned by another live parent process.`,
				),
			);
		});
		probe.once("error", () => {
			probe.destroy();
			resolve();
		});
		// A connect that hangs means a live but wedged server; treat as owned.
		probe.setTimeout(PROBE_TIMEOUT_MS, () => {
			probe.destroy();
			reject(new Error(`Control socket ${path} probe timed out.`));
		});
		return promise;
	}

	private attachSocket(socket: Socket): void {
		socket.unref();
		let runId: string | undefined;
		let pid = 0;
		const decoder = createWireDecoder((value) => {
			if (!isChildToParentMessage(value)) return;
			if (value.kind === "hello") {
				runId = value.runId;
				pid = value.pid;
				// A replacement child for the same run supersedes its old socket.
				this.connections.get(runId)?.socket.destroy();
				this.connections.set(runId, { socket, pid });
				this.handlers.onChildConnect?.(runId, pid);
				return;
			}
			const pending = this.pending.get(value.deliveryId);
			if (pending && pending.accepted.has(value.state)) {
				clearTimeout(pending.timer);
				this.pending.delete(value.deliveryId);
				pending.resolve({ deliveryId: value.deliveryId, state: value.state });
			}
		});
		socket.on("data", (chunk: Buffer) => decoder.push(chunk.toString("utf8")));
		socket.on("error", () => {
			// Registry cleanup happens on close.
		});
		socket.on("close", () => {
			const connection =
				runId === undefined ? undefined : this.connections.get(runId);
			if (runId !== undefined && connection?.socket === socket) {
				this.connections.delete(runId);
				this.handlers.onChildDisconnect?.(runId, pid);
			}
		});
	}

	/**
	 * Send one delivery to a connected child and wait for its receipt.
	 * `awaitConsumed` keeps the receipt open until the child reports it acted;
	 * otherwise the first ack ("delivered" or "consumed") resolves it.
	 */
	deliver(
		runId: string,
		delivery: ControlDelivery,
		options: { awaitConsumed?: boolean; timeoutMs?: number } = {},
	): Promise<ControlReceipt> {
		const connection = this.connections.get(runId);
		if (!connection) {
			return Promise.resolve({ deliveryId: "", state: "missed" });
		}
		const deliveryId = randomUUID();
		const timeoutMs = options.timeoutMs ?? DEFAULT_RECEIPT_TIMEOUT_MS;
		const accepted = options.awaitConsumed
			? new Set(["consumed"])
			: new Set(["delivered", "consumed"]);
		const { promise, resolve } = Promise.withResolvers<ControlReceipt>();
		const timer = setTimeout(() => {
			this.pending.delete(deliveryId);
			resolve({ deliveryId, state: "timeout" });
		}, timeoutMs);
		this.pending.set(deliveryId, { resolve, timer, accepted });
		const message: ParentToChildMessage =
			delivery.kind === "wake"
				? {
						v: CONTROL_PROTOCOL_VERSION,
						kind: "wake",
						deliveryId,
						reason: delivery.reason ?? "",
					}
				: {
						v: CONTROL_PROTOCOL_VERSION,
						kind: "deliver",
						deliveryId,
						message: delivery.message ?? "",
					};
		if (!connection.socket.write(encodeWireMessage(message))) {
			clearTimeout(timer);
			this.pending.delete(deliveryId);
			resolve({
				deliveryId,
				state: "failed",
				error: "socket write failed (backpressure or closing)",
			});
		}
		return promise;
	}

	async stop(): Promise<void> {
		const path = this.socketPath;
		const server = this.server;
		this.server = undefined;
		this.socketPath = undefined;
		for (const [deliveryId, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.resolve({ deliveryId, state: "failed", error: "server stopped" });
		}
		this.pending.clear();
		for (const [runId, { socket }] of this.connections) {
			socket.destroy();
			this.connections.delete(runId);
			this.handlers.onChildDisconnect?.(runId, 0);
		}
		if (server) {
			const { promise, resolve } = Promise.withResolvers<void>();
			server.close(() => resolve());
			await promise;
		}
		if (path && existsSync(path)) {
			try {
				unlinkSync(path);
			} catch {
				// Best effort; a stale file is reclaimed by the next start().
			}
		}
	}
}

type ControlServerSlot = typeof globalThis & {
	[CONTROL_SERVER_SLOT]?: ControlServer;
};

/** Shared server handle for the parent process; survives extension reloads. */
function controlServerSlot(): ControlServerSlot {
	// SAFETY: ControlServerSlot adds exactly one optional slot to the global
	// object; this module is its sole reader and writer.
	return globalThis as ControlServerSlot;
}

export function getSharedControlServer(): ControlServer | undefined {
	return controlServerSlot()[CONTROL_SERVER_SLOT];
}

export async function startSharedControlServer(
	path = defaultControlSocketPath(process.pid),
): Promise<ControlServer> {
	const existing = getSharedControlServer();
	if (existing) {
		await existing.start(path);
		return existing;
	}
	const server = new ControlServer();
	await server.start(path);
	controlServerSlot()[CONTROL_SERVER_SLOT] = server;
	return server;
}

export async function stopSharedControlServer(): Promise<void> {
	const server = getSharedControlServer();
	if (!server) return;
	controlServerSlot()[CONTROL_SERVER_SLOT] = undefined;
	await server.stop();
}

/**
 * Child-side client. Connects (with reconnect) and reports receipts.
 * `onDelivery` returns true when the child acted on the delivery, which is
 * acknowledged as "consumed"; false acknowledges "delivered" without action.
 */
export class ControlClient {
	private socket?: Socket;
	private stopped = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: {
		socketPath: string;
		runId: string;
		pid?: number;
		onDelivery: (delivery: ControlDelivery) => boolean | Promise<boolean>;
		reconnectDelayMs?: number;
	}) {
		this.options = options;
	}

	private readonly options: {
		socketPath: string;
		runId: string;
		pid?: number;
		onDelivery: (delivery: ControlDelivery) => boolean | Promise<boolean>;
		reconnectDelayMs?: number;
	};

	connect(): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>();
		if (this.stopped) {
			resolve();
			return promise;
		}
		const socket = createConnection(this.options.socketPath);
		this.socket = socket;
		socket.unref();
		socket.on("connect", () => {
			const hello: HelloMessage = {
				v: CONTROL_PROTOCOL_VERSION,
				kind: "hello",
				runId: this.options.runId,
				pid: this.options.pid ?? process.pid,
			};
			socket.write(encodeWireMessage(hello));
			resolve();
		});
		const decoder = createWireDecoder((value) => {
			if (!isParentToChildMessage(value)) return;
			const delivery: ControlDelivery =
				value.kind === "wake"
					? { kind: "wake", reason: value.reason }
					: { kind: "deliver", message: value.message };
			void this.ackDelivery(socket, value.deliveryId, delivery);
		});
		socket.on("data", (chunk: Buffer) => decoder.push(chunk.toString("utf8")));
		socket.on("error", () => {
			// Reconnect path owns recovery.
		});
		socket.on("close", () => {
			if (this.stopped) return;
			this.socket = undefined;
			this.reconnectTimer = setTimeout(
				() => void this.connect(),
				this.options.reconnectDelayMs ?? 1000,
			);
			this.reconnectTimer.unref?.();
		});
		return promise;
	}

	private async ackDelivery(
		socket: Socket,
		deliveryId: string,
		delivery: ControlDelivery,
	): Promise<void> {
		let acted = false;
		try {
			acted = await this.options.onDelivery(delivery);
		} catch {
			acted = false;
		}
		const ack: AckMessage = {
			v: CONTROL_PROTOCOL_VERSION,
			kind: "ack",
			runId: this.options.runId,
			deliveryId,
			state: acted ? "consumed" : "delivered",
		};
		socket.write(encodeWireMessage(ack));
	}

	stop(): void {
		this.stopped = true;
		clearTimeout(this.reconnectTimer);
		this.socket?.destroy();
		this.socket = undefined;
	}
}
