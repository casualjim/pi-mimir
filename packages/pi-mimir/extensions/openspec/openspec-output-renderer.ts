import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

export const OPENSPEC_CLI_OUTPUT_MESSAGE = "openspec-cli-output";

export interface OpenSpecCliOutputDetails {
	label: string;
	command: string;
	exitCode: number;
	stdout?: string;
	stderr?: string;
}

type RenderTheme = {
	fg(color: "success" | "error" | "warning" | "muted" | "toolTitle", text: string): string;
	getBgAnsi(color: "toolSuccessBg" | "toolErrorBg"): string;
};

type RenderMessage = {
	content: string | Array<{ type: string; text?: string }>;
	details?: unknown;
};

const RESET = "\x1B[0m";
const ANSI_STYLE_RE = /\x1B\[([0-9;]*)m/g;
const COLLAPSED_LINE_LIMIT = 80;

export function registerOpenSpecCliOutputRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer<OpenSpecCliOutputDetails>(OPENSPEC_CLI_OUTPUT_MESSAGE, (message, options, theme) => {
		return new OpenSpecCliOutputComponent(message as RenderMessage, options.expanded, theme as RenderTheme);
	});
}

export function sendOpenSpecCliOutput(pi: ExtensionAPI, details: OpenSpecCliOutputDetails, output: string): void {
	pi.sendMessage<OpenSpecCliOutputDetails>({
		customType: OPENSPEC_CLI_OUTPUT_MESSAGE,
		content: output,
		display: true,
		details,
	});
}

class OpenSpecCliOutputComponent implements Component {
	constructor(
		private readonly message: RenderMessage,
		private readonly expanded: boolean,
		private readonly theme: RenderTheme,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const details = readDetails(this.message.details);
		const ok = details.exitCode === 0;
		const statusColor = ok ? "success" : "error";
		const bg = this.theme.getBgAnsi(ok ? "toolSuccessBg" : "toolErrorBg");
		const output = messageText(this.message).trimEnd() || `${details.label} completed.`;
		const outputLines = output.split("\n");
		const visibleLines = this.expanded ? outputLines : outputLines.slice(0, COLLAPSED_LINE_LIMIT);
		const hiddenCount = outputLines.length - visibleLines.length;
		const command = details.command ? ` ${this.theme.fg("muted", details.command)}` : "";
		const header = `${this.theme.fg(statusColor, ok ? "✓" : "✗")} ${this.theme.fg("toolTitle", details.label)}${command} ${this.theme.fg("muted", `(exit ${details.exitCode})`)}`;
		const footer = hiddenCount > 0 ? this.theme.fg("warning", `… ${hiddenCount} more lines (expand message to show all)`) : undefined;
		const lines = [header, "", ...visibleLines, ...(footer ? ["", footer] : [])];
		return lines.map((line) => fillToolBackground(line, bg, width));
	}
}

function readDetails(details: unknown): OpenSpecCliOutputDetails {
	if (details && typeof details === "object") {
		const value = details as Partial<OpenSpecCliOutputDetails>;
		return {
			label: typeof value.label === "string" ? value.label : "openspec",
			command: typeof value.command === "string" ? value.command : "",
			exitCode: typeof value.exitCode === "number" ? value.exitCode : 0,
			stdout: typeof value.stdout === "string" ? value.stdout : undefined,
			stderr: typeof value.stderr === "string" ? value.stderr : undefined,
		};
	}
	return { label: "openspec", command: "", exitCode: 0 };
}

function messageText(message: RenderMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

function fillToolBackground(line: string, bg: string, width: number): string {
	const normalized = preserveToolBackground(line, bg);
	const padding = Math.max(0, width - visibleWidth(normalized));
	return `${bg}${normalized}${" ".repeat(padding)}${RESET}`;
}

function preserveToolBackground(line: string, bg: string): string {
	return line.replace(ANSI_STYLE_RE, (seq: string, params: string) => {
		const codes = params.split(";");
		return params === "0" || codes.includes("49") ? `${seq}${bg}` : seq;
	});
}
