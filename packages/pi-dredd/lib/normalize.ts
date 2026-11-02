/**
 * Host-model normalization: rewrite an operator correction into a strict
 * { trigger, text } lesson using a model the host already runs, so dredd
 * stores an applicability condition plus a rule instead of the raw sentence.
 * omp exposes `ctx.models.resolve(spec)` (ExtensionModelQuery: role aliases
 * `@tiny` for the rewrite, `@judge` for semantic verification of the rewrite);
 * pi carries only `ctx.model`, which is the compatible session model, and no
 * judge role — pi callers fall back to dredd's own decision backend. Requests
 * go through `@earendil-works/pi-ai/compat` completeSimple with credentials
 * from the host registry (same dynamic-import pattern as pi-reflect: omp
 * remaps the specifier, and the module shape differs per host, so every
 * member is runtime-checked before the call). Nothing is persisted here: the
 * caller owns the lesson store.
 */

import { LESSON_CHARS } from "./memory";
import { ask, type BackendConfig, type KeyResolver } from "./jev";

/** Structural view of a host Model: only the fields the request needs. */
export interface LooseModel {
 provider: string;
 id: string;
}

/** Credential lookups the host registry may expose (pi: getApiKeyAndHeaders;
 * omp: at least getApiKeyForProvider). */
export interface LooseAuthRegistry {
 find?(provider: string, id: string): LooseModel | undefined;
 getApiKeyAndHeaders?(model: LooseModel): Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string | null>; env?: Record<string, string>; error?: string }>;
 getApiKeyForProvider?(provider: string): Promise<string | undefined>;
}

/** The ctx members normalization reads. All optional: the surfaces differ
 * per host, and a tool execute may run without any context. */
export interface ModelSurface {
 models?: { resolve?(spec: string): LooseModel | undefined; current?(): LooseModel | undefined };
 model?: LooseModel;
 modelRegistry?: LooseAuthRegistry;
}

export interface NormalizedLesson {
 text: string;
 trigger?: string;
}

/** ok: usable lesson. no-model: the surface offers no model at all, so the
 * caller decides its no-normalization policy. error: a model was there and
 * the call, auth, or output failed — the caller must not trust a rewrite. */
export type NormalizeOutcome = { kind: "ok"; lesson: NormalizedLesson } | { kind: "no-model" } | { kind: "error"; error: string };

interface LooseAssistantMessage {
 stopReason?: string;
 errorMessage?: string;
 content?: Array<{ type: string; text?: string }>;
}

type LooseCompleteSimple = (model: LooseModel, context: unknown, options?: Record<string, unknown>) => Promise<LooseAssistantMessage>;

/** Generative rewrite, not a judge answer: the judge's 1.5s default is too
 * tight, so normalization carries its own budget. */
export const NORMALIZE_TIMEOUT_MS = 8000;

/** Text a host model returned, or why it did not. */
export type HostTextOutcome = { kind: "ok"; text: string } | { kind: "error"; error: string };

/** One text completion through the host's own request path and credentials.
 * Shared by the @tiny rewrite and the @judge verdict so both hit exactly one
 * supported surface: pi-ai completeSimple with registry auth. Keyless local
 * providers (auth: none) resolve to the registry's "N/A" no-auth sentinel,
 * which the transports strip before sending. Never throws: every failure is
 * a kind-tagged outcome. */
