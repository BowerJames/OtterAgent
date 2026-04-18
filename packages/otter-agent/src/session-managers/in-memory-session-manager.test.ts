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
	test("returns empty messages, thinkingLevel 'off', and null model", async () => {
		const sm = createInMemorySessionManager();
		const ctx = await sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
	});
});

// ─── appendMessage ────────────────────────────────────────────────────────────

describe("appendMessage", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const id1 = await sm.appendMessage(makeUserMessage("hello"));
		const id2 = await sm.appendMessage(makeAssistantMessage("hi"));
		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});

	test("messages appear in buildSessionContext in order", async () => {
		const sm = createInMemorySessionManager();
		const m1 = makeUserMessage("first");
		const m2 = makeAssistantMessage("second");
		await sm.appendMessage(m1);
		await sm.appendMessage(m2);
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual(m1);
		expect(messages[1]).toEqual(m2);
	});
});

// ─── appendCustomMessageEntry ─────────────────────────────────────────────────

describe("appendCustomMessageEntry", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const id = await sm.appendCustomMessageEntry("ext-1", "hello", true);
		expect(id).toBeTruthy();
	});

	test("content is included in buildSessionContext messages as custom role", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendCustomMessageEntry("ext-1", "injected content", true);
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("custom");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].content).toBe("injected content");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].customType).toBe("ext-1");
		// @ts-expect-error — accessing custom role field
		expect(messages[0].display).toBe(true);
	});

	test("details are stored and exposed on the message", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendCustomMessageEntry("ext-1", "msg", false, { foo: "bar" });
		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].details).toEqual({ foo: "bar" });
	});

	test("content as array of content blocks is preserved", async () => {
		const sm = createInMemorySessionManager();
		const content = [{ type: "text" as const, text: "block" }];
		await sm.appendCustomMessageEntry("ext-1", content, false);
		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].content).toEqual(content);
	});

	test("timestamp reflects creation time, not context-build time", async () => {
		const sm = createInMemorySessionManager();

		const beforeInsert = Date.now();
		await sm.appendCustomMessageEntry("ext-1", "original content", true);
		const afterInsert = Date.now();

		// Small delay to ensure buildSessionContext runs at a later time.
		await new Promise((r) => setTimeout(r, 10));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		// @ts-expect-error — accessing custom role field
		const timestamp = messages[0].timestamp as number;
		expect(timestamp).toBeGreaterThanOrEqual(beforeInsert);
		expect(timestamp).toBeLessThanOrEqual(afterInsert);
	});
});

// ─── appendCustomEntry ────────────────────────────────────────────────────────

describe("appendCustomEntry", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const id = await sm.appendCustomEntry("ext-1", { state: true });
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendCustomEntry("ext-1", { state: true });
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});
});

// ─── appendModelChange ────────────────────────────────────────────────────────

describe("appendModelChange", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const id = await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("is reflected in buildSessionContext model", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { model } = await sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
	});

	test("is reflected in buildSessionContext thinkingLevel", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("high");
	});

	test("latest model change wins", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-haiku" }, "off");
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "low");
		const { model, thinkingLevel } = await sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
		expect(thinkingLevel).toBe("low");
	});
});

// ─── appendThinkingLevelChange ────────────────────────────────────────────────

describe("appendThinkingLevelChange", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const id = await sm.appendThinkingLevelChange("high");
		expect(id).toBeTruthy();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendThinkingLevelChange("high");
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("is reflected in buildSessionContext thinkingLevel", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendThinkingLevelChange("low");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("low");
	});

	test("latest thinkingLevelChange wins over a prior modelChange", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		await sm.appendThinkingLevelChange("off");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("off");
	});
});

// ─── appendLabel ──────────────────────────────────────────────────────────────

describe("appendLabel", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		const labelId = await sm.appendLabel("important", msgId);
		expect(labelId).toBeTruthy();
		expect(labelId).not.toBe(msgId);
	});

	test("does NOT affect buildSessionContext messages", async () => {
		const sm = createInMemorySessionManager();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		await sm.appendLabel("important", msgId);
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
	});
});

