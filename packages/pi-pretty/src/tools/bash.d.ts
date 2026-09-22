/* Declaration boundary for @casualjim/pi-pretty/bash-renderers.
 *
 * Consumers (pi-heimdall) type-check against this file — their strict tsconfig
 * flags do not apply to it (skipLibCheck). The runtime entry stays bash.ts. */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

type Result = AgentToolResult<Record<string, unknown>>;

export interface BashRenderers {
	renderShell: "self";
	/** Renders the `$ command` call header; returns the host Text component. */
	renderCall: (args: any, theme: any, ctx: any) => unknown;
	/** Renders bash output with pi-pretty styling; returns the host Text component. */
	renderResult: (result: Result, options: unknown, theme: any, ctx: any) => unknown;
}

/** Build pi-pretty's bash renderers. TextComp is the host TUI Text class; when omitted, pi-tui's Text is used. */
export declare function createBashRenderers(
	TextComp?: new (t?: string, x?: number, y?: number) => { setText(v: string): void },
): BashRenderers;