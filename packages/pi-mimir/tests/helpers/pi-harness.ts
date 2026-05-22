/**
 * Test harness for Pi extension testing.
 *
 * Provides a controllable fake ExtensionAPI for wiring extension handlers,
 * emitting events, and inspecting side effects (sendMessage, notify, etc.).
 *
 * Usage:
 *   const harness = createHarness();
 *   import extension from "../extensions/openspec/index.js";
 *   extension(harness.pi);
 *   await harness.emit("session_start", { cwd: "/tmp/project" });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentMessage {
	customType: string;
	content: string;
	display?: boolean;
	details?: unknown;
}

export interface Notification {
	message: string;
	level: "info" | "warning" | "error";
}

export interface FlagDef {
	description?: string;
	type: "boolean" | "string";
	default?: boolean | string;
}

export interface CommandDef {
	description?: string;
	handler: (args: string, ctx: any) => Promise<void>;
}

export interface ExecStub {
	code: number;
	stdout: string;
	stderr: string;
}

export interface HarnessOptions {
	/** Stubs for pi.exec. Keyed by `${cmd} ${args.join(" ")}` or a predicate. */
	execStubs?: Record<string, ExecStub | ((cmd: string, args: string[]) => Promise<ExecStub>)>;
	/** Initial flag values */
	flagValues?: Record<string, boolean | string>;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export function createHarness(options: HarnessOptions = {}) {
	const handlers = new Map<string, Function[]>();
	const commands = new Map<string, CommandDef>();
	const flags = new Map<string, FlagDef>();
	const messageRenderers = new Map<string, Function>();
	const flagValues = new Map<string, boolean | string>(Object.entries(options.flagValues ?? {}));

	const sentMessages: SentMessage[] = [];
	const notifications: Notification[] = [];
	const execCalls: Array<{ cmd: string; args: string[] }> = [];

	for (const [k, v] of Object.entries(options.flagValues ?? {})) {
		flagValues.set(k, v);
	}

	const ctx: Record<string, any> = {
		cwd: "/tmp/test-project",
		hasUI: true,
		ui: {
			notify(message: string, level: "info" | "warning" | "error" = "info") {
				notifications.push({ message, level });
			},
			async confirm(_title: string, _body: string) {
				return true;
			},
			async select(_title: string, _options: string[]) {
				return undefined;
			},
			async input(_title: string, _placeholder?: string) {
				return undefined;
			},
			setStatus() {},
			setWidget() {},
			pasteToEditor() {},
			setEditorText() {},
			getEditorText() {
				return "";
			},
		},
	};

	const pi: any = {
		on(name: string, handler: Function) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerCommand(name: string, def: CommandDef) {
			commands.set(name, def);
		},
		registerFlag(name: string, def: FlagDef) {
			flags.set(name, def);
		},
		getFlag(name: string) {
			return flagValues.get(name);
		},
		sendMessage(msg: SentMessage) {
			sentMessages.push(msg);
		},
		async exec(cmd: string, args: string[], _opts?: any): Promise<any> {
			execCalls.push({ cmd, args: [...args] });
			const key = `${cmd} ${args.join(" ")}`;
			if (options.execStubs?.[key]) {
				const stub = options.execStubs[key]!;
				if (typeof stub === "function") {
					const r = await stub(cmd, args);
					return { killed: false, ...r };
				}
				return { killed: false, ...stub };
			}
			// Default: return empty success
			return { code: 0, stdout: "", stderr: "", killed: false };
		},
		registerTool() {},
		registerShortcut() {},
		registerMessageRenderer(name: string, renderer: Function) {
			messageRenderers.set(name, renderer);
		},
		appendEntry() {},
		events: {
			on() {},
			off() {},
			emit() {},
		},
	};

	async function emit(name: string, eventOverrides: Record<string, any> = {}, ctxOverrides: Record<string, any> = {}): Promise<any> {
		const event = { type: name, ...eventOverrides };
		const mergedCtx = { ...ctx, ...ctxOverrides };
		let lastResult: any;
		for (const handler of handlers.get(name) ?? []) {
			lastResult = await handler(event, mergedCtx);
		}
		return lastResult;
	}

	return {
		pi,
		ctx,
		emit,
		handlers,
		commands,
		flags,
		messageRenderers,
		sentMessages,
		notifications,
		execCalls,
		flagValues,
		/** Reset all captured output */
		reset() {
			sentMessages.length = 0;
			notifications.length = 0;
			execCalls.length = 0;
		},
	};
}