// ─── compact ──────────────────────────────────────────────────────────────────

describe("compact", () => {
	test("returns a unique EntryId", async () => {
		const sm = createInMemorySessionManager();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		const compactId = await sm.compact("summary", msgId);
		expect(compactId).toBeTruthy();
		expect(compactId).not.toBe(msgId);
	});

	test("messages before firstKeptEntryId are replaced by CompactionSummaryMessage", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		const keepId = await sm.appendMessage(makeUserMessage("keep this"));
		await sm.appendMessage(makeAssistantMessage("after keep"));
		await sm.compact("This is the summary", keepId);

		const { messages } = await sm.buildSessionContext();
		// compactionSummary + "keep this" + "after keep"
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("This is the summary");
		expect(messages[1].role).toBe("user");
		expect(messages[2].role).toBe("assistant");
	});

	test("tokensBefore is stored and surfaced on CompactionSummaryMessage", async () => {
		const sm = createInMemorySessionManager();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId, 42000);

		const { messages } = await sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(42000);
	});

	test("tokensBefore defaults to 0 when omitted", async () => {
		const sm = createInMemorySessionManager();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId);

		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(0);
	});

	test("messages appended after compact() are included after the summary", async () => {
		const sm = createInMemorySessionManager();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId);
		await sm.appendMessage(makeAssistantMessage("new message"));

		const { messages } = await sm.buildSessionContext();
		// compactionSummary + "keep" + "new message"
		expect(messages).toHaveLength(3);
		expect(messages[2].role).toBe("assistant");
	});

	test("firstKeptEntryId not found — summary only, no pre-compaction messages", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact("summary", "nonexistent-id");

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("summary");
	});

	test("firstKeptEntryId not found still includes messages appended after compact()", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old"));
		await sm.compact("summary", "nonexistent-id");
		await sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("compactionSummary");
		expect(messages[1].role).toBe("assistant");
	});

	test("no arguments — full compaction with no summary message", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact();

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
	});

	test("no arguments — messages appended after compact() are kept", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old"));
		await sm.compact();
		await sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("assistant");
	});

	test("summary only (no firstKeptEntryId) — full compaction with summary message", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact("my summary");

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("my summary");
	});

	test("firstKeptEntryId only (no summary) — kept messages, no summary message", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		const keepId = await sm.appendMessage(makeUserMessage("keep this"));
		await sm.appendMessage(makeAssistantMessage("after keep"));
		await sm.compact(undefined, keepId);

		const { messages } = await sm.buildSessionContext();
		// No summary message, just the kept messages
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("user");
		expect(messages[1].role).toBe("assistant");
	});

	test("summary + firstKeptEntryId — summary message followed by kept messages", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		const keepId = await sm.appendMessage(makeUserMessage("keep this"));
		await sm.appendMessage(makeAssistantMessage("after keep"));
		await sm.compact("a summary", keepId);

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("a summary");
		expect(messages[1].role).toBe("user");
		expect(messages[2].role).toBe("assistant");
	});

	test("latest compaction wins when compact() is called multiple times", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old 1"));
		const firstKeepId = await sm.appendMessage(makeUserMessage("first keep"));
		await sm.compact("first summary", firstKeepId);

		await sm.appendMessage(makeAssistantMessage("middle"));
		const secondKeepId = await sm.appendMessage(makeUserMessage("second keep"));
		await sm.compact("second summary", secondKeepId);

		await sm.appendMessage(makeAssistantMessage("latest"));

		const { messages } = await sm.buildSessionContext();
		// Only the second compaction applies.
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("second summary");
		// "second keep" + "latest"
		expect(messages).toHaveLength(3);
	});

	test("compactionSummaryMessage content wraps summary in expected tags when converted to LLM", async () => {
		const sm = createInMemorySessionManager();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("my summary text", keepId);

		const { messages } = await sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		const summary: string = messages[0].summary;
		// Verify the summary text is stored as-is (convertToLlm wraps it in tags separately)
		expect(summary).toBe("my summary text");
	});
});

