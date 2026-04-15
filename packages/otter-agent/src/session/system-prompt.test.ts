import { Type } from "@sinclair/typebox";
import { describe, expect, test } from "vitest";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { buildSystemPrompt, buildToolSection } from "./system-prompt.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function createTool(
	name: string,
	options?: { snippet?: string; guidelines?: string[] },
): ToolDefinition {
	return {
		name,
		label: name,
		description: `Tool: ${name}`,
		promptSnippet: options?.snippet,
		promptGuidelines: options?.guidelines,
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: undefined };
		},
	};
}

// ─── buildSystemPrompt ───────────────────────────────────────────────

describe("buildSystemPrompt", () => {
	test("base prompt only", () => {
		const result = buildSystemPrompt({
			basePrompt: "You are a helpful assistant.",
			tools: [],
		});
		expect(result).toBe("You are a helpful assistant.");
	});

	test("base prompt with environment append", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			environmentAppend: "You are in Docker.",
			tools: [],
		});
		expect(result).toBe("Base.\n\nYou are in Docker.");
	});

	test("base prompt with tools", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			tools: [createTool("read", { snippet: "Read files", guidelines: ["Use read for files"] })],
		});
		expect(result).toContain("Base.");
		expect(result).toContain("# Available Tools");
		expect(result).toContain("- read: Read files");
		expect(result).toContain("# Guidelines");
		expect(result).toContain("- Use read for files");
	});

	test("all three components", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			environmentAppend: "Environment info.",
			tools: [createTool("bash", { snippet: "Run commands" })],
		});

		const sections = result.split("\n\n");
		expect(sections[0]).toBe("Base.");
		expect(sections[1]).toBe("Environment info.");
		expect(sections[2]).toContain("# Available Tools");
		expect(sections[2]).toContain("- bash: Run commands");
	});

	test("empty environment append is excluded", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			environmentAppend: "",
			tools: [],
		});
		expect(result).toBe("Base.");
	});

	test("undefined environment append is excluded", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			environmentAppend: undefined,
			tools: [],
		});
		expect(result).toBe("Base.");
	});

	test("tools without snippets or guidelines produce no tool section", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			tools: [createTool("silent")],
		});
		expect(result).toBe("Base.");
		expect(result).not.toContain("# Available Tools");
		expect(result).not.toContain("# Guidelines");
	});

	test("multiple tools with mixed snippets and guidelines", () => {
		const result = buildSystemPrompt({
			basePrompt: "Base.",
			tools: [
				createTool("read", { snippet: "Read files", guidelines: ["Be careful with paths"] }),
				createTool("write", { snippet: "Write files" }),
				createTool("internal", { guidelines: ["Internal only"] }),
				createTool("bare"),
			],
		});
		expect(result).toContain("- read: Read files");
		expect(result).toContain("- write: Write files");
		expect(result).not.toContain("- internal:");
		expect(result).not.toContain("- bare:");
		expect(result).toContain("- Be careful with paths");
		expect(result).toContain("- Internal only");
	});
});

// ─── buildToolSection ────────────────────────────────────────────────

describe("buildToolSection", () => {
	test("returns undefined for empty tools", () => {
		expect(buildToolSection([])).toBeUndefined();
	});

	test("returns undefined when no tools have snippets or guidelines", () => {
		expect(buildToolSection([createTool("bare")])).toBeUndefined();
	});

	test("snippets only", () => {
		const result = buildToolSection([
			createTool("a", { snippet: "Tool A" }),
			createTool("b", { snippet: "Tool B" }),
		]);
		expect(result).toBe("# Available Tools\n- a: Tool A\n- b: Tool B");
	});

	test("guidelines only", () => {
		const result = buildToolSection([createTool("a", { guidelines: ["Rule 1", "Rule 2"] })]);
		expect(result).toBe("# Guidelines\n- Rule 1\n- Rule 2");
	});

	test("snippets and guidelines combined", () => {
		const result = buildToolSection([
			createTool("a", { snippet: "Tool A", guidelines: ["Rule 1"] }),
			createTool("b", { guidelines: ["Rule 2"] }),
		]);
		expect(result).toContain("# Available Tools\n- a: Tool A");
		expect(result).toContain("# Guidelines\n- Rule 1\n- Rule 2");
	});

	test("empty guidelines arrays are ignored", () => {
		const result = buildToolSection([createTool("a", { snippet: "Tool A", guidelines: [] })]);
		expect(result).toBe("# Available Tools\n- a: Tool A");
		expect(result).not.toContain("# Guidelines");
	});
});
