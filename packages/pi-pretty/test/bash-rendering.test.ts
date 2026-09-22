import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";

import piPrettyExtension from "../src/index.js";
import { createBashRenderers } from "../src/tools/bash.js";

class MockText {
	private text = "";
	constructor(_text = "", _x = 0, _y = 0) {}
	setText(value: string) {
		this.text = value;
	}
	getText() {
		return this.text;
	}
	render(_width: number) {
		return this.text.split("\n");
	}
}

const mockTheme = {
	fg: (_key: string, text: string) => text,
	bold: (text: string) => text,
};

const ansiMockTheme = {
	fg: (_key: string, text: string) => `\x1b[31m${text}\x1b[0m`,
	bg: (_key: string, text: string) => `\x1b[48;2;1;2;3m${text}`,
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function withStdoutColumns<T>(columns: number, fn: () => T): T {
	const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
	Object.defineProperty(process.stdout, "columns", { configurable: true, value: columns });
	try {
		return fn();
	} finally {
		if (descriptor) {
			Object.defineProperty(process.stdout, "columns", descriptor);
		} else {
			delete (process.stdout as { columns?: number }).columns;
		}
	}
}

function renderers() {
	return createBashRenderers(MockText) as unknown as {
		renderShell: string;
		renderCall: (args: any, theme: any, ctx: any) => MockText;
		renderResult: (result: any, opt: unknown, theme: any, ctx: any) => MockText;
	};
}

describe("bash renderers export", () => {
	it("exposes self-rendering shell renderers for the tool owner", () => {
		const r = renderers();
		expect(r.renderShell).toBe("self");
		expect(typeof r.renderCall).toBe("function");
		expect(typeof r.renderResult).toBe("function");
	});
});

describe("bash renderCall expansion", () => {
	beforeEach(() => {
		process.stdout.columns = 100;
	});
	it("truncates long commands when collapsed", () => {
		const command = `printf '${"x".repeat(120)}'`;

		const rendered = renderers().renderCall({ command }, mockTheme, {
			lastComponent: new MockText(),
			isError: false,
			state: {},
			expanded: false,
			invalidate: () => {},
		});

		expect(rendered.getText()).toContain("$");
		expect(rendered.getText()).toContain("…");
		expect(rendered.getText()).not.toContain(command);
	});

	it("shows the full command when expanded", () => {
		const command = `printf '${"x".repeat(120)}'`;

		const rendered = renderers().renderCall({ command }, mockTheme, {
			lastComponent: new MockText(),
			isError: false,
			state: {},
			expanded: true,
			invalidate: () => {},
		});

		expect(rendered.getText()).toContain(command);
	});

	it("preserves timeout text in both collapsed and expanded states", () => {
		const command = `printf '${"x".repeat(120)}'`;

		const collapsed = renderers().renderCall({ command, timeout: 5 }, mockTheme, {
			lastComponent: new MockText(),
			isError: false,
			state: {},
			expanded: false,
			invalidate: () => {},
		});
		const expanded = renderers().renderCall({ command, timeout: 5 }, mockTheme, {
			lastComponent: new MockText(),
			isError: false,
			state: {},
			expanded: true,
			invalidate: () => {},
		});

		expect(collapsed.getText()).toContain("(timeout 5s)");
		expect(expanded.getText()).toContain("(timeout 5s)");
	});

	it("truncates ANSI tool headers that exceed the terminal width", () => {
		withStdoutColumns(84, () => {
			const command = `printf '${"界".repeat(120)}'`;

			const rendered = renderers().renderCall({ command }, ansiMockTheme, {
				lastComponent: new MockText(),
				isError: false,
				state: {},
				expanded: false,
				invalidate: () => {},
			});

			for (const line of rendered.getText().split("\n")) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(84);
			}
		});
	});

	it("does not exceed narrow terminal widths", () => {
		withStdoutColumns(24, () => {
			const command = `printf '${"x".repeat(120)}'`;

			const rendered = renderers().renderCall({ command }, ansiMockTheme, {
				lastComponent: new MockText(),
				isError: false,
				state: {},
				expanded: false,
				invalidate: () => {},
			});

			for (const line of rendered.getText().split("\n")) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(24);
			}
		});
	});

	it("does not add extra internal padding to the bash title in error state", () => {
		withStdoutColumns(48, () => {
			const rendered = renderers().renderCall({ command: "false" }, ansiMockTheme, {
				lastComponent: new MockText(),
				isError: true,
				state: {},
				expanded: false,
				invalidate: () => {},
			});

			const lines = stripAnsi(rendered.getText()).split("\n");
			expect(lines[0]?.trim()).toBe("");
			expect(lines[1]).toMatch(/^ \$ false/);
			expect(rendered.getText()).toContain("\x1b[31m");
		});
	});

	it("adds one blank row above and below the header", () => {
		withStdoutColumns(100, () => {
			const rendered = renderers().renderCall({ command: "pwd" }, mockTheme, {
				lastComponent: new MockText(),
				isError: false,
				state: {},
				expanded: false,
				invalidate: () => {},
			});
			const lines = stripAnsi(rendered.getText()).split("\n");
			expect(lines).toHaveLength(3);
			expect(lines[0]?.trim()).toBe("");
			expect(lines[1]?.trim()).not.toBe("");
			expect(lines[2]?.trim()).toBe("");
		});
	});
});

