import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { LESSON_CHARS } from "../lib/memory";
import { normalizeCorrection, parseFaithfulnessVerdict, parseNormalizedLesson, resolveJudgeModel, resolveNormalizeModel, type ModelSurface } from "../lib/normalize";

/**
 * The host model is an outside service: what it receives (which model, which
 * text, which credentials, which budget) and what it replies are the contract,
 * so the compat module is stubbed and the request it was handed is asserted.
 */
const host = vi.hoisted(() => ({
 calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
 reply: { current: undefined as unknown },
}));

vi.mock("@earendil-works/pi-ai/compat", () => ({
 completeSimple: async (model: unknown, context: unknown, options: unknown) => {
  host.calls.push({ model, context, options });
  if (host.reply.current instanceof Error) throw host.reply.current;
  if (typeof host.reply.current === "function") return host.reply.current(options);
  return host.reply.current;
 },
}));

interface Sent {
 model: { provider: string; id: string };
 context: { systemPrompt?: string; messages?: Array<{ role: string; content: Array<{ type: string; text?: string }> }> };
 options: Record<string, unknown>;
}

const sent = (): Sent => host.calls[0] as unknown as Sent;
const sentText = (): string => sent().context.messages?.[0]?.content[0]?.text ?? "";
const replyText = (text: string) => ({ stopReason: "stop", content: [{ type: "text", text }] });
const replyJson = (value: unknown) => replyText(JSON.stringify(value));

const tiny = { provider: "test-provider", id: "tiny-1" };
const judge = { provider: "test-provider", id: "judge-1" };
const session = { provider: "test-provider", id: "session-1" };
const withCredentials: ModelSurface = { modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "host-key", headers: { "x-host": "1" }, env: { HOST_ENV: "1" } }) } };
const surface = (over: Partial<ModelSurface> = {}): ModelSurface => ({ ...withCredentials, models: { resolve: () => tiny, current: () => session }, model: session, ...over });

afterEach(() => {
 host.calls.length = 0;
 host.reply.current = undefined;
});

describe("parseNormalizedLesson", () => {
 it("accepts a rule with its condition", () => {
  expect(parseNormalizedLesson('{"trigger":"editing generated code","text":"never hand-edit generated files"}')).toEqual({ text: "never hand-edit generated files", trigger: "editing generated code" });
 });

 it("accepts a rule with no condition", () => {
  expect(parseNormalizedLesson('{"text":"never push to main"}')).toEqual({ text: "never push to main" });
 });

 it("tolerates the code fences models wrap JSON in", () => {
  const rule = '{"text":"never push to main"}';
  expect(parseNormalizedLesson("```json\n" + rule + "\n```")).toEqual({ text: "never push to main" });
  expect(parseNormalizedLesson("```\n" + rule + "\n``` ")).toEqual({ text: "never push to main" });
 });

 it("strips the padding a model pads a rule with", () => {
  expect(parseNormalizedLesson('{"text":"  never push to main  ","trigger":"  on main  "}')).toEqual({ text: "never push to main", trigger: "on main" });
 });

 it("drops an empty condition rather than dropping the rule", () => {
  expect(parseNormalizedLesson('{"text":"never push to main","trigger":"   "}')).toEqual({ text: "never push to main" });
  expect(parseNormalizedLesson('{"text":"never push to main","trigger":null}')).toEqual({ text: "never push to main" });
 });

 it("refuses prose, so a refusal is never stored as a rule", () => {
  expect(parseNormalizedLesson("I cannot rewrite that instruction.")).toBeUndefined();
  expect(parseNormalizedLesson("")).toBeUndefined();
 });

 it("refuses JSON that is not a single rule object", () => {
  expect(parseNormalizedLesson("[]")).toBeUndefined();
  expect(parseNormalizedLesson('[{"text":"never push to main"}]')).toBeUndefined();
  expect(parseNormalizedLesson('"never push to main"')).toBeUndefined();
  expect(parseNormalizedLesson("null")).toBeUndefined();
 });

 it("refuses an object carrying anything beyond text and trigger", () => {
  expect(parseNormalizedLesson('{"text":"never push to main","confidence":0.9}')).toBeUndefined();
  expect(parseNormalizedLesson('{"text":"never push to main","note":"weakened"}')).toBeUndefined();
 });

 it("refuses a missing, empty, or non-text rule", () => {
  expect(parseNormalizedLesson("{}")).toBeUndefined();
  expect(parseNormalizedLesson('{"text":""}')).toBeUndefined();
  expect(parseNormalizedLesson('{"text":"   "}')).toBeUndefined();
  expect(parseNormalizedLesson('{"text":42}')).toBeUndefined();
 });

 it("keeps a rule at the length limit and refuses one past it", () => {
  expect(parseNormalizedLesson(`{"text":"${"x".repeat(LESSON_CHARS)}"}`)).toEqual({ text: "x".repeat(LESSON_CHARS) });
  expect(parseNormalizedLesson(`{"text":"${"x".repeat(LESSON_CHARS + 1)}"}`)).toBeUndefined();
 });

 it("refuses a non-text or over-long condition while keeping the rule usable elsewhere", () => {
  expect(parseNormalizedLesson('{"text":"never push to main","trigger":7}')).toBeUndefined();
  expect(parseNormalizedLesson(`{"text":"never push to main","trigger":"${"y".repeat(LESSON_CHARS + 1)}"}`)).toBeUndefined();
  expect(parseNormalizedLesson(`{"text":"never push to main","trigger":"${"y".repeat(LESSON_CHARS)}"}`)).toEqual({ text: "never push to main", trigger: "y".repeat(LESSON_CHARS) });
 });
});

