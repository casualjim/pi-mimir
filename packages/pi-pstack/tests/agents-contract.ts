/**
 * Contract check for the pstack role pack. Runs under the package's bun test
 * runner:  bun tests/agents-contract.ts
 *
 * Asserts the two things pi-herdr-agents depends on: the role-pack registration
 * wiring, and the frontmatter shape its catalog parser and validator accept.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BUNDLED_ROLES_DIR,
  ROLE_PACK_DISCOVERY_EVENT,
  registerPstackRoles,
} from "../extensions/pstack/roles.js";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

interface FakePi {
  events: {
    on(channel: string, handler: (data: unknown) => void): () => void;
    emit(channel: string, data: unknown): void;
  };
  on(event: string, handler: () => void): void;
  handlers: Map<string, () => void>;
}

function fakePi(): FakePi {
  const channels = new Map<string, (data: unknown) => void>();
  const handlers = new Map<string, () => void>();
  return {
    events: {
      on(channel, handler) {
        channels.set(channel, handler);
        return () => channels.delete(channel);
      },
      emit(channel, data) {
        channels.get(channel)?.(data);
      },
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    handlers,
  };
}

function frontmatter(name: string): string {
  const content = readFileSync(path.join(BUNDLED_ROLES_DIR, name), "utf8");
  const captured = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  assert.ok(captured !== undefined, `${name} has no frontmatter`);
  return captured;
}

function frontmatterValue(name: string, key: string): string | undefined {
  const line = frontmatter(name)
    .split("\n")
    .find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(`${key}:`.length).trim() || undefined;
}

function assertEmpty(list: readonly unknown[], message: string): void {
  assert.equal(list.length, 0, message);
}

const agentNames = readdirSync(BUNDLED_ROLES_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

assert.deepEqual(
  agentNames,
  ["comment-sicko.md", "poteto-agent.md"],
  "unexpected bundled roles",
);

// --- role-pack registration ---
const pi = fakePi();
const registered: string[] = [];
registerPstackRoles(pi as never);

assert.ok(
  pi.handlers.has("session_shutdown"),
  "must unsubscribe on session_shutdown",
);
assertEmpty(registered, "must not register before the host asks");

pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 1,
  register: (registeredPath: string) => registered.push(registeredPath),
});
assert.deepEqual(
  registered,
  [BUNDLED_ROLES_DIR],
  "must register the bundled agents directory",
);
assert.ok(
  path.isAbsolute(BUNDLED_ROLES_DIR),
  "role-pack paths must be absolute",
);

const unknownVersion: string[] = [];
pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 2,
  register: (registeredPath: string) => unknownVersion.push(registeredPath),
});
assertEmpty(unknownVersion, "unknown protocol versions must be ignored");

pi.handlers.get("session_shutdown")?.();
const afterShutdown: string[] = [];
pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 1,
  register: (registeredPath: string) => afterShutdown.push(registeredPath),
});
assertEmpty(afterShutdown, "must stop registering after shutdown");

// --- definition contract ---
for (const name of agentNames) {
  const stem = name.replace(/\.md$/, "");
  assert.equal(
    frontmatterValue(name, "name"),
    stem,
    `${name} name must match its filename stem`,
  );

  const description = frontmatterValue(name, "description");
  assert.ok(description, `${name} must declare a description`);
  assert.ok(
    !/^[>|[]/.test(description),
    `${name} description must be a single-line scalar, not a folded block`,
  );

  assert.equal(
    frontmatterValue(name, "system-prompt"),
    "append",
    `${name} system-prompt`,
  );
  assert.equal(
    frontmatterValue(name, "auto-exit"),
    "true",
    `${name} auto-exit`,
  );
  assert.ok(
    ["true", "false"].includes(frontmatterValue(name, "spawning") ?? ""),
    `${name} spawning must be exactly true or false`,
  );

  const thinking = frontmatterValue(name, "thinking");
  if (thinking !== undefined) {
    assert.ok(
      THINKING_LEVELS.includes(thinking),
      `${name} thinking "${thinking}" is not a Pi level`,
    );
  }

  const model = frontmatterValue(name, "model");
  if (model !== undefined) {
    assert.ok(
      !/:(?:off|minimal|low|medium|high|xhigh|max)$/.test(model),
      `${name} model must not carry a thinking suffix`,
    );
    assert.equal(
      model.split("/").length,
      2,
      `${name} model must be an exact provider/model-id`,
    );
  }

  const tools = frontmatterValue(name, "tools");
  if (tools !== undefined) {
    assert.ok(
      !/[[\]{}>|#"']/.test(tools),
      `${name} tools must be an inline comma-separated scalar`,
    );
    for (const entry of tools.split(",")) {
      assert.ok(entry.trim(), `${name} tools has an empty entry`);
    }
  }
}

assert.equal(
  frontmatterValue("comment-sicko.md", "spawning"),
  "false",
  "comment-sicko is a leaf",
);
assert.equal(
  frontmatterValue("comment-sicko.md", "tools"),
  "read, grep, find, ls, bash",
);
assert.equal(
  frontmatterValue("poteto-agent.md", "spawning"),
  "true",
  "poteto-agent delegates",
);
assert.equal(
  frontmatterValue("poteto-agent.md", "tools"),
  undefined,
  "poteto-agent must stay unrestricted",
);

console.log(`pstack agents contract: ok (${agentNames.length} roles)`);
