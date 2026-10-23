import { describe, expect, it } from "vitest";
import {
	ask,
	DreddError,
	parseReply,
	pickKey,
	resolveEndpoint,
	validate,
	type Questions,
} from "../lib/jev";

const N: Questions = {
	risky: { type: "noul", instructions: "Is this irreversible?" },
};

function okBody(answers: unknown): string {
	return JSON.stringify({ answers, usage: { input_tokens: 42 } });
}

describe("resolveEndpoint", () => {
	it("resolves registry names", () => {
		const ep = resolveEndpoint({ backend: "typesafe" }, {});
		expect(ep.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(ep.keyEnv).toBe("TYPESAFE_API_KEY");
	});

	it("resolves a custom https endpoint with its own key var", () => {
		const ep = resolveEndpoint(
			{ backend: { label: "corp", host: "https://gw.example.com", path: "/judge/systemone", keyEnv: "GW_KEY", defaultModel: "jev-1.13" } },
			{},
		);
		expect(ep.url).toBe("https://gw.example.com/judge/systemone");
		expect(ep.model).toBe("jev-1.13");
		expect(ep.label).toBe("corp");
	});

	it("allows loopback http", () => {
		const ep = resolveEndpoint({ backend: { label: "local", host: "http://localhost:8080", keyEnv: "LOCAL_JUDGE_KEY" } }, {});
		expect(ep.url).toBe("http://localhost:8080/v1/systemone");
	});

	it("allows remote http: transport is the operator's choice", () => {
		const ep = resolveEndpoint({ backend: { label: "lan", host: "http://192.168.1.50:8080", keyEnv: "LAN_JUDGE_KEY" } }, {});
		expect(ep.url).toBe("http://192.168.1.50:8080/v1/systemone");
	});

	it("rejects host with a path", () => {
		expect(() => resolveEndpoint({ backend: { label: "x", host: "https://gw.example.com/judge", keyEnv: "X_KEY" } }, {})).toThrow(DreddError);
	});

	it("rejects TYPESAFE_API_KEY as custom keyEnv", () => {
		expect(() =>
			resolveEndpoint({ backend: { label: "x", host: "https://gw.example.com", keyEnv: "typesafe_api_key" } }, {}),
		).toThrow(/must not be TYPESAFE_API_KEY/);
	});

	it("rejects unknown registry name", () => {
		expect(() => resolveEndpoint({ backend: "nope" }, {})).toThrow(/unknown backend/);
	});
});

describe("pickKey", () => {
	it("prefers config apiKey over env", () => {
		const ep = resolveEndpoint({ backend: "typesafe" }, {});
		const key = pickKey(ep, "cfg-key", { TYPESAFE_API_KEY: "env-key" });
		expect(key?.key).toBe("cfg-key");
		expect(key?.source).toBe("config apiKey");
	});

	it("falls back to the backend env var", () => {
		const ep = resolveEndpoint({ backend: "typesafe" }, {});
		const key = pickKey(ep, undefined, { TYPESAFE_API_KEY: "env-key" });
		expect(key?.key).toBe("env-key");
		expect(key?.model).toBe("jev-latest");
	});

	it("returns null with no key anywhere", () => {
		const ep = resolveEndpoint({ backend: "typesafe" }, {});
		expect(pickKey(ep, undefined, {})).toBeNull();
	});
});

describe("validate", () => {
	it("accepts a noul probability", () => {
		const out = validate({ answers: { risky: { type: "noul", noul: 0.97 } } }, N);
		expect(out.risky).toEqual({ type: "noul", noul: 0.97 });
	});

	it("rejects a noul outside 0..1", () => {
		expect(() => validate({ answers: { risky: { type: "noul", noul: 1.4 } } }, N)).toThrow(DreddError);
	});

	it("rejects a missing answer", () => {
		expect(() => validate({ answers: {} }, N)).toThrow(/missing or mistyped answer/);
	});

	it("rejects a choice outside the sent labels", () => {
		const q: Questions = { pick: { type: "choice", instructions: "which?", criteria: { a: "A", b: "B" } } };
		expect(() => validate({ answers: { pick: { type: "choice", choice: "c", confidence: 0.9 } } }, q)).toThrow(/unknown choice label/);
	});

	it("accepts a choice from the labels with confidence", () => {
		const q: Questions = { pick: { type: "choice", instructions: "which?", criteria: { a: "A", b: "B" } } };
		const out = validate({ answers: { pick: { type: "choice", choice: "a", confidence: 0.9 } } }, q);
		expect(out.pick).toEqual({ type: "choice", choice: "a", confidence: 0.9 });
	});

	it("bounds a score to the rubric length", () => {
		const q: Questions = { sev: { type: "score", instructions: "how bad?", criteria: ["low", "high"] } };
		expect(validate({ answers: { sev: { type: "score", score: 1 } } }, q).sev).toEqual({ type: "score", score: 1 });
		expect(() => validate({ answers: { sev: { type: "score", score: 2 } } }, q)).toThrow(/within 0\.\.1/);
	});
});

describe("parseReply", () => {
	it("parses answers and token usage", () => {
		const { answers, inputTokens } = parseReply({ ok: true, status: 200, text: okBody({ risky: { type: "noul", noul: 0.5 } }) }, N);
		expect(answers.risky?.type).toBe("noul");
		expect(inputTokens).toBe(42);
	});

	it("throws on HTTP error status", () => {
		expect(() => parseReply({ ok: false, status: 401, text: "denied" }, N)).toThrow(/HTTP 401/);
	});

	it("throws on non-JSON", () => {
		expect(() => parseReply({ ok: true, status: 200, text: "<html>" }, N)).toThrow(/not JSON/);
	});
});

describe("ask", () => {
	it("sends the systemOne body and returns validated answers", async () => {
		let capturedBody: unknown;
		let capturedUrl: string | undefined;
		let capturedAuth: string | undefined;
		const fakeFetch: typeof fetch = async (url, init) => {
			capturedUrl = String(url);
			capturedAuth = (init?.headers as Record<string, string>).authorization;
			capturedBody = JSON.parse(String(init?.body));
			return new Response(okBody({ risky: { type: "noul", noul: 0.91 } }), { status: 200 });
		};
		const result = await ask({ backend: "typesafe", apiKey: "k" }, { command: "rm -rf /" }, N, {}, fakeFetch);
		expect(capturedUrl).toBe("https://api.typesafe.ai/v1/systemone");
		expect(capturedAuth).toBe("Bearer k");
		expect(capturedBody).toEqual({ model: "jev-latest", state: { command: "rm -rf /" }, questions: N });
		expect(result.answers.risky).toEqual({ type: "noul", noul: 0.91 });
		expect(result.inputTokens).toBe(42);
	});

	it("throws noKey when nothing resolves", async () => {
		await expect(ask({ backend: "typesafe" }, {}, N, {}, (async () => new Response()) as typeof fetch)).rejects.toThrow(DreddError);
	});

	it("routes to a custom endpoint with per-request model when defaultModel is absent", async () => {
		let capturedUrl: string | undefined;
		let capturedBody: Record<string, unknown> | undefined;
		const fakeFetch: typeof fetch = async (url, init) => {
			capturedUrl = String(url);
			capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			return new Response(okBody({ risky: { type: "noul", noul: 0.1 } }), { status: 200 });
		};
		await ask(
			{ backend: { label: "local", host: "http://localhost:8080", keyEnv: "LOCAL_JUDGE_KEY" }, model: "our-decision-model" },
			{},
			N,
			{ LOCAL_JUDGE_KEY: "k2" },
			fakeFetch,
		);
		expect(capturedUrl).toBe("http://localhost:8080/v1/systemone");
		expect(capturedBody?.model).toBe("our-decision-model");
	});

	it("fails on timeout rather than blocking", async () => {
		const slowFetch: typeof fetch = (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
			});
		await expect(ask({ backend: "typesafe", apiKey: "k", timeoutMs: 50 }, {}, N, {}, slowFetch)).rejects.toThrow();
	});
});

