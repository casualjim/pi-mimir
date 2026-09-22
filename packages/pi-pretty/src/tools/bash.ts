/* pi-pretty: bash renderers — display-only.
 *
 * pi-heimdall owns the `bash` tool (sandboxed execute) and attaches these
 * renderers, so output keeps pi-pretty styling. pi-pretty itself never
 * registers, substitutes, or executes the bash tool. */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { resolveBaseBackground, TOOL_RESULT_INDENT, termWidth } from "../config.js";
import { compactErrorLines, inferBashExitCode, stripBashExitStatusLine } from "../helpers.js";
import {
	fillToolBackground,
	fillToolBody,
	rememberToolTitle,
	renderToolDuration,
	renderToolError,
	setCollapsedToolTitle,
} from "../render.js";
import { resolveTextCtor } from "../tui-text.js";
import type { BashDetails, ComponentLike, RenderCtxLike, ThemeLike, TextContent } from "../types.js";

type Result = AgentToolResult<Record<string, unknown>>;
const BASH_RESULT_RENDER_KEY = "__piPrettyBashResultRender";
export interface BashRenderers {
	renderShell: "self";
	/** Returns the host Text component; loosely typed so the tool owner can attach it to its ToolDefinition. */
	renderCall: (args: any, theme: ThemeLike, ctx: RenderCtxLike) => unknown;
	renderResult: (result: Result, opt: unknown, theme: ThemeLike, ctx: RenderCtxLike) => unknown;
}

export function createBashRenderers(
	TextComp?: new (t?: string, x?: number, y?: number) => { setText(v: string): void },
): BashRenderers {
	const TC = resolveTextCtor(TextComp);

	return {
		renderShell: "self",

		renderCall(args: any, theme: ThemeLike, ctx: RenderCtxLike) {
			resolveBaseBackground(theme);
			const text = (ctx.lastComponent ?? new TC("", 0, 0)) as ComponentLike;
			const t = typeof args.timeout === "number" ? ` ${theme.fg("muted", `(timeout ${args.timeout}s)`)}` : "";
			const tw = termWidth() || 80;
			const rawCmd = String(args.command ?? "");
			const headerBudget = ctx.expanded ? tw : Math.max(8, tw - 20);
			const cmd =
				rawCmd.length === 0
					? theme.fg("toolOutput", "...")
					: !ctx.expanded && rawCmd.length > headerBudget
						? `${rawCmd.slice(0, Math.max(1, headerBudget))}…`
						: rawCmd;
			const commandLabel = theme.fg(ctx.isError ? "error" : "toolTitle", theme.bold(`$ ${cmd}`));
			const renderTitle = (suffix = ""): string =>
				fillToolBackground(
					`\n${TOOL_RESULT_INDENT}${commandLabel}${t}${suffix}\n`,
					undefined,
					ctx.expanded ? undefined : tw,
				);
			rememberToolTitle(ctx, text, renderTitle);
			text.setText(renderTitle());
			return text;
		},

		renderResult(result: Result, _opt: unknown, theme: ThemeLike, ctx: RenderCtxLike) {
			resolveBaseBackground(theme);

			const text = (ctx.lastComponent ?? new TC("", 0, 0)) as ComponentLike;
			restoreBashResultRender(ctx, text);
			const displayResult = result;

			const details = displayResult.details;
			const tc = getText(displayResult);
			const d: BashDetails | undefined =
				(details as BashDetails)?._type === "bashResult"
					? (details as BashDetails)
					: tc || ctx.isError
						? {
								_type: "bashResult",
								text: tc || "Error",
								exitCode: inferBashExitCode(tc, ctx.isError ? 1 : 0),
								command: "",
							}
						: undefined;

			if (d?._type === "bashResult") {
				const isErr = ctx.isError || (d.exitCode !== null && d.exitCode !== 0);
				const cleaned = stripBashExitStatusLine(d.text);
				const output = isErr ? compactErrorLines(cleaned).join("\n") : cleaned;
				const lineCount = output.split("\n").length;
				const info = [
					`${lineCount} lines`,
					renderToolDuration(displayResult),
					!ctx.expanded ? "ctrl+o to expand" : "",
				]
					.filter(Boolean)
					.map((part) => theme.fg("dim", part))
					.join(theme.fg("dim", " · "));
				const header = `${TOOL_RESULT_INDENT}${info}`;
				const rw = termWidth();

				if (setCollapsedToolTitle(ctx, text, ` ${info}`)) return text;

				const renderFn = (w: number) => {
					if (!ctx.expanded) return fillToolBody(header, undefined, w);
					if (!output.trim()) return fillToolBody(header, undefined, w);
					const show = output.split("\n");
					const out = [header, "", ...show.map((line: string) => `${TOOL_RESULT_INDENT}${line}`)];
					return fillToolBody(out.join("\n"), undefined, w);
				};

				text.setText(renderFn(rw));
				const baseRender =
					typeof (text as ComponentLike).render === "function" ? (text as ComponentLike).render.bind(text) : null;
				if (baseRender) {
					ctx.state[BASH_RESULT_RENDER_KEY] = baseRender;
					let key: string | undefined;
					// SAFETY: same host Text component contract as restoreBashResultRender;
					// we memoize renders behind the component's own render(width) hook.
					(text as unknown as Record<string, unknown>).render = (w: number) => {
						const width = Math.max(1, Math.floor(w || termWidth()));
						const k = `bash:${ctx.expanded ? "1" : "0"}:${width}:${d.exitCode ?? "killed"}:${output.length}:${renderToolDuration(displayResult)}`;
						if (key !== k) {
							text.setText(renderFn(width));
							key = k;
						}
						return baseRender(width);
					};
				}
				return text;
			}

			if (ctx.isError) {
				text.setText(renderToolError(tc || "Error", theme));
				return text;
			}
			const fc = displayResult.content?.[0];
			text.setText(
				fillToolBody(
					`${TOOL_RESULT_INDENT}${theme.fg("dim", fc && "text" in fc ? String(fc.text).slice(0, 120) : "done")}`,
				),
			);
			return text;
		},
	};
}

function restoreBashResultRender(ctx: RenderCtxLike, text: ComponentLike): void {
	const state = ctx.state;
	const original = state[BASH_RESULT_RENDER_KEY] as ((width: number) => string[]) | undefined;
	if (!original) return;
	// SAFETY: text is the host Text component created in renderResult; the host TUI
	// contract guarantees render(width): string[] even though ComponentLike omits it.
	(text as unknown as { render: (width: number) => string[] }).render = original;
	delete state[BASH_RESULT_RENDER_KEY];
}

function getText(result: Result): string {
	return (
		((result.content ?? []) as TextContent[])
			.filter((c) => c.type === "text")
			.map((c) => c.text)
			.join("\n") ?? ""
	);
}