describe("bash renderResult", () => {
	it("collapses multi-line tool errors until expanded", () => {
		withStdoutColumns(48, () => {
			const collapsed = renderers().renderResult(
				{ content: [{ type: "text", text: "\nfirst error\n\n\nsecond error\n" }] },
				{},
				ansiMockTheme,
				{
					lastComponent: new MockText(),
					isError: true,
					state: {},
					expanded: false,
					invalidate: () => {},
				},
			);
			const collapsedLines = stripAnsi(collapsed.getText()).split("\n");
			expect(collapsedLines[0]).toContain("3 lines · ctrl+o to expand");
			expect(collapsedLines[0]).not.toContain("exit");
			expect(collapsedLines.at(-1)?.trim()).toBe("");
			expect(collapsedLines.some((l) => l.includes("first error"))).toBe(false);

			const expanded = renderers().renderResult(
				{ content: [{ type: "text", text: "\nfirst error\n\n\nsecond error\n" }] },
				{},
				ansiMockTheme,
				{
					lastComponent: new MockText(),
					isError: true,
					state: {},
					expanded: true,
					invalidate: () => {},
				},
			);
			const lines = stripAnsi(expanded.getText()).split("\n");
			expect(lines[1].trim()).toBe("");
			expect(lines[2]).toMatch(/^ first error/);
			expect(lines[4]).toMatch(/^ second error/);
			expect(lines.at(-1)?.trim()).toBe("");
		});
	});

	it("applies tool background correctly to bash results without unnecessary resets", () => {
		withStdoutColumns(64, () => {
			const rendered = renderers().renderResult(
				{
					content: [{ type: "text", text: "output" }],
					details: { _type: "bashResult", text: "output", exitCode: 1, command: "test" },
				},
				{},
				ansiMockTheme,
				{
					lastComponent: new MockText(),
					isError: true,
					state: { _tw: "64" },
					expanded: false,
					invalidate: () => {},
				},
			);

			expect(rendered.getText()).toMatch(/\x1b\[48;/); // tool background is applied
			expect(rendered.getText()).not.toContain("\x1b[0m");
			expect(rendered.getText()).not.toContain("\x1b[49m");
			for (const line of rendered.getText().split("\n")) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(64);
			}
		});
	});

	it("renders bash results using the component render width instead of stdout columns", () => {
		withStdoutColumns(120, () => {
			const rendered = renderers().renderResult(
				{ content: [{ type: "text", text: "hello world" }], details: { _type: "bashResult", text: "hello world", exitCode: 0, command: "echo hi" } },
				{},
				mockTheme,
				{
					lastComponent: new MockText(),
					isError: false,
					state: {},
				expanded: true,
				invalidate: () => {},
			},
		);

			rendered.render(80);
			const lines = stripAnsi(rendered.getText()).split("\n");
			expect(lines[1].trim()).toBe("");
			for (const line of rendered.getText().split("\n")) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(80);
			}
		});
	});
});

describe("pi-pretty no longer registers bash", () => {
	it("registers only its own display tools", () => {
		const noopExec = async (): Promise<{ content: { type: "text"; text: string }[]; details: {} }> => ({
			content: [{ type: "text", text: "" }],
			details: {},
		});
		const tools = new Map<string, any>();
		// pi as any: test mocks partial ExtensionAPI; repo typecheck excludes test/.
		piPrettyExtension(
			{
				registerTool: (tool: any) => tools.set(tool.name, tool),
				registerCommand: () => {},
				on: () => () => {},
			} as any,
			{
				sdk: {
					createReadToolDefinition: () => ({ name: "read", description: "read", parameters: {}, execute: noopExec }),
					createLsToolDefinition: () => ({ name: "ls", description: "ls", parameters: {}, execute: noopExec }),
					createFindToolDefinition: () => ({ name: "find", description: "find", parameters: {}, execute: noopExec }),
					createGrepToolDefinition: () => ({ name: "grep", description: "grep", parameters: {}, execute: noopExec }),
					getAgentDir: () => "/tmp/pi-pretty-test",
				},
				TextComponent: MockText,
			},
		);
		expect(tools.has("bash")).toBe(false);
		expect(tools.has("ls")).toBe(false); // ls stays default-disabled
		expect([...tools.keys()].sort()).toEqual(["find", "grep", "read"]);
	});
});