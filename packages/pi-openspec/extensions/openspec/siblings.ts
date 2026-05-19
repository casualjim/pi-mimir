/**
 * Declarative registry of pi-openspec's sibling Pi plugins.
 *
 * Single source of truth for: presence detection (package-checks.ts),
 * session_start "missing plugins" warning (session-hooks.ts), and
 * /openspec-setup installer (setup-command.ts). Add a sibling here and every
 * consumer picks it up automatically.
 *
 * Detection is filesystem-based via a regex over ~/.pi/agent/settings.json
 * — no runtime import of sibling packages (keeps openspec pure-orchestrator).
 */

export interface SiblingPlugin {
	/** Install spec passed to `pi install`. Prefixed with `npm:` for Pi's installer. */
	readonly pkg: string;
	/** Case-insensitive regex that matches the package in ~/.pi/agent/settings.json. */
	readonly matches: RegExp;
	/** What the sibling provides — shown in /openspec-setup confirmation and reports. */
	readonly provides: string;
}

export const SIBLINGS: readonly SiblingPlugin[] = [
	{
		pkg: "npm:@tintinweb/pi-subagents",
		matches: /@tintinweb\/pi-subagents/i,
		provides: "Agent / get_subagent_result / steer_subagent tools",
	},
	{
		pkg: "npm:@juicesharp/rpiv-ask-user-question",
		matches: /rpiv-ask-user-question/i,
		provides: "ask_user_question tool",
	},
	{
		pkg: "npm:@juicesharp/rpiv-todo",
		matches: /rpiv-todo/i,
		provides: "todo tool + /todos command + overlay widget",
	},
	{
		pkg: "npm:@juicesharp/rpiv-web-tools",
		matches: /rpiv-web-tools/i,
		provides: "web_search + web_fetch tools + /web-search-config",
	},
	{
		pkg: "npm:@juicesharp/rpiv-args",
		matches: /rpiv-args(?![-\w])/i,
		provides: "skill-argument resolver — substitutes $N/$ARGUMENTS in skill bodies",
	},
	{
		pkg: "npm:@juicesharp/rpiv-btw",
		matches: /rpiv-btw/i,
		provides: "between-turn workflow reminders and gate prompts",
	},
	{
		pkg: "npm:pi-mcp-adapter",
		matches: /pi-mcp-adapter/i,
		provides: "MCP adapter for codebase-memory tool wiring",
	},
];
