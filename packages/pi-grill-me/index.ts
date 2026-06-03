import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";

type GrillState = {
  active: boolean;
  topic: string;
  startedAt: number;
  updatedAt: number;
};

const STATE_ENTRY_TYPE = "pi-grill-me-state";
const PACKAGE_LABEL = "pi-grill-me";

const DEFAULT_STATE: GrillState = {
  active: false,
  topic: "",
  startedAt: 0,
  updatedAt: 0,
};

function cloneState(state: GrillState): GrillState {
  return { ...state };
}

function firstWord(text: string): string {
  return text.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

function readBundledMarkdown(file: string): string {
  return readFileSync(new URL(`./skills/engineering/grill-with-docs/${file}`, import.meta.url), "utf8");
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function extractTextFromMessage(message: unknown): string {
  const maybe = message as { content?: unknown } | undefined;
  const content = maybe?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => {
        const maybePart = part as { type?: unknown; text?: unknown };
        return maybePart.type === "text" && typeof maybePart.text === "string";
      })
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function inferTopic(ctx: ExtensionContext): string {
  const branch = ctx.sessionManager.getBranch();
  const chunks: string[] = [];
  for (let i = branch.length - 1; i >= 0 && chunks.join("\n").length < 1800; i -= 1) {
    const entry = branch[i] as { type?: string; message?: { role?: string } } | undefined;
    if (entry?.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractTextFromMessage(entry.message).trim();
    if (!text || text.startsWith("/grill")) continue;
    chunks.unshift(`${role}: ${text}`);
  }
  return chunks.join("\n\n").trim();
}

function statusMarkdown(state: GrillState): string {
  return `# Grill With Docs Status\n\n- Active: ${state.active ? "yes" : "no"}\n- Topic: ${state.topic || "(none)"}\n- Started: ${state.startedAt ? new Date(state.startedAt).toLocaleString() : "never"}\n- Updated: ${state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "never"}`;
}

const GRILL_WITH_DOCS_SKILL = stripFrontmatter(readBundledMarkdown("SKILL.md"));
const CONTEXT_FORMAT = readBundledMarkdown("CONTEXT-FORMAT.md").trim();
const ADR_FORMAT = readBundledMarkdown("ADR-FORMAT.md").trim();

export default function piGrillMeExtension(pi: ExtensionAPI): void {
  let state: GrillState = cloneState(DEFAULT_STATE);

  function persist(): void {
    state.updatedAt = Date.now();
    pi.appendEntry(STATE_ENTRY_TYPE, cloneState(state));
  }

  function updateUi(ctx: ExtensionContext): void {
    if (!state.active) {
      ctx.ui.setStatus(PACKAGE_LABEL, undefined);
      ctx.ui.setWidget(PACKAGE_LABEL, undefined);
      return;
    }

    const topic = state.topic.length > 90 ? `${state.topic.slice(0, 87)}...` : state.topic;
    ctx.ui.setStatus(PACKAGE_LABEL, ctx.ui.theme.fg("accent", "🔥 grill-with-docs"));
    ctx.ui.setWidget(
      PACKAGE_LABEL,
      [
        ctx.ui.theme.fg("accent", `🔥 Grill With Docs: ${topic || "active"}`),
        ctx.ui.theme.fg("muted", "Uses ask_user_question for grilling questions"),
        ctx.ui.theme.fg("dim", "Updates CONTEXT.md and ADRs when decisions crystallise"),
      ],
      { placement: "belowEditor" },
    );
  }

  function startSession(topic: string, ctx: ExtensionContext): void {
    const now = Date.now();
    state = {
      active: true,
      topic,
      startedAt: now,
      updatedAt: now,
    };
    persist();
    updateUi(ctx);

    pi.sendUserMessage(`Start a grill-with-docs session for this plan/topic:\n\n${topic}\n\nUse the bundled grill-with-docs workflow. First inspect relevant code and documentation if that can answer setup questions. For user-facing grilling questions, use ask_user_question with one focused question, 2-4 options, and your recommended answer first.`);
  }

  async function resolveTopic(args: string, ctx: ExtensionContext): Promise<string | undefined> {
    const trimmed = args.trim();
    if (trimmed) return trimmed;

    const inferred = inferTopic(ctx);
    if (!ctx.hasUI) return inferred || "Current conversation";

    const edited = await ctx.ui.editor("What should I grill with docs?", inferred || "");
    return edited?.trim() || undefined;
  }

  pi.registerCommand("grill", {
    description: "Start or control a grill-with-docs session",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const command = firstWord(trimmed);
      const rest = trimmed.slice(command.length).trim();

      if (command === "help") {
        pi.sendMessage({
          customType: "pi-grill-me-help",
          display: true,
          content: `# Pi Grill Me\n\n- /grill <plan or topic> — start grill-with-docs\n- /grill status — show active state\n- /grill stop — stop injecting grill-with-docs guidance\n- /skill:grill-with-docs <plan> — invoke packaged skill directly\n\nThis package does not install question UI. If ask_user_question is available in the Pi session, grill-with-docs guidance tells the model to use it.`,
        });
        return;
      }

      if (command === "status") {
        pi.sendMessage({ customType: "pi-grill-me-status", display: true, content: statusMarkdown(state) });
        return;
      }

      if (command === "stop") {
        state = { ...cloneState(DEFAULT_STATE), updatedAt: Date.now() };
        persist();
        updateUi(ctx);
        ctx.ui.notify("Grill with docs stopped.", "info");
        return;
      }

      const topic = await resolveTopic(trimmed, ctx);
      if (!topic) {
        ctx.ui.notify("Cancelled grill-with-docs start.", "info");
        return;
      }

      startSession(topic, ctx);
    },
  });

  pi.registerCommand("grill-with-docs", {
    description: "Start a grill-with-docs session",
    handler: async (args, ctx) => {
      const topic = await resolveTopic(args, ctx);
      if (!topic) {
        ctx.ui.notify("Cancelled grill-with-docs start.", "info");
        return;
      }
      startSession(topic, ctx);
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!state.active) return;

    const prompt = `\n\n[PI GRILL ME ACTIVE]\nTopic:\n${state.topic}\n\nBundled grill-with-docs workflow:\n${GRILL_WITH_DOCS_SKILL}\n\nQuestion delivery rules:\n- Use ask_user_question for every user-facing grilling question.\n- Ask one focused question per ask_user_question call.\n- Provide 2-4 concrete options.\n- Put your recommended answer first and include "(Recommended)" in that label.\n- Include short option descriptions with trade-offs.\n- Do not stack multiple ask_user_question calls back-to-back. Wait for the user's answer before continuing.\n- If ask_user_question is unavailable or returns no_ui, fall back to one plain text question and say structured question UI is unavailable.\n\nCode and docs discovery rules:\n- If a question can be answered by exploring the codebase or docs, inspect first instead of asking.\n- Prefer codebase-memory tools for codebase research when available. Start with codebase_memory_get_architecture for broad structure. Use codebase_memory_search_graph or codebase_memory_search_code for anchors. Use codebase_memory_trace_path for callers/callees/data-flow impact. Use codebase_memory_get_code_snippet for exact symbol source after graph search.\n- If codebase fact-finding would consume lots of context and subagent is available, call subagent { "action": "list" }, use executable/non-disabled cavecrew-investigator for read-only locator tasks, and keep decisions/docs in main thread.\n- Use exact file reads for docs, configs, non-code files, graph-insufficient cases, focused follow-up context after codebase-memory narrowing, or cavecrew-investigator unavailable.\n- If codebase-memory is unavailable or stale, say discovery is degraded before falling back to direct reads/search.\n- Look for CONTEXT-MAP.md, CONTEXT.md, and docs/adr/ before shaping domain-language questions.\n- When code contradicts the user's stated domain model, surface the contradiction and ask the user to resolve it.\n\nDocumentation update rules:\n- Update CONTEXT.md inline when a domain term is resolved. Do not batch resolved glossary terms.\n- Keep CONTEXT.md as glossary only: no implementation details, specs, scratch notes, or architectural decisions.\n- Offer ADRs sparingly and only when the decision is hard to reverse, surprising without context, and a real trade-off.\n- Create CONTEXT.md or docs/adr/ lazily only when needed.\n\nCONTEXT.md format reference:\n${CONTEXT_FORMAT}\n\nADR format reference:\n${ADR_FORMAT}\n[/PI GRILL ME ACTIVE]`;

    return { systemPrompt: event.systemPrompt + prompt };
  });

  pi.on("session_start", async (_event, ctx) => {
    state = cloneState(DEFAULT_STATE);
    for (const entry of ctx.sessionManager.getBranch() as unknown[]) {
      const custom = entry as { type?: string; customType?: string; data?: Partial<GrillState> };
      if (custom.type === "custom" && custom.customType === STATE_ENTRY_TYPE && custom.data) {
        state = { ...cloneState(DEFAULT_STATE), ...custom.data };
      }
    }
    updateUi(ctx);
  });
}
