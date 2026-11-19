// Host-aware ask/confirm router, vendored so every package installs standalone from
// a git subdirectory (omp caches only that subdirectory; the workspace package is
// not published). Keep the copies in pi-dredd, pi-heimdall, pi-jj, and pi-pstack
// identical; pi-pstack/tests/interaction.test.ts enforces the sync.
type AskTool = "ask" | "ask_user" | "ask_user_question";
const OMP_TOOLS = ["ask"] as const;
const PI_TOOLS = ["ask_user", "ask_user_question"] as const;

type Host = { getActiveTools?(): string[] };
type Option = { label: string; description?: string; preview?: string };
type AskDialog = (questions: { id: string; question: string; options: Option[] }[]) => Promise<
  | { kind: "submit"; results: { id: string; selectedOptions: string[]; customInput?: string; timedOut?: boolean }[] }
  | { kind: "chat" }
  | undefined
>;
type InteractionContext = {
  hasUI: boolean;
  ui: object;
  tools?: readonly { name: string }[];
  executeTool?(name: string, args: unknown): Promise<{ isError: boolean; result: { details: unknown } }>;
};

function activeAskTools(host: Host): AskTool[] {
  const active = host.getActiveTools?.() ?? [];
  const order = "zod" in host && host.zod !== undefined ? OMP_TOOLS : PI_TOOLS;
  return order.filter((name) => active.includes(name));
}

export function preferredAskTool(host: Host): AskTool | undefined {
  return activeAskTools(host)[0];
}

function selectedLabel(selection: unknown): string | undefined {
  return Array.isArray(selection) && selection.length === 1 && typeof selection[0] === "string"
    ? selection[0]
    : undefined;
}

function parsePiAnswer(tool: "ask_user" | "ask_user_question", details: unknown): string | undefined {
  if (typeof details !== "object" || details === null || !("cancelled" in details) || details.cancelled !== false || "error" in details) return;
  if (tool === "ask_user") {
    if (!("response" in details) || typeof details.response !== "object" || details.response === null) return;
    const { response } = details;
    if ("kind" in response && response.kind === "selection" && "selections" in response) return selectedLabel(response.selections);
  } else if ("answers" in details && Array.isArray(details.answers) && details.answers.length === 1) {
    const answer: unknown = details.answers[0];
    if (typeof answer === "object" && answer !== null && "kind" in answer && answer.kind === "option"
      && "questionIndex" in answer && answer.questionIndex === 0 && "answer" in answer && typeof answer.answer === "string") return answer.answer;
  }
}

// null means no supported ask API. undefined means a prompt opened but did not return an offered choice.
async function askChoice(ctx: InteractionContext, host: Host, question: string, options: Option[]): Promise<string | null | undefined> {
  const ui = ctx.ui as { askDialog?: AskDialog };
  const id = "choice";
  for (const tool of activeAskTools(host)) {
    if (tool === "ask") {
      if (!ui.askDialog) continue;
      const result = await ui.askDialog([{ id, question, options }]);
      const answer = result?.kind === "submit" && result.results.length === 1 ? result.results[0] : undefined;
      const label = answer?.id === id && !answer.timedOut && answer.customInput === undefined && selectedLabel(answer.selectedOptions);
      return options.find((option) => option.label === label)?.label;
    }
    // Pi only exposes nested execution on tool contexts, and ctx.tools excludes model-only tools.
    if (!ctx.executeTool || !ctx.tools?.some(({ name }) => name === tool)) continue;
    if (tool === "ask_user_question" && (options.length < 2 || options.length > 4 || options.some(({ label }) => label.length > 60))) continue;
    const args = tool === "ask_user"
      ? { question, allowFreeform: false, options: options.map(({ label, description, preview }) => ({ title: label, description: preview ?? description })) }
      : { questions: [{ question, header: "Decision", options: options.map((option) => ({ ...option, description: option.description ?? option.label })) }] };
    const outcome = await ctx.executeTool(tool, args);
    const label = !outcome.isError && parsePiAnswer(tool, outcome.result.details);
    return options.find((option) => option.label === label)?.label;
  }
  return null;
}

export async function confirmUser(ctx: InteractionContext, host: Host, title: string, message: string, preview?: string): Promise<boolean | undefined> {
  if (!ctx.hasUI) return;
  const choice = await askChoice(ctx, host, message, [{ label: "Decline" }, { label: "Allow", preview }]);
  if (choice !== null) return choice === "Allow";
  const ui = ctx.ui as { confirm?(title: string, message: string): Promise<boolean> };
  return ui.confirm?.(title, preview ? `${message}\n\n${preview}` : message);
}

export async function selectUser(ctx: InteractionContext, host: Host, title: string, labels: string[]): Promise<string | undefined> {
  if (!ctx.hasUI) return;
  const choice = await askChoice(ctx, host, title, labels.map((label) => ({ label })));
  if (choice !== null) return choice;
  const ui = ctx.ui as { select?(title: string, options: string[]): Promise<string | undefined> };
  return ui.select?.(title, labels);
}
