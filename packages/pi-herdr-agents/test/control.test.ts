import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
	ControlClient,
	ControlServer,
	createWireDecoder,
	defaultControlSocketPath,
	type ControlDelivery,
} from "../pi-extension/subagents/control.ts";

const testDir = mkdtempSync(join(tmpdir(), "pi-herdr-control-test-"));

const servers: ControlServer[] = [];
const clients: ControlClient[] = [];
let socketCounter = 0;

function nextSocketPath(): string {
	socketCounter += 1;
	return join(testDir, `control-${socketCounter}.sock`);
}

function makeServer(onChildConnect?: (runId: string) => void): ControlServer {
	const server = new ControlServer({
		onChildConnect: (runId, _pid) => onChildConnect?.(runId),
	});
	servers.push(server);
	return server;
}

function makeClient(
	socketPath: string,
	onDelivery: (delivery: ControlDelivery) => boolean,
	runId: string,
): ControlClient {
	const client = new ControlClient({
		socketPath,
		runId,
		onDelivery,
		reconnectDelayMs: 50,
	});
	clients.push(client);
	return client;
}

/** Real wall-clock poll: socket reconnect timing only exists on the real clock. */
async function untilTrue(
	check: () => boolean,
	attempts: number,
	intervalMs: number,
): Promise<boolean> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (check()) return true;
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, intervalMs);
		await promise;
	}
	return check();
}

async function startConnected(
	onDelivery: (delivery: ControlDelivery) => boolean,
	runId: string,
): Promise<{
	socketPath: string;
	server: ControlServer;
	client: ControlClient;
}> {
	const socketPath = nextSocketPath();
	const { promise, resolve } = Promise.withResolvers<void>();
	const server = makeServer(resolve);
	await server.start(socketPath);
	const client = makeClient(socketPath, onDelivery, runId);
	void client.connect();
	await promise;
	return { socketPath, server, client };
}

after(async () => {
	for (const client of clients) client.stop();
	for (const server of servers) await server.stop();
	rmSync(testDir, { recursive: true, force: true });
});

describe("wire decoder", () => {
	it("splits newline-delimited messages across chunk boundaries", () => {
		const seen: unknown[] = [];
		const decoder = createWireDecoder((value) => seen.push(value));
		decoder.push('{"v":1,"kind":"hel');
		decoder.push('lo","runId":"a","pid":1}\n{"v":1,"kin');
		decoder.push(
			'd":"ack","runId":"a","deliveryId":"d","state":"delivered"}\n',
		);
		assert.equal(seen.length, 2);
	});

	it("drops malformed lines without failing the stream", () => {
		const seen: unknown[] = [];
		const decoder = createWireDecoder((value) => seen.push(value));
		decoder.push('not json\n\n{"v":1}\n');
		assert.equal(seen.length, 1);
	});
});

describe("control server and client", () => {
	it("registers a child on hello", async () => {
		const { server } = await startConnected(() => false, "run-hello");
		assert.ok(server.isConnected("run-hello"));
		assert.deepEqual(server.connectedRunIds(), ["run-hello"]);
	});

	it("reports missed when the run has no connection", async () => {
		const server = makeServer();
		await server.start(nextSocketPath());
		const receipt = await server.deliver("nope", {
			kind: "wake",
			reason: "inbox",
		});
		assert.equal(receipt.state, "missed");
	});

	it("resolves a consumed receipt when the child acts", async () => {
		const { server } = await startConnected(() => true, "run-consume");
		const receipt = await server.deliver(
			"run-consume",
			{ kind: "wake", reason: "inbox" },
			{ awaitConsumed: true, timeoutMs: 1000 },
		);
		assert.equal(receipt.state, "consumed");
	});

	it("resolves delivered when the child receives but does not act", async () => {
		const { server } = await startConnected(() => false, "run-idle");
		const receipt = await server.deliver(
			"run-idle",
			{ kind: "wake", reason: "inbox" },
			{ awaitConsumed: false, timeoutMs: 1000 },
		);
		assert.equal(receipt.state, "delivered");
	});

	it("times out when the child never acknowledges", async () => {
		// Receipt expiry is real wall-clock behavior under test.
		const { server } = await startConnected(
			() =>
				new Promise<boolean>(() => {
					// Never settles.
				}),
			"run-hang",
		);
		const receipt = await server.deliver(
			"run-hang",
			{ kind: "wake", reason: "inbox" },
			{ awaitConsumed: true, timeoutMs: 150 },
		);
		assert.equal(receipt.state, "timeout");
	});

	it("reclaims a stale socket file from a crashed parent", async () => {
		const socketPath = nextSocketPath();
		writeFileSync(socketPath, "");
		const server = makeServer();
		await server.start(socketPath);
		assert.equal(server.path, socketPath);
	});

	it("refuses to steal a socket owned by a live parent", async () => {
		const socketPath = nextSocketPath();
		const owner = makeServer();
		await owner.start(socketPath);
		const intruder = new ControlServer();
		servers.push(intruder);
		await assert.rejects(
			intruder.start(socketPath),
			/owned by another live parent/,
		);
	});

	it("reconnects after the server restarts on the same path", async () => {
		const socketPath = nextSocketPath();
		const first = makeServer();
		await first.start(socketPath);
		const client = makeClient(socketPath, () => true, "run-reconnect");
		void client.connect();
		assert.ok(
			await untilTrue(() => first.isConnected("run-reconnect"), 20, 25),
			"client never registered with the first server",
		);
		await first.stop();
		const second = makeServer();
		await second.start(socketPath);
		assert.ok(
			await untilTrue(() => second.isConnected("run-reconnect"), 40, 50),
			"client did not reconnect after server restart",
		);
		const receipt = await second.deliver(
			"run-reconnect",
			{ kind: "wake", reason: "inbox" },
			{ awaitConsumed: true, timeoutMs: 1000 },
		);
		assert.equal(receipt.state, "consumed");
	});

	it("removes its socket file on stop", async () => {
		const path = defaultControlSocketPath(0);
		const server = new ControlServer();
		await server.start(path);
		await server.stop();
		assert.ok(!existsSync(path));
	});
});