export async function completeWithHostModel(
 surface: ModelSurface,
 model: LooseModel,
 systemPrompt: string,
 userText: string,
 timeoutMs: number = NORMALIZE_TIMEOUT_MS,
 maxTokens = 400,
): Promise<HostTextOutcome> {
 try {
  // Dynamic import exception: omp remaps this specifier to its pi-ai root,
  // whose export set differs from pi's compat build (see pi-reflect), so the
  // module cannot be referenced statically from a package that runs on both.
  const compat = (await import("@earendil-works/pi-ai/compat")) as { completeSimple?: unknown };
  if (typeof compat.completeSimple !== "function") return { kind: "error", error: "host pi-ai exposes no completeSimple" };
  const completeSimple = compat.completeSimple as LooseCompleteSimple;
  const registry = surface.modelRegistry;
  let auth: { apiKey?: string; headers?: Record<string, string | null>; env?: Record<string, string> };
  if (registry?.getApiKeyAndHeaders) {
   const resolved = await registry.getApiKeyAndHeaders(model);
   if (!resolved.ok) return { kind: "error", error: `host auth failed for ${model.provider}/${model.id}: ${resolved.error ?? "no credentials"}` };
   auth = { apiKey: resolved.apiKey, headers: resolved.headers, env: resolved.env };
  } else if (registry?.getApiKeyForProvider) {
   const apiKey = await registry.getApiKeyForProvider(model.provider);
   if (!apiKey) return { kind: "error", error: `no host credential for ${model.provider}` };
   auth = { apiKey };
  } else {
   return { kind: "error", error: "host model registry exposes no credential lookup" };
  }
  const response = await completeSimple(
   model,
   { systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: userText }], timestamp: Date.now() }] },
   { ...auth, signal: AbortSignal.timeout(timeoutMs), maxTokens, temperature: 0 },
  );
  if (!response || response.stopReason === "error") return { kind: "error", error: `${model.provider}/${model.id}: ${response?.errorMessage ?? "no response"}` };
  const text = (response.content ?? []).filter(part => part?.type === "text").map(part => part.text ?? "").join("").trim();
  if (text.length === 0) return { kind: "error", error: `${model.provider}/${model.id} returned no text` };
  return { kind: "ok", text };
 } catch (error) {
  return { kind: "error", error: error instanceof Error ? error.message : String(error) };
 }
}

const NORMALIZE_SYSTEM = 'You normalize operator corrections into standing rules for a coding-agent guard. Reply with strict JSON only, no prose, no code fences: {"trigger": "<when the rule applies, omit when it always applies>", "text": "<imperative rule, at most 200 characters>"}. Preserve the operator\'s full meaning; never weaken, shorten away a constraint, or extend the rule.';

