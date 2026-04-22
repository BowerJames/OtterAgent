import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import { describe, expect, test } from "vitest";
import {
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	convertToLlm,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "./messages.js";

describe("createCustomMessage", () => {
	test("creates a custom message with string content", () => {
		const msg = createCustomMessage("test-ext", "hello", true, undefined, 1000);
		expect(msg.role).toBe("custom");
		expect(msg.customType).toBe("test-ext");
		expect(msg.content).toBe("hello");
		expect(msg.display).toBe(true);
		expect(msg.details).toBeUndefined();
		expect(msg.timestamp).toBe(1000);
	});

	test("creates a custom message with rich content", () => {
		const content: TextContent[] = [{ type: "text", text: "hello" }];
		const msg = createCustomMessage("test-ext", content, false, { key: "val" }, 2000);
		expect(msg.content).toEqual(content);
		expect(msg.display).toBe(false);
		expect(msg.details).toEqual({ key: "val" });
	});
});

describe("createCompactionSummaryMessage", () => {
	test("creates a compaction summary message", () => {
		const msg = createCompactionSummaryMessage("summary text", 5000);
		expect(msg.role).toBe("compactionSummary");
		expect(msg.summary).toBe("summary text");
		expect(msg.tokensBefore).toBe(5000);
		expect(msg.timestamp).toBeGreaterThan(0);
	});
});

describe("convertToLlm", () => {
	test("passes through standard messages", () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 },
			{
				role: "assistant",
				content: [{ type: "text", text: "hi" }],
				timestamp: 2,
				model: "test",
				stopReason: "end",
			},
		];
		const result = convertToLlm(messages);
		expect(result).toHaveLength(2);
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
	});

	test("converts custom messages to user messages", () => {
		const messages: AgentMessage[] = [
			createCustomMessage("ext", "custom content", true, undefined, 1),
		];
		const result = convertToLlm(messages);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("user");
		expect(result[0].content).toEqual([{ type: "text", text: "custom content" }]);
	});

	test("converts custom messages with rich content", () => {
		const content: TextContent[] = [{ type: "text", text: "rich" }];
		const messages: AgentMessage[] = [createCustomMessage("ext", content, true, undefined, 1)];
		const result = convertToLlm(messages);
		expect(result).toHaveLength(1);
		expect(result[0].content).toEqual(content);
	});

	test("converts compaction summaries to user messages with tags", () => {
		const messages: AgentMessage[] = [createCompactionSummaryMessage("the summary", 3000)];
		const result = convertToLlm(messages);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("user");
		const text = (result[0].content[0] as TextContent).text;
		expect(text).toBe(`${COMPACTION_SUMMARY_PREFIX}the summary${COMPACTION_SUMMARY_SUFFIX}`);
	});

	test("filters out unknown message roles", () => {
		const messages = [{ role: "unknown", data: "test" } as unknown as AgentMessage];
		const result = convertToLlm(messages);
		expect(result).toHaveLength(0);
	});
});
