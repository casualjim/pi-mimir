/**
 * The decisions wire: which endpoint, which key, a strict answer check, reply
 * parsing. Pure and dependency-free so tests run hermetically with an injected
 * fetch. The protocol is the Jev "systemOne" shape: POST {model, state,
 * questions} -> {answers, usage}. Failures never block a guarded call; every
 * caller treats an error as "no answer" and passes through.
 */

export type Question =
	| { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
	| { type: "choice"; instructions: string; criteria: Record<string, string> }
	| { type: "score"; instructions: string; criteria: string[] };

export type Questions = Record<string, Question>;

export type Answer =
	| { type: "noul"; noul: number }
	| { type: "score"; score: number; confidence?: number }
	| { type: "choice"; choice: string; confidence: number };

export type Answers = Record<string, Answer>;

export interface BackendConfig {
	/** Registry name or custom endpoint object. */
	backend: string | CustomBackend;
}

export interface CustomBackend {
	label: string;
	/** Absolute origin; scheme is the operator's choice. */
	host: string;
	/** Judgment path; defaults to "/v1/systemone". */
	path?: string;
	/** Env var holding the key; absent means a keyless local judge. Never TYPESAFE_API_KEY. */
	keyEnv?: string;
	/** Model sent on the wire; when absent the caller must pass model per request. */
	defaultModel?: string;
	/** Host provider id whose stored credential authenticates this endpoint, e.g. "openrouter". */
	provider?: string;
}

/** Host credential lookup: the agent runtime's own store, keyed by provider id. */
export type KeyResolver = (provider: string) => Promise<string | undefined>;

interface ResolvedEndpoint {
	url: string;
	keyEnv?: string;
	model?: string;
	label: string;
	/** Registry backend name, or a custom backend's declared provider. */
	provider?: string;
}

export const REGISTRY: Record<string, { host: string; path: string; keyEnv: string; model: string }> = {
	typesafe: { host: "https://api.typesafe.ai", path: "/v1/systemone", keyEnv: "TYPESAFE_API_KEY", model: "jev-latest" },
	openrouter: { host: "https://openrouter.ai", path: "/api/alpha/decisions", keyEnv: "OPENROUTER_API_KEY", model: "~typesafe/jev-latest" },
};

export class DreddError extends Error {
	/** True when the cause is a missing key, so callers can distinguish "unconfigured" from "broken". */
	readonly noKey: boolean;
	constructor(message: string, noKey = false) {
		super(message);
		this.noKey = noKey;
	}
}

/**
 * Validate a custom backend's shape only: origin-only host, valid keyEnv
 * identifier that is never TYPESAFE_API_KEY. Transport choice (http vs
 * https) is the operator's; a custom endpoint is explicit config.
 */
export function resolveEndpoint(config: BackendConfig, env: NodeJS.ProcessEnv): ResolvedEndpoint {
	const backend = config.backend;
	if (typeof backend === "string") {
		const entry = REGISTRY[backend];
		if (!entry) throw new DreddError(`unknown backend: ${backend}`);
		return { url: entry.host + entry.path, keyEnv: entry.keyEnv, model: entry.model, label: backend, provider: backend };
	}
	const host = URL.parse(backend.host);
	if (!host) throw new DreddError(`backend host is not a URL: ${backend.host}`);
	if (host.pathname !== "/" && host.pathname !== "") throw new DreddError("backend host must be an origin, no path");
	if (host.username || host.search || host.hash) throw new DreddError("backend host must carry no userinfo, query, or fragment");
	// A missing keyEnv means a keyless local judge: no auth header, no crash.
	if (backend.keyEnv !== undefined) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(backend.keyEnv)) throw new DreddError(`backend keyEnv is not an identifier: ${backend.keyEnv}`);
		if (backend.keyEnv.toUpperCase() === "TYPESAFE_API_KEY") {
			throw new DreddError("backend keyEnv must not be TYPESAFE_API_KEY: give this endpoint its own variable");
		}
	}
	// provider is a lookup key into the host's credential store: reject junk here, not at the call.
	if (backend.provider !== undefined && (typeof backend.provider !== "string" || backend.provider.trim().length === 0)) {
		throw new DreddError("backend provider must be a non-empty provider id");
	}
	const path = backend.path ?? "/v1/systemone";
	if (!path.startsWith("/") || path.includes("?") || path.includes("#")) throw new DreddError("backend path must start with / and carry no query or fragment");
	return {
		url: backend.host.replace(/\/$/, "") + path,
		keyEnv: backend.keyEnv,
		model: backend.defaultModel,
		label: backend.label || backend.host,
		provider: backend.provider,
	};
}

