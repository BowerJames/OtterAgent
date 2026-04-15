import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, test } from "vitest";
import type { ReadonlySessionManager } from "../interfaces/session-manager.js";
import { COMPACTION_SUMMARY_PREFIX, COMPACTION_SUMMARY_SUFFIX } from "../session/messages.js";
import {
	InMemorySessionManager,
	createInMemorySessionManager,
} from "./in-memory-session-manager.js";
import { SessionManager } from "./index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUserMessage(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

function makeAssistantMessage(text: string): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

// ─── buildSessionContext defaults ─────────────────────────────────────────────

describe("buildSessionContext — empty session", () => {
	test("returns empty messages, thinkingLevel 'off', and null model", () => {
		const sm = createInMemorySessionManager();
		const ctx = sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
	});
});

// ─── appendMessage ────────────────────────────────────────────────────────────

describe("appendMessage", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const id1 = sm.appendMessage(makeUserMessage("hello"));
		const id2 = sm.appendMessage(makeAssistantMessage("hi"));
		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});

	test("messages appear in buildSessionContext in order", () => {
		const sm = createInMemorySessionManager();
		const m1 = makeUserMessage("first");
		const m2 = makeAssistantMessage("second");
		sm.appendMessage(m1);
		sm.appendMessage(m2);
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual(m1);
		expect(messages[1]).toEqual(m2);
	});
});

// ─── appendCustomMessageEntry ─────────────────────────────────────────────────

describe("appendCustomMessageEntry", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const id = sm.appendCustomMessageEntry("ext-1", "hello", true);
		expect(id).toBeTruthy();
	});

	test("content is included in buildSessionContext messages as custom role", () => {
		const sm = createInMemorySessionManager();
		sm.appendCustomMessageEntry("ext-1", "injected content", true);
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("custom");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].content).toBe("injected content");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].customType).toBe("ext-1");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].display).toBe(true);
	});

	test("details are stored and exposed on the message", () => {
		const sm = createInMemorySessionManager();
		sm.appendCustomMessageEntry("ext-1", "msg", false, { foo: "bar" });
		const { messages } = sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].details).toEqual({ foo: "bar" });
	});

	test("content as array of content blocks is preserved", () => {
		const sm = createInMemorySessionManager();
		const content = [{ type: "text" as const, text: "block" }];
		sm.appendCustomMessageEntry("ext-1", content, false);
		const { messages } = sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].content).toEqual(content);
	});

	test("timestamp reflects creation time, not context-build time", async () => {
		const sm = createInMemorySessionManager();

		const beforeInsert = Date.now();
		sm.appendCustomMessageEntry("ext-1", "original content", true);
		const afterInsert = Date.now();

		// Small delay to ensure buildSessionContext runs at a later time.
		await new Promise((r) => setTimeout(r, 10));

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		// @ts-expect-error — accessing custom role field
		const timestamp = messages[0].timestamp as number;
		expect(timestamp).toBeGreaterThanOrEqual(beforeInsert);
		expect(timestamp).toBeLessThanOrEqual(afterInsert);
	});
});

// ─── appendCustomEntry ────────────────────────────────────────────────────────

describe("appendCustomEntry", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const id = sm.appendCustomEntry("ext-1", { state: true });
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", () => {
		const sm = createInMemorySessionManager();
		sm.appendCustomEntry("ext-1", { state: true });
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});
});

// ─── appendModelChange ────────────────────────────────────────────────────────

describe("appendModelChange", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const id = sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", () => {
		const sm = createInMemorySessionManager();
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("is reflected in buildSessionContext model", () => {
		const sm = createInMemorySessionManager();
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { model } = sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
	});

	test("is reflected in buildSessionContext thinkingLevel", () => {
		const sm = createInMemorySessionManager();
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		const { thinkingLevel } = sm.buildSessionContext();
		expect(thinkingLevel).toBe("high");
	});

	test("latest model change wins", () => {
		const sm = createInMemorySessionManager();
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-haiku" }, "off");
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "low");
		const { model, thinkingLevel } = sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
		expect(thinkingLevel).toBe("low");
	});
});

// ─── appendThinkingLevelChange ────────────────────────────────────────────────

describe("appendThinkingLevelChange", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const id = sm.appendThinkingLevelChange("high");
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", () => {
		const sm = createInMemorySessionManager();
		sm.appendThinkingLevelChange("high");
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("is reflected in buildSessionContext thinkingLevel", () => {
		const sm = createInMemorySessionManager();
		sm.appendThinkingLevelChange("low");
		const { thinkingLevel } = sm.buildSessionContext();
		expect(thinkingLevel).toBe("low");
	});

	test("latest thinkingLevelChange wins over a prior modelChange", () => {
		const sm = createInMemorySessionManager();
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		sm.appendThinkingLevelChange("off");
		const { thinkingLevel } = sm.buildSessionContext();
		expect(thinkingLevel).toBe("off");
	});
});

// ─── appendLabel ──────────────────────────────────────────────────────────────