/** Strip a surrounding code fence; both model replies are demanded as bare JSON. */
function stripJsonFence(raw: string): string {
 return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

/** Strict parse of the model reply: an object with exactly text (non-empty,
 * <= LESSON_CHARS) and an optional trigger; nothing else is accepted. */
export function parseNormalizedLesson(raw: string): NormalizedLesson | undefined {
 let parsed: unknown;
 try {
  parsed = JSON.parse(stripJsonFence(raw));
 } catch {
  return undefined;
 }
 if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
 const record = parsed as Record<string, unknown>;
 if (Object.keys(record).some(key => key !== "text" && key !== "trigger")) return undefined;
 if (typeof record.text !== "string") return undefined;
 const text = record.text.trim();
 if (text.length === 0 || text.length > LESSON_CHARS) return undefined;
 if (record.trigger === undefined || record.trigger === null) return { text };
 if (typeof record.trigger !== "string") return undefined;
 const trigger = record.trigger.trim();
 if (trigger.length === 0) return { text };
 if (trigger.length > LESSON_CHARS) return undefined;
 return { text, trigger };
}

/** Prefer @tiny, then an explicitly configured host model, then the session model. */
export function resolveNormalizeModel(surface: ModelSurface | undefined, drafterModel?: string): LooseModel | undefined {
 if (!surface) return undefined;
 const tiny = surface.models?.resolve?.("@tiny");
 if (tiny) return tiny;
 if (drafterModel) {
  const slash = drafterModel.indexOf("/");
  return surface.models?.resolve?.(drafterModel) ?? (slash > 0 ? surface.modelRegistry?.find?.(drafterModel.slice(0, slash), drafterModel.slice(slash + 1)) : undefined);
 }
 return surface.models?.current?.() ?? surface.model ?? undefined;
}

/** The host's judge role (omp `@judge`). Deliberately NO session-model
 * fallback: letting the model that produced the rewrite grade its own output
 * is self-grading, not verification. Undefined on pi, which has no role
 * surface — the caller falls back to its decision backend. */
export function resolveJudgeModel(surface: ModelSurface | undefined): LooseModel | undefined {
 return surface?.models?.resolve?.("@judge") ?? undefined;
}

/** Strict parse of the judge verdict: an object with exactly faithful
 * (boolean); nothing else is accepted. */
export function parseFaithfulnessVerdict(raw: string): { faithful: boolean } | undefined {
 let parsed: unknown;
 try {
  parsed = JSON.parse(stripJsonFence(raw));
 } catch {
  return undefined;
 }
 if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
 const record = parsed as Record<string, unknown>;
 if (Object.keys(record).length !== 1 || typeof record.faithful !== "boolean") return undefined;
 return { faithful: record.faithful };
}

/** Rewrite `raw` into a normalized lesson with the host model. Never
 * throws: every failure surfaces as a kind-tagged outcome. */
export async function normalizeCorrection(surface: ModelSurface | undefined, raw: string, timeoutMs: number = NORMALIZE_TIMEOUT_MS, drafterModel?: string): Promise<NormalizeOutcome> {
 const model = resolveNormalizeModel(surface, drafterModel);
 if (!model || !surface) return drafterModel && surface ? { kind: "error", error: `drafter model not found: ${drafterModel}` } : { kind: "no-model" };
 const reply = await completeWithHostModel(surface, model, NORMALIZE_SYSTEM, raw, timeoutMs, 400);
 if (reply.kind === "error") return { kind: "error", error: reply.error };
 const lesson = parseNormalizedLesson(reply.text);
 if (!lesson) return { kind: "error", error: `${model.provider}/${model.id} returned invalid JSON lesson: ${reply.text.slice(0, 160)}` };
 return { kind: "ok", lesson };
}

/** The decision-backend surface verification falls back to on hosts
 * without a judge role; exactly the config ask() takes. */
export type VerificationBackend = BackendConfig & { apiKey?: string; model?: string; timeoutMs?: number; keyResolver?: KeyResolver };

/** ok: a verifier said the rewrite is faithful. drift: a verifier said it
 * is not. unavailable: no verifier answered — the caller MUST NOT save,
 * because an unverified rewrite is not a verified one. */
export type VerifyOutcome = { kind: "ok" } | { kind: "drift"; detail: string; score: number | null } | { kind: "unavailable"; error: string };

const VERIFY_SYSTEM = 'You verify a rewritten standing rule against the operator\'s original correction. Input is JSON: {"originalCorrection": "...", "normalizedLesson": {...}}. Reply with strict JSON only, no prose, no code fences: {"faithful": true} only when the rewrite preserves the correction\'s full meaning; {"faithful": false} when it weakens, changes, drops, or broadens any part of the rule.';

/** Semantic verification of a rewrite against the operator's own words.
 * The omp path asks the host `@judge` role through the same supported
 * completeSimple surface as the rewrite. Without a judge role (pi, or omp
 * with no judge configured) it falls back to dredd's decision backend with
 * the drifted noul. Every failure path returns unavailable, never ok: a
 * lesson only saves on an explicit faithful verdict. */
export async function verifyNormalizedLesson(
 surface: ModelSurface | undefined,
 decision: VerificationBackend | undefined,
 original: string,
 lesson: NormalizedLesson,
 timeoutMs: number = NORMALIZE_TIMEOUT_MS,
 env: NodeJS.ProcessEnv = process.env,
 fetchImpl: typeof fetch = fetch,
): Promise<VerifyOutcome> {
 const judge = resolveJudgeModel(surface);
 if (judge && surface) {
  const state = JSON.stringify({ originalCorrection: original, normalizedLesson: lesson });
  const reply = await completeWithHostModel(surface, judge, VERIFY_SYSTEM, state, timeoutMs, 60);
  if (reply.kind === "error") return { kind: "unavailable", error: reply.error };
  const verdict = parseFaithfulnessVerdict(reply.text);
  if (!verdict) return { kind: "unavailable", error: `${judge.provider}/${judge.id} returned invalid JSON verdict: ${reply.text.slice(0, 160)}` };
  return verdict.faithful ? { kind: "ok" } : { kind: "drift", detail: `${judge.provider}/${judge.id} judged the rewrite unfaithful`, score: null };
 }
 if (!decision) return { kind: "unavailable", error: "no @judge model and no decision backend" };
 try {
  const check = await ask(decision, { originalCorrection: original, normalizedLesson: JSON.stringify(lesson), guard: "correction-verify" }, { drifted: { type: "noul" as const, instructions: 'Does the normalizedLesson weaken, change, or drop any part of the operator rule stated in originalCorrection, or broaden what it forbids or requires? Answer no only if it preserves the rule\'s full meaning.' } }, env, fetchImpl);
  const answer = check.answers.drifted;
  if (!answer || answer.type !== "noul") return { kind: "unavailable", error: "decision backend returned no drifted noul answer" };
  return answer.noul >= 0.5 ? { kind: "drift", detail: `drift score ${answer.noul}`, score: answer.noul } : { kind: "ok" };
 } catch (error) {
  return { kind: "unavailable", error: error instanceof Error ? error.message : String(error) };
 }
}
