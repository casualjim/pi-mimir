import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { AgentToolResult, ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getReadmePath } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerReadTool } from "../src/tools/read.js";
import type { ReadDetails, SdkToolDef, ThemeLike, ToolContent } from "../src/types.js";

const mockTheme = {
	fg: (key: string, text: string) => `<${key}>${text}</${key}>`,
	bold: (text: string) => text,
};

afterEach(() => vi.unstubAllEnvs());

class MockText {
	private text = "";
	private updateCount = 0;

	setText(value: string) {
		this.text = value;
		this.updateCount++;
	}

	getText() {
		return this.text;
	}

	getUpdateCount() {
		return this.updateCount;
	}
}

interface ReadToolHarness {
	execute(
		toolCallId: string,
		params: { path: string; offset?: number },
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		context: Record<string, never>,
	): Promise<AgentToolResult<ReadDetails>>;
	renderResult(
		result: AgentToolResult<ReadDetails>,
		options: Record<string, never>,
		theme: ThemeLike,
		context: {
			lastComponent: MockText;
			isError: boolean;
			state: Record<string, never>;
			expanded: boolean;
			invalidate?: () => void;
		},
	): MockText;
}

function loadReadTool(content: string, renderContent?: (...args: any[]) => Promise<string>): ReadToolHarness {
	let tool: ReadToolHarness | undefined;
	const pi = {
		registerTool: (definition: ToolDefinition) => {
			tool = definition as unknown as ReadToolHarness;
		},
	} as unknown as ExtensionAPI;
	const sdkTool: SdkToolDef = {
		description: "read fixture",
		parameters: { type: "object", properties: {} },
		execute: async () => ({ content: [{ type: "text", text: content }] satisfies ToolContent[], details: {} }),
	};

	registerReadTool(pi, process.cwd(), undefined, sdkTool, MockText, renderContent);
	if (!tool) throw new Error("read tool was not registered");
	return tool;
}

async function renderRead(content: string, expanded: boolean, path: string, offset?: number) {
	const tool = loadReadTool(content);
	const result = await tool.execute("t1", { path, offset }, undefined, undefined, {});
	return tool.renderResult(result, {}, mockTheme, {
		lastComponent: new MockText(),
		isError: false,
		state: {},
		expanded,
	});
}

async function renderSkill(
	content: string,
	expanded: boolean,
	path = "/tmp/skills/directory-name/SKILL.md",
	offset?: number,
) {
	return renderRead(content, expanded, path, offset);
}

const skillContent = `---
name: frontmatter-name
description: Test skill rendering.
---

# Instructions

Follow the workflow.`;

