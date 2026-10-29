/**
 * Contract check for the addy-skills role pack. Runs under the package's test
 * script (`bun tests/agents-contract.ts`).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  BUNDLED_ROLES_DIR,
  ROLE_PACK_DISCOVERY_EVENT,
  registerAddySkillsRoles,
} from "../extensions/addy-skills/roles.js";

interface FakePi {
  handlers: Map<string, () => void>;
  events: {
    emit(name: string, request: unknown): void;
    on(name: string, handler: (request: unknown) => void): () => void;
  };
  on(event: string, handler: () => void): void;
}

function fakePi(): FakePi {
  const handlers = new Map<string, () => void>();
  const listeners = new Map<string, (request: unknown) => void>();
  return {
    handlers,
    events: {
      emit(name, request) {
        listeners.get(name)?.(request);
      },
      on(name, handler) {
        listeners.set(name, handler);
        return () => listeners.delete(name);
      },
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
}

function frontmatter(name: string): string {
  const content = readFileSync(path.join(BUNDLED_ROLES_DIR, name), "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${name} must have YAML frontmatter`);
  return match[1]!;
}

function frontmatterValue(name: string, key: string): string | undefined {
  const line = frontmatter(name)
    .split("\n")
    .find((l) => l.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim();
}

const agentNames = readdirSync(BUNDLED_ROLES_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

assert.deepEqual(
  agentNames,
  [
    "code-reviewer.md",
    "security-auditor.md",
    "test-engineer.md",
    "web-performance-auditor.md",
  ],
  "unexpected bundled personas",
);

// --- role-pack registration ---
const pi = fakePi();
const registered: string[] = [];
registerAddySkillsRoles(pi as never);

assert.ok(
  pi.handlers.has("session_shutdown"),
  "must unsubscribe on session_shutdown",
);
assert.equal(registered.length, 0, "must not register before the host asks");

pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 1,
  register: (p: string) => registered.push(p),
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

pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 2,
  register: (p: string) => registered.push(p),
});
assert.equal(registered.length, 1, "unknown protocol versions must be ignored");

pi.handlers.get("session_shutdown")?.();
pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
  apiVersion: 1,
  register: (p: string) => registered.push(p),
});
assert.equal(registered.length, 1, "must stop registering after shutdown");

// --- definition contract ---
for (const name of agentNames) {
  const persona = name.replace(/\.md$/, "");
  assert.equal(
    frontmatterValue(name, "name"),
    persona,
    `${name} frontmatter name must match its file name`,
  );
  const description = frontmatterValue(name, "description");
  assert.ok(description, `${name} must have a description`);
  assert.ok(
    description!.length <= 1024,
    `${name} description must stay under 1024 chars`,
  );
  assert.equal(
    frontmatterValue(name, "system-prompt"),
    "append",
    `${name} must append to the base system prompt`,
  );
  assert.equal(
    frontmatterValue(name, "spawning"),
    "false",
    `${name} is a leaf persona and must not spawn`,
  );
  assert.equal(
    frontmatterValue(name, "auto-exit"),
    "true",
    `${name} must exit after its report`,
  );
  assert.equal(
    frontmatterValue(name, "model"),
    undefined,
    `${name} must not pin a concrete model; roles are the host's choice`,
  );
  const body = readFileSync(path.join(BUNDLED_ROLES_DIR, name), "utf8");
  assert.ok(
    !body.includes("docs/agents.md"),
    `${name} must not link unported upstream docs`,
  );
  assert.ok(
    !body.includes("subagent_type"),
    `${name} must not reference Claude's subagent_type`,
  );
}

const webperf = readFileSync(
  path.join(BUNDLED_ROLES_DIR, "web-performance-auditor.md"),
  "utf8",
);
assert.ok(
  webperf.includes("Live capture on omp"),
  "web-performance-auditor must document the omp browser capture path",
);

console.log(`addy-skills agents contract: ok (${agentNames.length} personas)`);