describe("parseFaithfulnessVerdict", () => {
 it("reads the verdict the verifier model must return", () => {
  expect(parseFaithfulnessVerdict('{"faithful":true}')).toEqual({ faithful: true });
  expect(parseFaithfulnessVerdict('{"faithful":false}')).toEqual({ faithful: false });
 });

 it("refuses anything that is not a verdict, so an unusable reply never passes as approval", () => {
  expect(parseFaithfulnessVerdict("Yes, it preserves the rule.")).toBeUndefined();
  expect(parseFaithfulnessVerdict('{"faithful":"yes"}')).toBeUndefined();
  expect(parseFaithfulnessVerdict("{}")).toBeUndefined();
 });
});

describe("resolveNormalizeModel", () => {
 it("asks the host for the cheap @tiny role alias", () => {
  const specs: string[] = [];
  const model = resolveNormalizeModel({ models: { resolve: spec => { specs.push(spec); return tiny; } } });
  expect(model).toEqual(tiny);
  expect(specs).toEqual(["@tiny"]);
 });

 it("prefers @tiny over the configured drafter and uses registry fallback on pi", () => {
  const registry = { find: (provider: string, id: string) => provider === "vendor" && id === "org/model" ? session : undefined };
  expect(resolveNormalizeModel({ models: { resolve: () => tiny }, modelRegistry: registry }, "vendor/org/model")).toEqual(tiny);
  expect(resolveNormalizeModel({ modelRegistry: registry }, "vendor/org/model")).toEqual(session);
  expect(resolveNormalizeModel({ modelRegistry: registry, model: tiny }, "missing/model")).toBeUndefined();
 });

 it("reports an unresolved configured drafter instead of using the session", async () => {
  expect(await normalizeCorrection({ model: session }, "a rule", undefined, "missing/model")).toEqual({ kind: "error", error: "drafter model not found: missing/model" });
 });

 it("falls back to the current model, then the session model", () => {
  expect(resolveNormalizeModel({ models: { resolve: () => undefined, current: () => session } })).toEqual(session);
  expect(resolveNormalizeModel({ model: session })).toEqual(session);
  expect(resolveNormalizeModel({ models: { resolve: () => undefined }, model: session })).toEqual(session);
 });

 it("reports no model for a surface without one", () => {
  expect(resolveNormalizeModel(undefined)).toBeUndefined();
  expect(resolveNormalizeModel({})).toBeUndefined();
 });
});

describe("resolveJudgeModel", () => {
 it("asks the host for the @judge role alias", () => {
  const specs: string[] = [];
  const model = resolveJudgeModel({ models: { resolve: spec => { specs.push(spec); return spec === "@judge" ? judge : undefined; } } });
  expect(model).toEqual(judge);
  expect(specs).toEqual(["@judge"]);
 });

 it("reports no judge for a surface without the role", () => {
  expect(resolveJudgeModel(undefined)).toBeUndefined();
  expect(resolveJudgeModel({ models: { resolve: () => undefined }, model: session })).toBeUndefined();
 });
});

