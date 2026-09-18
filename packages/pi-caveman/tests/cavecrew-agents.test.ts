import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  BUNDLED_ROLES_DIR,
  ROLE_PACK_DISCOVERY_EVENT,
  registerCavecrewRoles,
} from "../extensions/caveman/roles.js";

const root = path.resolve(import.meta.dirname, "..");

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function cavecrewAgentNames(): string[] {
  return readdirSync(BUNDLED_ROLES_DIR)
    .filter((name) => /^cavecrew-[a-z0-9-]+\.md$/.test(name))
    .sort();
}

function frontmatter(name: string): string {
  const content = readFileSync(path.join(BUNDLED_ROLES_DIR, name), "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${name} has no frontmatter`);
  return match[1];
}

function frontmatterValue(name: string, key: string): string | undefined {
  const line = frontmatter(name)
    .split("\n")
    .find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(`${key}:`.length).trim() || undefined;
}

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

function registerWith(pi: FakePi): string[] {
  const registered: string[] = [];
  pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
    apiVersion: 1,
    register: (registeredPath: string) => registered.push(registeredPath),
  });
  return registered;
}

describe("Cavecrew role pack", () => {
  it("registers the bundled agents directory on the pi-herdr-agents discovery event", () => {
    const pi = fakePi();
    const registered: string[] = [];
    registerCavecrewRoles(pi as never);

    expect(pi.handlers.has("session_shutdown")).toBe(true);
    expect(registered).toEqual([]);

    pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, {
      apiVersion: 1,
      register: (registeredPath: string) => registered.push(registeredPath),
    });

    expect(registered).toEqual([BUNDLED_ROLES_DIR]);
    expect(path.isAbsolute(BUNDLED_ROLES_DIR)).toBe(true);
    expect(readdirSync(BUNDLED_ROLES_DIR)).toContain(
      "cavecrew-investigator.md",
    );
  });

  it("ignores unknown protocol versions", () => {
    const pi = fakePi();
    const register = vi.fn();
    registerCavecrewRoles(pi as never);

    pi.events.emit(ROLE_PACK_DISCOVERY_EVENT, { apiVersion: 2, register });

    expect(register).not.toHaveBeenCalled();
  });

  it("unsubscribes on session shutdown", () => {
    const pi = fakePi();
    registerCavecrewRoles(pi as never);

    pi.handlers.get("session_shutdown")?.();

    expect(registerWith(pi)).toEqual([]);
  });
});

describe("Cavecrew definition contract", () => {
  it("declares the fields pi-herdr-agents validates", () => {
    const names = cavecrewAgentNames();
    expect(names).toHaveLength(3);

    for (const name of names) {
      const stem = name.replace(/\.md$/, "");
      expect(frontmatterValue(name, "name")).toBe(stem);

      const description = frontmatterValue(name, "description");
      expect(description, `${name} description`).toBeTruthy();
      expect(
        description,
        `${name} description must not be a folded block`,
      ).not.toMatch(/^[>|[]/);

      expect(frontmatterValue(name, "system-prompt")).toBe("append");
      expect(frontmatterValue(name, "spawning")).toBe("false");
      expect(frontmatterValue(name, "auto-exit")).toBe("true");

      const thinking = frontmatterValue(name, "thinking");
      if (thinking !== undefined) expect(THINKING_LEVELS).toContain(thinking);
    }
  });

  it("uses inline comma-separated tool scalars with no thinking suffix on model", () => {
    for (const name of cavecrewAgentNames()) {
      const tools = frontmatterValue(name, "tools");
      expect(tools, `${name} tools`).toBeTruthy();
      expect(tools, `${name} tools must be an inline scalar`).not.toMatch(
        /[[\]{}>|#"']/,
      );
      for (const entry of tools!.split(",")) expect(entry.trim()).toBeTruthy();

      const model = frontmatterValue(name, "model");
      if (model !== undefined) {
        expect(
          model,
          `${name} model must not carry a thinking suffix`,
        ).not.toMatch(/:(?:off|minimal|low|medium|high|xhigh|max)$/);
        expect(model.split("/")).toHaveLength(2);
      }
    }
  });

  it("uses Pi tool names and codebase-memory-first investigator ladder", () => {
    expect(frontmatterValue("cavecrew-builder.md", "tools")).toBe(
      "read, edit, write",
    );
    expect(frontmatterValue("cavecrew-reviewer.md", "tools")).toBe(
      "read, bash",
    );
    expect(frontmatterValue("cavecrew-reviewer.md", "model")).toBe(
      "zai/glm-5.3",
    );
    expect(frontmatterValue("cavecrew-reviewer.md", "thinking")).toBe("max");
    expect(frontmatterValue("cavecrew-investigator.md", "model")).toBe(
      "ollama-cloud/deepseek-v4.1-flash",
    );
    expect(frontmatterValue("cavecrew-investigator.md", "thinking")).toBe(
      "high",
    );

    for (const name of cavecrewAgentNames()) {
      const content = readFileSync(path.join(BUNDLED_ROLES_DIR, name), "utf8");
      expect(content, `${name} uses a YAML tool list`).not.toMatch(
        /tools:\s*\[/,
      );
      expect(content, `${name} uses legacy Claude tool names`).not.toMatch(
        /\b(Read|Grep|Glob|Bash|Edit|Write)\b/,
      );
      expect(content, `${name} uses namespaced MCP tool names`).not.toMatch(
        /codebase_memory_/,
      );
    }

    const investigator = readFileSync(
      path.join(BUNDLED_ROLES_DIR, "cavecrew-investigator.md"),
      "utf8",
    );
    expect(investigator).toContain("`get_architecture`");
    expect(investigator).toContain(
      "degraded: codebase-memory unavailable; using read/bash.",
    );
  });

  it("documents explicit delegation and forbids extension auto-spawn", () => {
    const skill = readFileSync(
      path.join(root, "skills/cavecrew/SKILL.md"),
      "utf8",
    );
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    const extension = readFileSync(
      path.join(root, "extensions/caveman/index.ts"),
      "utf8",
    );

    expect(skill).toContain("subagents_list");
    expect(skill).toContain(
      '{ "name": "Locate X", "agent": "cavecrew-investigator"',
    );
    expect(skill).toContain("Never auto-spawn Cavecrew from extension hooks.");
    expect(readme).toContain("does not auto-spawn agents");
    expect(extension).not.toContain("registerTool");
  });
});
