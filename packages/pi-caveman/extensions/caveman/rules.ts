import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CavemanMode } from "./mode-state.js";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(EXTENSION_DIR, "..", "..");
export const CAVEMAN_SKILL_PATH = join(PACKAGE_ROOT, "skills", "caveman", "SKILL.md");

function canonicalModeLabel(mode: CavemanMode): string {
  return mode === "wenyan" ? "wenyan-full" : mode;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, "");
}

export function loadCavemanRules(mode: CavemanMode): string {
  const modeLabel = canonicalModeLabel(mode);

  if (existsSync(CAVEMAN_SKILL_PATH)) {
    const body = stripFrontmatter(readFileSync(CAVEMAN_SKILL_PATH, "utf8"));
    const filtered = body.split("\n").reduce<string[]>((acc, line) => {
      const tableRowMatch = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
      if (tableRowMatch) {
        if (tableRowMatch[1] === modeLabel) acc.push(line);
        return acc;
      }

      const exampleMatch = line.match(/^- (\S+?):\s/);
      if (exampleMatch) {
        if (exampleMatch[1] === modeLabel) acc.push(line);
        return acc;
      }

      acc.push(line);
      return acc;
    }, []);

    return `CAVEMAN MODE ACTIVE — level: ${modeLabel}\n\n${filtered.join("\n")}`;
  }

  return [
    `CAVEMAN MODE ACTIVE — level: ${modeLabel}`,
    "",
    "Respond terse like smart caveman. All technical substance stay. Only fluff die.",
    "ACTIVE EVERY RESPONSE. Off only: `stop caveman` or `normal mode`.",
    "Drop articles/filler/pleasantries/hedging. Fragments OK. Technical terms exact. Code blocks unchanged.",
    "Code/commits/security: write normal unless user asks caveman style for that artifact.",
  ].join("\n");
}

export function buildActiveReminder(mode: CavemanMode): string {
  return [
    `CAVEMAN MODE ACTIVE (${canonicalModeLabel(mode)}).`,
    "Drop articles/filler/pleasantries/hedging. Fragments OK.",
    "Preserve technical terms, code, paths, URLs, commands, error strings exactly.",
    "Code/commits/security/irreversible confirmations: write normal when clarity matters.",
  ].join(" ");
}