/** Config apiKey, then the backend's keyEnv. The model goes with the endpoint. */
export function pickKey(endpoint: ResolvedEndpoint, apiKey: string | undefined, env: NodeJS.ProcessEnv): { key: string; model: string; source: string } | null {
	if (apiKey) return { key: apiKey, model: endpoint.model ?? "", source: "config apiKey" };
	const fromEnv = endpoint.keyEnv === undefined ? undefined : env[endpoint.keyEnv]?.trim();
	if (fromEnv) return { key: fromEnv, model: endpoint.model ?? "", source: `env ${endpoint.keyEnv}` };
	return null;
}

const unit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Every question answered with its type and a probability; a choice only from our labels. Keeps validated fields only. */
export function validate(data: unknown, questions: Questions): Answers {
	const answers = (data as { answers?: unknown } | null)?.answers;
	if (!answers || typeof answers !== "object") throw new DreddError("response has no answers");
	const out: Answers = {};
	for (const [id, q] of Object.entries(questions)) {
		const a = (answers as Record<string, Record<string, unknown> | undefined>)[id];
		if (!a || a.type !== q.type) throw new DreddError(`missing or mistyped answer: ${id}`);
		if (q.type === "noul") {
			if (!unit(a.noul)) throw new DreddError(`${id}: noul is not a probability`);
			out[id] = { type: "noul", noul: a.noul };
		} else if (q.type === "score") {
			const top = q.criteria.length - 1;
			if (!(typeof a.score === "number" && Number.isFinite(a.score) && a.score >= 0 && a.score <= top))
				throw new DreddError(`${id}: score is not within 0..${top}`);
			if (a.confidence !== undefined && !unit(a.confidence)) throw new DreddError(`${id}: confidence is not a probability`);
			out[id] = a.confidence === undefined ? { type: "score", score: a.score } : { type: "score", score: a.score, confidence: a.confidence };
		} else {
			if (!(typeof a.choice === "string" && Object.hasOwn(q.criteria, a.choice))) throw new DreddError(`${id}: unknown choice label`);
			if (!unit(a.confidence)) throw new DreddError(`${id}: confidence is not a probability`);
			out[id] = { type: "choice", choice: a.choice, confidence: a.confidence };
		}
	}
	return out;
}

/** A finished HTTP reply to validated answers and token usage; DreddError on non-2xx, non-JSON, or a broken contract. */
export function parseReply(res: { ok: boolean; status: number; text: string }, questions: Questions): { answers: Answers; inputTokens: number } {
	if (!res.ok) throw new DreddError(`HTTP ${res.status}`);
	let data: unknown;
	try {
		data = JSON.parse(res.text);
	} catch {
		throw new DreddError("response is not JSON");
	}
	const answers = validate(data, questions);
	const inputTokens = Number((data as { usage?: { input_tokens?: unknown } }).usage?.input_tokens) || 0;
	return { answers, inputTokens };
}

export interface AskResult {
	answers: Answers;
	inputTokens: number;
	elapsedMs: number;
}

/**
 * One request. `fetchImpl` is injectable for hermetic tests. The timeout is a
 * race, never a block: on expiry the caller sees a DreddError and decides.
 */
export async function ask(
	config: BackendConfig & { apiKey?: string; model?: string; timeoutMs?: number; keyResolver?: KeyResolver },
	state: unknown,
	questions: Questions,
	env: NodeJS.ProcessEnv,
	fetchImpl: typeof fetch,
	signal?: AbortSignal,
): Promise<AskResult> {
	const endpoint = resolveEndpoint(config, env);
	let key = pickKey(endpoint, config.apiKey, env);
	// Fall back to the key the agent runtime already holds from /login: no
	// duplicate settings or env var. Any backend may name a provider.
	if (!key && config.keyResolver && endpoint.provider !== undefined) {
		const hostKey = (await config.keyResolver(endpoint.provider))?.trim();
		if (hostKey) key = { key: hostKey, model: endpoint.model ?? "", source: `host auth ${endpoint.provider}` };
	}
	if (!key && endpoint.keyEnv !== undefined) throw new DreddError(`no key for ${endpoint.label}: set ${endpoint.keyEnv}`, true);
	const model = config.model ?? key?.model ?? endpoint.model;
	if (!model) throw new DreddError(`no model for ${endpoint.label}: set defaultModel or pass model`);
	const started = Date.now();
	const timeoutMs = config.timeoutMs ?? 1500;
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(), timeoutMs);
	const onOuterAbort = () => timeout.abort();
	signal?.addEventListener("abort", onOuterAbort, { once: true });
	try {
		const res = await fetchImpl(endpoint.url, {
			method: "POST",
			headers: key ? { authorization: `Bearer ${key.key}`, "content-type": "application/json" } : { "content-type": "application/json" },
			body: JSON.stringify({ model, state, questions }),
			signal: timeout.signal,
		});
		const text = await res.text();
		const { answers, inputTokens } = parseReply({ ok: res.ok, status: res.status, text }, questions);
		return { answers, inputTokens, elapsedMs: Date.now() - started };
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onOuterAbort);
	}
}