export interface ExecStub {
	code: number;
	stdout: string;
	stderr: string;
}

export interface HarnessOptions {
	execStubs?: Record<string, ExecStub | ((cmd: string, args: string[]) => Promise<ExecStub>)>;
	flagValues?: Record<string, boolean | string>;
	toolNames?: string[];
	availableModels?: any[];
	currentModel?: any;
	thinkingLevel?: string;
	sessionFile?: string;
	leafId?: string | null;
}

export function createHarness(options: HarnessOptions = {}) {
	const handlers = new Map<string, Function[]>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	const notifications: Array<{ message: string; level: "info" | "warning" | "error" }> = [];
	const execCalls: Array<{ cmd: string; args: string[] }> = [];
	let activeTools = [...(options.toolNames ?? [])];

	const ctx: any = {
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
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key", headers: {} }),
		},
		sessionManager: {
			getSessionFile: () => options.sessionFile,
			getLeafId: () => options.leafId ?? "leaf-1",
			getSessionDir: () => "/tmp/test-sessions",
		},
	};

	const pi: any = {
		on(name: string, handler: Function) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerCommand(name: string, def: any) {
			commands.set(name, def);
		},
		registerTool(def: any) {
			tools.set(def.name, def);
		},
		getActiveTools() {
			return [...activeTools];
		},
		setActiveTools(names: string[]) {
			activeTools = [...names];
		},
		getThinkingLevel() {
			return (options.thinkingLevel ?? "high") as any;
		},
		async exec(cmd: string, args: string[]) {
			execCalls.push({ cmd, args: [...args] });
			const key = `${cmd} ${args.join(" ")}`;
			const stub = options.execStubs?.[key];
			if (typeof stub === "function") return stub(cmd, args);
			if (stub) return stub;
			return { code: 0, stdout: "", stderr: "" };
		},
	};

	async function emit(name: string, eventOverrides: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
		const event = { type: name, ...eventOverrides };
		const mergedCtx = { ...ctx, ...ctxOverrides };
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
		setCurrentModel(model: any) {
			ctx.model = model;
		},
		setSessionFile(path: string | undefined) {
			ctx.sessionManager.getSessionFile = () => path;
		},
	};
}
