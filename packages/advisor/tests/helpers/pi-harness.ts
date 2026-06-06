import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type CommandDef = { handler: (args: string, ctx: ExtensionContext) => Promise<void> | void; [key: string]: unknown };
type ToolDef = { name: string; execute: (...args: unknown[]) => Promise<unknown> | unknown; [key: string]: unknown };
type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => Promise<unknown> | unknown;
type TestModel = Model<Api> & { name?: string; reasoning?: boolean };

export interface ExecStub {
	code: number;
	stdout: string;
	stderr: string;
}

export interface HarnessOptions {
	execStubs?: Record<string, ExecStub | ((cmd: string, args: string[]) => Promise<ExecStub>)>;
	flagValues?: Record<string, boolean | string>;
	toolNames?: string[];
	availableModels?: TestModel[];
	currentModel?: TestModel;
	thinkingLevel?: string;
	sessionFile?: string;
	leafId?: string | null;
}

export function createHarness(options: HarnessOptions = {}) {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, CommandDef>();
	const tools = new Map<string, ToolDef>();
	const notifications: Array<{ message: string; level: "info" | "warning" | "error" }> = [];
	const execCalls: Array<{ cmd: string; args: string[] }> = [];
	let activeTools = [...(options.toolNames ?? [])];

	const ctx = {
		cwd: "/tmp/test-project",
		hasUI: true,
		model: options.currentModel,
		ui: {
			notify(message: string, level: "info" | "warning" | "error" = "info") {
				notifications.push({ message, level });
			},
			custom: async () => null,
		},
		modelRegistry: {
			getAvailable: () => options.availableModels ?? [],
			find: (provider: string, id: string) => (options.availableModels ?? []).find((model) => model.provider === provider && model.id === id),
			getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: "key", headers: {} }),
		},
		sessionManager: {
			getSessionFile: () => options.sessionFile,
			getLeafId: () => options.leafId ?? "leaf-1",
			getSessionDir: () => "/tmp/test-sessions",
			getEntries: () => [],
		},
	} as unknown as ExtensionContext;

	const pi = {
		on(name: string, handler: Handler) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerCommand(name: string, def: CommandDef) {
			commands.set(name, def);
		},
		registerTool(def: ToolDef) {
			tools.set(def.name, def);
		},
		getActiveTools() {
			return [...activeTools];
		},
		setActiveTools(names: string[]) {
			activeTools = [...names];
		},
		getThinkingLevel() {
			return options.thinkingLevel ?? "high";
		},
		getAllTools() {
			return [];
		},
		async exec(cmd: string, args: string[]) {
			execCalls.push({ cmd, args: [...args] });
			const key = `${cmd} ${args.join(" ")}`;
			const stub = options.execStubs?.[key];
			if (typeof stub === "function") return stub(cmd, args);
			if (stub) return stub;
			return { code: 0, stdout: "", stderr: "" };
		},
	} as unknown as ExtensionAPI;

	async function emit(name: string, eventOverrides: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
		const event = { type: name, ...eventOverrides };
		const mergedCtx = { ...ctx, ...ctxOverrides } as ExtensionContext;
		let last: unknown;
		for (const handler of handlers.get(name) ?? []) {
			last = await handler(event, mergedCtx);
		}
		return last;
	}

	return {
		pi,
		ctx,
		handlers,
		commands,
		tools,
		notifications,
		execCalls,
		emit,
		get activeTools() {
			return [...activeTools];
		},
		setCurrentModel(model: TestModel) {
			(ctx as { model?: TestModel }).model = model;
		},
		setSessionFile(path: string | undefined) {
			(ctx.sessionManager as { getSessionFile: () => string | undefined }).getSessionFile = () => path;
		},
	};
}