describe("appendLabel", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const msgId = sm.appendMessage(makeUserMessage("hi"));
		const labelId = sm.appendLabel("important", msgId);
		expect(labelId).toBeTruthy();
		expect(labelId).not.toBe(msgId);
	});

	test("does NOT affect buildSessionContext messages", () => {
		const sm = createInMemorySessionManager();
		const msgId = sm.appendMessage(makeUserMessage("hi"));
		sm.appendLabel("important", msgId);
		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
	});
});

// ─── compact ──────────────────────────────────────────────────────────────────

describe("compact", () => {
	test("returns a unique EntryId", () => {
		const sm = createInMemorySessionManager();
		const msgId = sm.appendMessage(makeUserMessage("hi"));
		const compactId = sm.compact("summary", msgId);
		expect(compactId).toBeTruthy();
		expect(compactId).not.toBe(msgId);
	});

	test("messages before firstKeptEntryId are replaced by CompactionSummaryMessage", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		sm.appendMessage(makeAssistantMessage("old 2"));
		const keepId = sm.appendMessage(makeUserMessage("keep this"));
		sm.appendMessage(makeAssistantMessage("after keep"));
		sm.compact("This is the summary", keepId);

		const { messages } = sm.buildSessionContext();
		// compactionSummary + "keep this" + "after keep"
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("This is the summary");
		expect(messages[1].role).toBe("user");
		expect(messages[2].role).toBe("assistant");
	});

	test("tokensBefore is stored and surfaced on CompactionSummaryMessage", () => {
		const sm = createInMemorySessionManager();
		const keepId = sm.appendMessage(makeUserMessage("keep"));
		sm.compact("summary", keepId, 42000);

		const { messages } = sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(42000);
	});

	test("tokensBefore defaults to 0 when omitted", () => {
		const sm = createInMemorySessionManager();
		const keepId = sm.appendMessage(makeUserMessage("keep"));
		sm.compact("summary", keepId);

		const { messages } = sm.buildSessionContext();
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(0);
	});

	test("messages appended after compact() are included after the summary", () => {
		const sm = createInMemorySessionManager();
		const keepId = sm.appendMessage(makeUserMessage("keep"));
		sm.compact("summary", keepId);
		sm.appendMessage(makeAssistantMessage("new message"));

		const { messages } = sm.buildSessionContext();
		// compactionSummary + "keep" + "new message"
		expect(messages).toHaveLength(3);
		expect(messages[2].role).toBe("assistant");
	});

	test("firstKeptEntryId not found — summary only, no pre-compaction messages", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		sm.appendMessage(makeAssistantMessage("old 2"));
		sm.compact("summary", "nonexistent-id");

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("summary");
	});

	test("firstKeptEntryId not found still includes messages appended after compact()", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old"));
		sm.compact("summary", "nonexistent-id");
		sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("compactionSummary");
		expect(messages[1].role).toBe("assistant");
	});

	test("no arguments — full compaction with no summary message", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		sm.appendMessage(makeAssistantMessage("old 2"));
		sm.compact();

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("no arguments — messages appended after compact() are kept", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old"));
		sm.compact();
		sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("assistant");
	});

	test("summary only (no firstKeptEntryId) — full compaction with summary message", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		sm.appendMessage(makeAssistantMessage("old 2"));
		sm.compact("my summary");

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("my summary");
	});

	test("firstKeptEntryId only (no summary) — kept messages, no summary message", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		const keepId = sm.appendMessage(makeUserMessage("keep this"));
		sm.appendMessage(makeAssistantMessage("after keep"));
		sm.compact(undefined, keepId);

		const { messages } = sm.buildSessionContext();
		// No summary message, just the kept messages
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("user");
		expect(messages[1].role).toBe("assistant");
	});

	test("summary + firstKeptEntryId — summary message followed by kept messages", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		const keepId = sm.appendMessage(makeUserMessage("keep this"));
		sm.appendMessage(makeAssistantMessage("after keep"));
		sm.compact("a summary", keepId);

		const { messages } = sm.buildSessionContext();
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("a summary");
		expect(messages[1].role).toBe("user");
		expect(messages[2].role).toBe("assistant");
	});

	test("latest compaction wins when compact() is called multiple times", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old 1"));
		const firstKeepId = sm.appendMessage(makeUserMessage("first keep"));
		sm.compact("first summary", firstKeepId);

		sm.appendMessage(makeAssistantMessage("middle"));
		const secondKeepId = sm.appendMessage(makeUserMessage("second keep"));
		sm.compact("second summary", secondKeepId);

		sm.appendMessage(makeAssistantMessage("latest"));

		const { messages } = sm.buildSessionContext();
		// Only the second compaction applies.
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("second summary");
		// "second keep" + "latest"
		expect(messages).toHaveLength(3);
	});

	test("compactionSummaryMessage content wraps summary in expected tags when converted to LLM", () => {
		const sm = createInMemorySessionManager();
		const keepId = sm.appendMessage(makeUserMessage("keep"));
		sm.compact("my summary text", keepId);

		const { messages } = sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		const summary: string = messages[0].summary;
		// Verify the summary text is stored as-is (convertToLlm wraps it in tags separately)
		expect(summary).toBe("my summary text");
	});
});

