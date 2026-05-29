import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildActiveReminder, loadCavemanRules } from "./rules.js";
import {
  clearModeState,
  getDefaultMode,
  INDEPENDENT_MODES,
  normalizeMode,
  readModeState,
  safeWriteMode,
  type CavemanMode,
} from "./mode-state.js";

const MSG_TYPE_CAVEMAN_RULES = "caveman-rules";

function modeFromSkillCommand(text: string): CavemanMode | null | "off" {
  const trimmed = text.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0] ?? "";
  const arg = parts[1] ?? "";

  if (cmd === "/skill:caveman-commit" || cmd === "/caveman-commit") return "commit";
  if (cmd === "/skill:caveman-review" || cmd === "/caveman-review") return "review";
  if (cmd === "/skill:caveman-compress" || cmd === "/caveman-compress") return "compress";

  if (cmd === "/skill:caveman" || cmd === "/caveman") {
    if (!arg) return getDefaultMode();
    if (["off", "stop", "disable"].includes(arg)) return "off";
    return normalizeMode(arg);
  }

  return null;
}

function modeFromNaturalLanguage(text: string): CavemanMode | null | "off" {
  const prompt = text.trim().toLowerCase();
  if (!prompt) return null;

  if (/\bnormal mode\b/i.test(prompt) ||
      /\b(stop|disable|deactivate|turn off)\b.*\bcaveman\b/i.test(prompt) ||
      /\bcaveman\b.*\b(stop|disable|deactivate|turn off)\b/i.test(prompt)) {
    return "off";
  }

  if (/\b(activate|enable|turn on|start|talk like|use)\b.*\bcaveman\b/i.test(prompt) ||
      /\bcaveman\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt)) {
    return getDefaultMode();
  }

  return null;
}

function setMode(mode: CavemanMode | "off" | null): void {
  if (!mode) return;
  if (mode === "off") clearModeState();
  else safeWriteMode(mode);
}

function activeBaseMode(): CavemanMode | null {
  const active = readModeState();
  if (!active || INDEPENDENT_MODES.has(active)) return null;
  return active;
}

export default function cavemanExtension(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    const mode = getDefaultMode();
    if (mode === "off") {
      clearModeState();
      return;
    }

    safeWriteMode(mode);
    if (!INDEPENDENT_MODES.has(mode)) {
      pi.sendMessage({
        customType: MSG_TYPE_CAVEMAN_RULES,
        content: loadCavemanRules(mode),
        display: false,
      });
    }
  });

  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" };
    const mode = modeFromSkillCommand(event.text) ?? modeFromNaturalLanguage(event.text);
    setMode(mode);
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event) => {
    const mode = activeBaseMode();
    if (!mode) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildActiveReminder(mode)}`,
    };
  });
}

export const __test = {
  modeFromSkillCommand,
  modeFromNaturalLanguage,
  activeBaseMode,
};
