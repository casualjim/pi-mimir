/**
 * Contract check for the vendored interaction router: the copies bundled into
 * pi-dredd, pi-heimdall, pi-jj, and pi-pstack stay identical, and host-aware
 * ask/confirm routing holds on both hosts. Runs under the package's `test`
 * script (`bun tests/…`). Vendored because git installs must work without the
 * unpublished workspace package.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmUser, preferredAskTool, selectUser } from "../extensions/pstack/interaction.js";

const here = dirname(fileURLToPath(import.meta.url));

// --- the four vendored copies must not drift apart ---
const copies = [
  "../extensions/pstack/interaction.ts",
  "../../pi-dredd/lib/interaction.ts",
  "../../pi-heimdall/lib/interaction.ts",
  "../../pi-jj/src/interaction.ts",
].map((relative) => readFileSync(join(here, relative), "utf8"));
for (const copy of copies.slice(1)) assert.equal(copy, copies[0], "vendored interaction router drifted from the pstack copy");

const fail = () => { throw new Error("unexpected prompt"); };
const pi = { getActiveTools: () => ["ask_user_question", "ask_user"] };
const omp = { zod: {}, getActiveTools: () => ["ask_user", "ask"] };
const fallback = { confirm: async () => true, select: async () => "Second" };
const question = (name: string) => ({ name });

function nested(details: unknown, names = ["ask_user_question", "ask_user"]) {
  const calls: { name: string; args: unknown }[] = [];
  return {
    hasUI: true,
    ui: { confirm: fail },
    tools: names.map(question),
    calls,
    async executeTool(name: string, args: unknown) {
      calls.push({ name, args });
      return { isError: false, result: { details } };
    },
  };
}

// --- model question routing checks active tools in host order ---
{
  const active = ["ask_user_question", "ask_user", "ask"];
  const host = { getActiveTools: () => active };
  assert.equal(preferredAskTool(host), "ask_user");
  const ompHost = { ...host, zod: {} };
  assert.equal(preferredAskTool(ompHost), "ask");
  active.splice(1, 1);
  assert.equal(preferredAskTool(host), "ask_user_question");
  active.shift();
  assert.equal(preferredAskTool(host), undefined);
}

// --- Pi tool contexts use the first callable active tool ---
{
  const primary = nested({ cancelled: false, response: { kind: "selection", selections: ["Allow"] } });
  assert.equal(await confirmUser(primary, pi, "Approval", "Allow access?", "path.txt"), true);
  assert.deepEqual(primary.calls, [{
    name: "ask_user", args: {
      question: "Allow access?", allowFreeform: false,
      options: [{ title: "Decline", description: undefined }, { title: "Allow", description: "path.txt" }],
    }
  }]);

  const secondary = nested({ cancelled: false, answers: [{ kind: "option", questionIndex: 0, answer: "Allow" }] }, ["ask_user_question"]);
  assert.equal(await confirmUser(secondary, pi, "Approval", "Allow access?"), true);
  assert.equal(secondary.calls[0]?.name, "ask_user_question");
}

// --- native UI handles command and hook contexts or model-only tools ---
{
  const ctx = { hasUI: true, ui: { ...fallback, askDialog: fail } };
  assert.equal(await confirmUser(ctx, pi, "Approval", "Allow?", "path.txt"), true);
  const modelOnly = { ...ctx, tools: [], executeTool: fail };
  assert.equal(await confirmUser(modelOnly, pi, "Approval", "Allow?"), true);
  assert.equal(await selectUser(ctx, pi, "Choose", ["First", "Second"]), "Second");
  assert.equal(await confirmUser({ hasUI: false, ui: { confirm: fail } }, pi, "Approval", "Allow?"), undefined);
  assert.equal(await confirmUser({ hasUI: true, ui: {} }, pi, "Approval", "Allow?"), undefined);
}

// --- omp only accepts a submitted offered choice, without falling back after cancellation ---
{
  const ctx = { hasUI: true, ui: { ...fallback, confirm: fail, select: fail, askDialog: async () => undefined } };
  assert.equal(await confirmUser(ctx, omp, "Approval", "Allow?"), false);
  assert.equal(await selectUser(ctx, omp, "Choose", ["First", "Second"]), undefined);
  assert.equal(await selectUser({
    ...ctx, ui: {
      ...ctx.ui, askDialog: async ([q]: { id: string }[]) => ({
        kind: "submit", results: [{ id: q?.id, selectedOptions: ["Second"] }],
      })
    }
  }, omp, "Choose", ["First", "Second"]), "Second");
}

// --- a Pi decline, custom answer or tool failure is not approval and does not open another prompt ---
for (const details of [
  { cancelled: false, response: { kind: "selection", selections: ["Decline"] } },
  { cancelled: true, response: { kind: "selection", selections: ["Allow"] } },
  { cancelled: false, response: { kind: "freeform", text: "Allow" } },
]) {
  const ctx = nested(details);
  assert.equal(await confirmUser(ctx, pi, "Approval", "Allow?"), false);
  assert.deepEqual(ctx.calls.map(({ name }) => name), ["ask_user"]);
}
{
  const ctx = { ...nested(undefined), executeTool: async () => ({ isError: true, result: { details: null } }) };
  assert.equal(await confirmUser(ctx, pi, "Approval", "Allow?"), false);
}

console.log("interaction router contract: ok (identical copies, pi and omp routing)");