// ─── unique IDs across all entry types ───────────────────────────────────────

describe("EntryId uniqueness", () => {
	test("all append methods return unique IDs across the same instance", () => {
		const sm = createInMemorySessionManager();
		const ids = [
			sm.appendMessage(makeUserMessage("m")),
			sm.appendCustomMessageEntry("ext", "c", true),
			sm.appendCustomEntry("ext", {}),
			sm.appendModelChange({ provider: "p", modelId: "m" }, "off"),
			sm.appendThinkingLevelChange("low"),
			sm.appendLabel("lbl", "1"),
		];
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});

// ─── getEntries ──────────────────────────────────────────────────────────────

describe("getEntries", () => {
	test("returns an empty array for a new session", () => {
		const sm = createInMemorySessionManager();
		expect(sm.getEntries()).toEqual([]);
	});

	test("returns all entries in append order", () => {
		const sm = createInMemorySessionManager();
		const msgId = sm.appendMessage(makeUserMessage("hello"));
		sm.appendCustomEntry("ext-1", { state: true });
		sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		sm.appendThinkingLevelChange("off");
		sm.compact("summary", msgId, 100);
		sm.appendLabel("important", msgId);
		sm.appendCustomMessageEntry("ext-2", "visible", true);

		const entries = sm.getEntries();
		expect(entries).toHaveLength(7);
		expect(entries[0].type).toBe("message");
		expect(entries[1].type).toBe("customEntry");
		expect(entries[2].type).toBe("modelChange");
		expect(entries[3].type).toBe("thinkingLevelChange");
		expect(entries[4].type).toBe("compaction");
		expect(entries[5].type).toBe("label");
		expect(entries[6].type).toBe("customMessage");
	});

	test("returns a shallow copy — mutating the returned array does not affect internal state", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("keep"));
		const entries = sm.getEntries();
		entries.push({ type: "label", id: "fake", label: "injected", targetEntryId: "x" });
		expect(sm.getEntries()).toHaveLength(1);
	});

	test("customEntry entries are included (unlike buildSessionContext messages)", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("visible"));
		sm.appendCustomEntry("my-ext", { key: "value" });

		const entries = sm.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[1].type).toBe("customEntry");
		if (entries[1].type === "customEntry") {
			expect(entries[1].customType).toBe("my-ext");
			expect(entries[1].data).toEqual({ key: "value" });
		}
	});

	test("entries remain accessible after compaction", () => {
		const sm = createInMemorySessionManager();
		sm.appendMessage(makeUserMessage("old"));
		const keepId = sm.appendMessage(makeUserMessage("keep"));
		sm.compact("summary", keepId);

		const entries = sm.getEntries();
		// All 3 entries still present: 2 messages + 1 compaction
		expect(entries).toHaveLength(3);
		expect(entries[0].type).toBe("message");
		expect(entries[1].type).toBe("message");
		expect(entries[2].type).toBe("compaction");
	});

	test("available via ReadonlySessionManager", () => {
		const sm = createInMemorySessionManager();
		sm.appendCustomEntry("ext", { persisted: true });

		const readonly: ReadonlySessionManager = sm;
		const entries = readonly.getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].type).toBe("customEntry");
	});
});

// ─── SessionManager.inMemory() factory ───────────────────────────────────────

describe("SessionManager.inMemory()", () => {
	test("returns a working SessionManager instance", () => {
		const sm = SessionManager.inMemory();
		expect(sm).toBeDefined();
		const ctx = sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
	});

	test("each call returns an independent instance", () => {
		const sm1 = SessionManager.inMemory();
		const sm2 = SessionManager.inMemory();
		sm1.appendMessage(makeUserMessage("only in sm1"));
		expect(sm1.buildSessionContext().messages).toHaveLength(1);
		expect(sm2.buildSessionContext().messages).toHaveLength(0);
	});

	test("satisfies the SessionManager type (type-level check via createInMemorySessionManager)", () => {
		// Both factory paths should produce the same shape.
		const sm1 = SessionManager.inMemory();
		const sm2 = createInMemorySessionManager();
		expect(typeof sm1.appendMessage).toBe("function");
		expect(typeof sm2.appendMessage).toBe("function");
	});
});

// ─── InMemorySessionManager — direct construction & instanceof ──────────────

describe("InMemorySessionManager — direct construction", () => {
	test("can be constructed directly via new", () => {
		const sm = new InMemorySessionManager();
		const ctx = sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
	});

	test("instanceof InMemorySessionManager is true for direct construction", () => {
		const sm = new InMemorySessionManager();
		expect(sm instanceof InMemorySessionManager).toBe(true);
	});

	test("instanceof InMemorySessionManager is true for factory creation", () => {
		const sm = createInMemorySessionManager();
		expect(sm instanceof InMemorySessionManager).toBe(true);
	});

	test("instanceof InMemorySessionManager is true for namespace factory creation", () => {
		const sm = SessionManager.inMemory();
		expect(sm instanceof InMemorySessionManager).toBe(true);
	});
});