describe("read title spacing", () => {
	const plainFile = "const a = 1;\nconst b = 2;\n";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR sequences from rendered output
	const SGR = /[\u001b+\[[0-9;]*m/g;
	const visible = (line: string): string => line.replace(SGR, "").trim();

	it("collapsed: the read title includes the expand hint and keeps its padding", async () => {
		const rendered = await renderSkill(plainFile, false, "/tmp/project/src/index.ts");
		const lines = rendered.getText().split("\n");
		const titleIdx = lines.findIndex((l) => l.includes("→ read"));
		const infoIdx = lines.findIndex((l) => l.includes("ctrl+o to expand"));
		expect(titleIdx).toBe(1);
		expect(infoIdx).toBe(titleIdx);
		expect(lines[titleIdx]).toContain("3 lines");
		expect(visible(lines[titleIdx - 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 1] ?? "")).toBe("");
		expect(visible(lines.at(-1) ?? "")).toBe("");
	});

	it("expanded: the read title has top and bottom padding", async () => {
		const rendered = await renderSkill(plainFile, true, "/tmp/project/src/index.ts");
		const lines = rendered.getText().split("\n");
		const titleIdx = lines.findIndex((l) => l.includes("→ read"));
		const ruleIdx = lines.findIndex((l, i) => i > titleIdx && l.includes("─"));
		expect(titleIdx).toBe(1);
		expect(visible(lines[titleIdx - 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 1] ?? "")).toBe("");
		expect(ruleIdx).toBe(titleIdx + 2);
		expect(visible(lines.at(-1) ?? "")).toBe("");
	});

	it("collapsed skill header has top and bottom padding", async () => {
		const rendered = await renderSkill(skillContent, false);
		const lines = rendered.getText().split("\n");
		expect(lines).toHaveLength(3);
		expect(visible(lines[0] ?? "")).toBe("");
		expect(visible(lines[1] ?? "")).toContain("[skill]");
		expect(visible(lines[2] ?? "")).toBe("");
	});

	it("expanded skill: the divider follows the padded skill header", async () => {
		const rendered = await renderSkill(skillContent, true);
		const lines = rendered.getText().split("\n");
		const titleIdx = lines.findIndex((l) => l.includes("[skill]"));
		expect(titleIdx).toBe(1);
		expect(visible(lines[titleIdx - 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 2] ?? "")).toContain("─");
		expect(visible(lines.at(-1) ?? "")).toBe("");
	});

	it("async highlight keeps the body below the padded plain-file title", async () => {
		const rendered = await renderSkill(plainFile, true, "/tmp/project/src/index.ts");
		await vi.waitFor(() => expect(rendered.getUpdateCount()).toBeGreaterThanOrEqual(2));
		const lines = rendered.getText().split("\n");
		const titleIdx = lines.findIndex((l) => l.includes("→ read"));
		const bodyIdx = lines.findIndex((l, i) => i > titleIdx && l.includes("│"));
		expect(titleIdx).toBe(1);
		expect(visible(lines[titleIdx - 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 1] ?? "")).toBe("");
		expect(bodyIdx).toBe(titleIdx + 2);
		expect(visible(lines.at(-1) ?? "")).toBe("");
	});

	it("async highlight keeps the divider below the padded skill header", async () => {
		const rendered = await renderSkill(skillContent, true);
		await vi.waitFor(() => expect(rendered.getUpdateCount()).toBeGreaterThanOrEqual(2));
		const lines = rendered.getText().split("\n");
		const titleIdx = lines.findIndex((l) => l.includes("[skill]"));
		expect(titleIdx).toBe(1);
		expect(visible(lines[titleIdx + 1] ?? "")).toBe("");
		expect(visible(lines[titleIdx + 2] ?? "")).toContain("─");
	});

	it.each([
		["README.md", join(dirname(getReadmePath()), "README.md")],
		["docs", join(dirname(getReadmePath()), "docs", "tui.md")],
		["examples", join(dirname(getReadmePath()), "examples", "extensions", "todo.ts")],
	])("collapsed Pi %s reads use the docs label", async (_kind, path) => {
		const rendered = await renderRead("# Pi docs", false, path);
		const output = stripVTControlCharacters(rendered.getText());
		const label = path.slice(dirname(getReadmePath()).length + 1).replaceAll("\\", "/");
		expect(output).toContain("→ read docs");
		expect(output).toContain(label);
	});

	it("expanded Pi docs reads retain the ordinary read title", async () => {
		const path = join(dirname(getReadmePath()), "docs", "tui.md");
		const rendered = await renderRead("# Pi docs", true, path);
		const output = stripVTControlCharacters(rendered.getText());
		expect(output).toContain("→ read");
		expect(output).not.toContain("→ read docs");
	});

	it("does not label project docs as Pi docs", async () => {
		const rendered = await renderRead("# Project docs", false, "/tmp/project/docs/tui.md");
		const output = stripVTControlCharacters(rendered.getText());
		expect(output).toContain("→ read");
		expect(output).not.toContain("→ read docs");
	});

	it("invalidates once after highlighting without recursively re-rendering", async () => {
		const renderContent = vi.fn(async () => "highlighted body");
		const tool = loadReadTool(plainFile, renderContent);
		const result = await tool.execute("t1", { path: "/tmp/project/src/index.ts" }, undefined, undefined, {});
		const component = new MockText();
		const state: Record<string, never> = {};
		let context: any;
		const invalidate = vi.fn(() => {
			if (invalidate.mock.calls.length === 1) tool.renderResult(result, {}, mockTheme, context);
		});
		context = { lastComponent: component, isError: false, state, expanded: true, invalidate };

		tool.renderResult(result, {}, mockTheme, context);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(renderContent).toHaveBeenCalledOnce();
		expect(invalidate).toHaveBeenCalledOnce();
		expect(component.getText()).toContain("highlighted body");
	});

	it("does not apply stale highlighting after the result is collapsed", async () => {
		let resolveHighlight!: (value: string) => void;
		const pendingHighlight = new Promise<string>((resolve) => {
			resolveHighlight = resolve;
		});
		const tool = loadReadTool(plainFile, async () => pendingHighlight);
		const result = await tool.execute("t1", { path: "/tmp/project/src/index.ts" }, undefined, undefined, {});
		const component = new MockText();
		const state: Record<string, never> = {};

		tool.renderResult(result, {}, mockTheme, {
			lastComponent: component,
			isError: false,
			state,
			expanded: true,
		});
		tool.renderResult(result, {}, mockTheme, {
			lastComponent: component,
			isError: false,
			state,
			expanded: false,
		});

		resolveHighlight("stale highlighted body");
		await pendingHighlight;
		await Promise.resolve();
		expect(component.getText()).toContain("ctrl+o to expand");
		expect(component.getText()).not.toContain("stale highlighted body");
	});
});

describe("read skill presentation", () => {
	it("renders a themed skill summary when collapsed", async () => {
		const rendered = await renderSkill(skillContent, false);
		const output = rendered.getText();

		expect(output).toContain("<accent>[skill]</accent>");
		expect(output).toContain("<toolTitle>frontmatter-name</toolTitle>");
		expect(output).toContain("<dim>ctrl+o to expand</dim>");
		expect(output).not.toContain("# Instructions");
		expect(output).not.toContain("→ read");
	});

	it("keeps the themed header and renders full content when expanded", async () => {
		const rendered = await renderSkill(skillContent, true);
		await vi.waitFor(() => expect(rendered.getUpdateCount()).toBeGreaterThanOrEqual(2));
		const output = rendered.getText();

		expect(output).toContain("<accent>[skill]</accent>");
		expect(output).toContain("<toolTitle>frontmatter-name</toolTitle>");
		expect(output).toContain("<dim>ctrl+o to collapse</dim>");
		expect(output).toContain("─");
		expect(output).toContain("Instructions");
		expect(output).toContain("Follow the workflow.");
		expect(output).not.toContain("→ read");
	});

	it("falls back to the parent directory when frontmatter has no name", async () => {
		const rendered = await renderSkill("# Instructions", false);
		expect(rendered.getText()).toContain("<toolTitle>directory-name</toolTitle>");
	});

	it("does not treat other markdown files as canonical SKILL.md files", async () => {
		const rendered = await renderSkill(skillContent, false, "/tmp/skills/frontmatter-name/README.md");
		expect(rendered.getText()).toContain("→ read");
		expect(rendered.getText()).not.toContain("[skill]");
	});
});

describe("read line numbering", () => {
	it("keeps offset line numbers within the terminal width after asynchronous highlighting", async () => {
		vi.stubEnv("COLUMNS", "28");
		const content = `const first = "${"x".repeat(80)}";\nconst second = 2;`;
		const rendered = await renderSkill(content, true, "/tmp/example.ts", 40);
		await vi.waitFor(() => expect(rendered.getUpdateCount()).toBeGreaterThanOrEqual(2));
		const output = stripVTControlCharacters(rendered.getText());

		expect(output).toMatch(/^[ \t]*41[ \t]+│/m);
		expect(output).toMatch(/^[ \t]*42[ \t]+│[ \t]+const second = 2;/m);
		const numberedLines = output.split("\n").filter((line) => line.includes("│"));
		expect(numberedLines).toHaveLength(2);
		for (const line of numberedLines) expect(line.length).toBeLessThanOrEqual(25);
	});

	it("reserves gutter width when offset line numbers cross a digit boundary", async () => {
		vi.stubEnv("COLUMNS", "28");
		const content = `${"x".repeat(80)}\n${"y".repeat(80)}`;
		const rendered = await renderSkill(content, true, "/tmp/example.ts", 998);
		const synchronousOutput = stripVTControlCharacters(rendered.getText());
		const synchronousLines = synchronousOutput.split("\n").filter((line) => line.includes("│"));
		expect(synchronousLines).toHaveLength(2);
		for (const line of synchronousLines) expect(line.length).toBeLessThanOrEqual(25);

		await vi.waitFor(() => expect(rendered.getUpdateCount()).toBeGreaterThanOrEqual(2));
		const output = stripVTControlCharacters(rendered.getText());
		expect(output).toMatch(/^[ \t]*999[ \t]+│/m);
		expect(output).toMatch(/^[ \t]*1000[ \t]+│/m);
		const numberedLines = output.split("\n").filter((line) => line.includes("│"));
		expect(numberedLines).toHaveLength(2);
		for (const line of numberedLines) expect(line.length).toBeLessThanOrEqual(25);
	});
});