describe("normalizeCorrection", () => {
 it("asks the tiny model to rewrite the operator's own words", async () => {
  host.reply.current = replyJson({ trigger: "the target is main", text: "never force-push" });
  const outcome = await normalizeCorrection(surface(), "do not ever force push to main please");
  expect(outcome).toEqual({ kind: "ok", lesson: { text: "never force-push", trigger: "the target is main" } });
  expect(host.calls).toHaveLength(1);
  expect(sent().model).toEqual(tiny);
  expect(sentText()).toBe("do not ever force push to main please");
 });

 it("uses the session model when the host has no @tiny alias", async () => {
  host.reply.current = replyJson({ text: "never force-push" });
  const outcome = await normalizeCorrection(surface({ models: { resolve: () => undefined, current: () => session } }), "no force pushing");
  expect(outcome.kind).toBe("ok");
  expect(sent().model).toEqual(session);
 });

 it("sends nothing when the surface has no model, leaving the caller's policy intact", async () => {
  expect(await normalizeCorrection(undefined, "no force pushing")).toEqual({ kind: "no-model" });
  expect(await normalizeCorrection({}, "no force pushing")).toEqual({ kind: "no-model" });
  expect(host.calls).toHaveLength(0);
 });

 it("never sends a request the host cannot authenticate", async () => {
  const noRegistry = { ...withCredentials, modelRegistry: undefined };
  const declined = surface({ modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: false, error: "logged out" }) } });
  const noKey = surface({ modelRegistry: { getApiKeyForProvider: async () => undefined } });
  // Callers branch on kind and show the operator the error text, so it must
  // name what failed; exact wording is nobody's contract.
  const declinedOutcome = await normalizeCorrection(declined, "no force pushing");
  const noKeyOutcome = await normalizeCorrection(noKey, "no force pushing");
  const noRegistryOutcome = await normalizeCorrection(surface(noRegistry), "no force pushing");
  const failed = [declinedOutcome, noKeyOutcome, noRegistryOutcome];
  for (const outcome of failed) expect(outcome.kind).toBe("error");
  const errors = failed.flatMap(o => (o.kind === "error" ? [o.error] : []));
  expect(errors[0]).toContain("logged out");
  expect(errors[1]).toContain("test-provider");
  expect(errors[2]).toContain("credential");
  expect(host.calls).toHaveLength(0);
 });

 it("carries the host's own credential bundle to the model call", async () => {
  host.reply.current = replyJson({ text: "never force-push" });
  await normalizeCorrection(surface(), "no force pushing");
  expect(sent().options).toMatchObject({ apiKey: "host-key", headers: { "x-host": "1" }, env: { HOST_ENV: "1" }, temperature: 0 });
 });

 it("carries a provider key from the registry shape omp exposes", async () => {
  host.reply.current = replyJson({ text: "never force-push" });
  const outcome = await normalizeCorrection(surface({ modelRegistry: { getApiKeyForProvider: async provider => (provider === "test-provider" ? "omp-key" : undefined) } }), "no force pushing");
  expect(outcome.kind).toBe("ok");
  expect(sent().options).toMatchObject({ apiKey: "omp-key" });
 });

 it("passes the entire correction to the model, including conditions at the end", async () => {
  host.reply.current = replyJson({ text: "never force-push", trigger: "the target is main" });
  const correction = `${"Context. ".repeat(300)}Only when the target is main, never force-push.`;
  await normalizeCorrection(surface(), correction);
  expect(sentText()).toBe(correction);
 });

 it("stops a stalled model request at the deadline", async () => {
  host.reply.current = (options: { signal: AbortSignal }) =>
   once(options.signal, "abort").then(() => { throw options.signal.reason; });
  const outcome = await normalizeCorrection(surface(), "no force pushing", 10);
  expect(outcome.kind).toBe("error");
 });


 it("asks the model for exactly the fields the parser accepts", async () => {
  // The reply contract is parseNormalizedLesson's {text, trigger}; a prompt
  // that asks for other fields makes every reply an error.
  host.reply.current = replyJson({ text: "never force-push" });
  await normalizeCorrection(surface(), "no force pushing");
  const systemPrompt = sent().context.systemPrompt ?? "";
  expect(systemPrompt).toContain('"trigger"');
  expect(systemPrompt).toContain('"text"');
 });

 it("surfaces a provider error as kind error and never trusts a rewrite", async () => {
  host.reply.current = { stopReason: "error", errorMessage: "rate limited" };
  const outcome = await normalizeCorrection(surface(), "no force pushing");
  expect(outcome.kind).toBe("error");
  expect(outcome.kind === "error" && outcome.error).toContain("rate limited");
 });

 it("surfaces an empty reply as kind error", async () => {
  host.reply.current = { stopReason: "stop", content: [] };
  const outcome = await normalizeCorrection(surface(), "no force pushing");
  expect(outcome.kind).toBe("error");
  // The operator must be able to tell an empty reply from a bad one.
  expect(outcome.kind === "error" && outcome.error).toContain("tiny-1");
 });

 it("surfaces an unusable reply as kind error quoting what came back", async () => {
  host.reply.current = replyText("Sure, I would not force push.");
  const outcome = await normalizeCorrection(surface(), "no force pushing");
  expect(outcome.kind).toBe("error");
  expect(outcome.kind === "error" && outcome.error).toContain("Sure, I would not force push.");
 });

 it("surfaces a throwing host module as kind error", async () => {
  host.reply.current = new Error("compat exploded");
  expect(await normalizeCorrection(surface(), "no force pushing")).toEqual({ kind: "error", error: "compat exploded" });
 });

 it("refuses a rewrite the store could not keep", async () => {
  // A reply with an extra field or an over-long rule must surface as an
  // error, not as an ok lesson the guard would enforce against words the
  // operator never said.
  host.reply.current = replyJson({ text: "never force-push", severity: "high" });
  expect((await normalizeCorrection(surface(), "no force pushing")).kind).toBe("error");
  host.reply.current = replyJson({ text: "q".repeat(LESSON_CHARS + 1) });
  expect((await normalizeCorrection(surface(), "no force pushing")).kind).toBe("error");
 });
});