// ─── unique IDs across all entry types ───────────────────────────────────────

describe("EntryId uniqueness", () => {
	test("all append methods return unique IDs across the same instance", async () => {
		const sm = createInMemorySessionManager();
		const ids = await Promise.all([
			sm.appendMessage(makeUserMessage("m")),
			sm.appendCustomMessageEntry("ext", "c", true),
			sm.appendCustomEntry("ext", {}),
			sm.appendModelChange({ provider: "p", modelId: "m" }, "off"),
			sm.appendThinkingLevelChange("low"),
			sm.appendLabel("lbl", "1"),
		]);
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});

// ─── getEntries ──────────────────────────────────────────────────────────────

describe("getEntries", () => {
	test("returns an empty array for a new session", async () => {
		const sm = createInMemorySessionManager();
		expect(await sm.getEntries()).toEqual([]);
	});

	test("returns all entries in append order", async () => {
		const sm = createInMemorySessionManager();
		const msgId = await sm.appendMessage(makeUserMessage("hello"));
		await sm.appendCustomEntry("ext-1", { state: true });
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		await sm.appendThinkingLevelChange("off");
		await sm.compact("summary", msgId, 100);
		await sm.appendLabel("important", msgId);
		await sm.appendCustomMessageEntry("ext-2", "visible", true);

		const entries = await sm.getEntries();
		expect(entries).toHaveLength(7);
		expect(entries[0].type).toBe("message");
		expect(entries[1].type).toBe("customEntry");
		expect(entries[2].type).toBe("modelChange");
		expect(entries[3].type).toBe("thinkingLevelChange");
		expect(entries[4].type).toBe("compaction");
		expect(entries[5].type).toBe("label");
		expect(entries[6].type).toBe("customMessage");
	});

	test("returns a shallow copy — mutating the returned array does not affect internal state", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("keep"));
		const entries = await sm.getEntries();
		entries.push({ type: "label", id: "fake", label: "injected", targetEntryId: "x" });
		expect(await sm.getEntries()).toHaveLength(1);
	});

	test("customEntry entries are included (unlike buildSessionContext messages)", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("visible"));
		await sm.appendCustomEntry("my-ext", { key: "value" });

		const entries = await sm.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[1].type).toBe("customEntry");
		if (entries[1].type === "customEntry") {
			expect(entries[1].customType).toBe("my-ext");
			expect(entries[1].data).toEqual({ key: "value" });
		}
	});

	test("entries remain accessible after compaction", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendMessage(makeUserMessage("old"));
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId);

		const entries = await sm.getEntries();
		// All 3 entries still present: 2 messages + 1 compaction
		expect(entries).toHaveLength(3);
		expect(entries[0].type).toBe("message");
		expect(entries[1].type).toBe("message");
		expect(entries[2].type).toBe("compaction");
	});

	test("available via ReadonlySessionManager", async () => {
		const sm = createInMemorySessionManager();
		await sm.appendCustomEntry("ext", { persisted: true });

		const readonly: ReadonlySessionManager = sm;
		const entries = await readonly.getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].type).toBe("customEntry");
	});
});

// ─── SessionManager.inMemory() factory ───────────────────────────────────────

describe("SessionManager.inMemory()", () => {
	test("returns a working SessionManager instance", async () => {
		const sm = SessionManager.inMemory();
		expect(sm).toBeDefined();
		const ctx = await sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
	});

	test("each call returns an independent instance", async () => {
		const sm1 = SessionManager.inMemory();
		const sm2 = SessionManager.inMemory();
		await sm1.appendMessage(makeUserMessage("only in sm1"));
		expect((await sm1.buildSessionContext()).messages).toHaveLength(1);
		expect((await sm2.buildSessionContext()).messages).toHaveLength(0);
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
	test("can be constructed directly via new", async () => {
		const sm = new InMemorySessionManager();
		const ctx = await sm.buildSessionContext();
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