describe("host credential reuse", () => {
	const okFetch = (capture: { auth?: string }): typeof fetch =>
		(_url, init) => {
			capture.auth = (init?.headers as Record<string, string>).authorization;
			return Promise.resolve(new Response(okBody({ risky: { type: "noul", noul: 0.5 } }), { status: 200 }));
		};

	it("uses the runtime's stored key when no env key is set", async () => {
		const capture: { auth?: string } = {};
		let askedProvider: string | undefined;
		await ask(
			{ backend: "typesafe", keyResolver: async provider => { askedProvider = provider; return "host-key"; } },
			{},
			N,
			{},
			okFetch(capture),
		);
		expect(askedProvider).toBe("typesafe");
		expect(capture.auth).toBe("Bearer host-key");
	});

	it("an env key wins over the runtime store", async () => {
		const capture: { auth?: string } = {};
		let resolverCalls = 0;
		await ask(
			{ backend: "openrouter", keyResolver: async () => { resolverCalls++; return "host-key"; } },
			{},
			N,
			{ OPENROUTER_API_KEY: "env-key" },
			okFetch(capture),
		);
		expect(capture.auth).toBe("Bearer env-key");
		expect(resolverCalls).toBe(0);
	});

	it("a custom endpoint borrows the runtime key only when it names a provider", async () => {
		let resolverCalls = 0;
		const resolver = async (): Promise<string | undefined> => { resolverCalls++; return "host-key"; };
		await expect(
			ask(
				{ backend: { label: "corp", host: "https://gw.example.com", keyEnv: "GW_KEY", defaultModel: "m" }, keyResolver: resolver },
				{},
				N,
				{},
				okFetch({}),
			),
		).rejects.toThrow(DreddError);
		expect(resolverCalls).toBe(0);

		const capture: { auth?: string } = {};
		let askedProvider: string | undefined;
		await ask(
			{
				backend: { label: "corp", host: "https://gw.example.com", defaultModel: "m", provider: "openrouter" },
				keyResolver: async provider => { askedProvider = provider; return "host-key"; },
			},
			{},
			N,
			{},
			okFetch(capture),
		);
		expect(askedProvider).toBe("openrouter");
		expect(capture.auth).toBe("Bearer host-key");
	});

	it("a registry key still beats a custom endpoint's own provider", async () => {
		const capture: { auth?: string } = {};
		await ask(
			{
				backend: { label: "corp", host: "https://gw.example.com", keyEnv: "GW_KEY", defaultModel: "m", provider: "openrouter" },
				keyResolver: async () => "host-key",
			},
			{},
			N,
			{ GW_KEY: "gw-key" },
			okFetch(capture),
		);
		expect(capture.auth).toBe("Bearer gw-key");
	});

	it("rejects an empty provider id", () => {
		expect(() => resolveEndpoint({ backend: { label: "corp", host: "https://gw.example.com", provider: "  " } }, {})).toThrow(DreddError);
	});

	it("falls through to noKey when the runtime has no key either", async () => {
		await expect(
			ask({ backend: "typesafe", keyResolver: async () => undefined }, {}, N, {}, okFetch({})),
		).rejects.toThrow(DreddError);
	});
});

describe("keyless local judge", () => {
	it("resolves a backend without keyEnv and sends no auth header", async () => {
		const ep = resolveEndpoint({ backend: { label: "euclides", host: "http://euclides:8000", defaultModel: "internlm/Intern-Decision-4B" } }, {});
		expect(ep.url).toBe("http://euclides:8000/v1/systemone");
		expect(ep.keyEnv).toBeUndefined();

		let capturedAuth: string | undefined;
		let capturedModel: string | undefined;
		const fakeFetch: typeof fetch = (_url, init) => {
			capturedAuth = (init?.headers as Record<string, string>).authorization;
			capturedModel = (JSON.parse(String(init?.body)) as { model: string }).model;
			return Promise.resolve(new Response(okBody({ risky: { type: "noul", noul: 0.2 } }), { status: 200 }));
		};
		const result = await ask({ backend: { label: "euclides", host: "http://euclides:8000", defaultModel: "internlm/Intern-Decision-4B" } }, {}, N, {}, fakeFetch);
		expect(capturedAuth).toBeUndefined();
		expect(capturedModel).toBe("internlm/Intern-Decision-4B");
		expect(result.answers.risky).toEqual({ type: "noul", noul: 0.2 });
	});
});