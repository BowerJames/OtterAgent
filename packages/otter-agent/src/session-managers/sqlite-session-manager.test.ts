import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ReadonlySessionManager } from "../interfaces/session-manager.js";
import { SessionManager } from "./index.js";
import { SqliteSessionManager, createSqliteSessionManager } from "./sqlite-session-manager.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempDir: string;

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

function dbPath(): string {
	return join(tempDir, "test.db");
}

function createSm(sessionId = "test-session", tableName?: string): SqliteSessionManager {
	return new SqliteSessionManager({ dbPath: dbPath(), sessionId, tableName });
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "otter-sqlite-test-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

// ─── buildSessionContext defaults ─────────────────────────────────────────────

describe("buildSessionContext — empty session", () => {
	test("returns empty messages, thinkingLevel 'off', and null model", async () => {
		const sm = createSm();
		const ctx = await sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
		sm.close();
	});
});

// ─── appendMessage ────────────────────────────────────────────────────────────

describe("appendMessage", () => {
	test("returns a unique EntryId in UUID format", async () => {
		const sm = createSm();
		const id1 = await sm.appendMessage(makeUserMessage("hello"));
		const id2 = await sm.appendMessage(makeAssistantMessage("hi"));
		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
		// UUID format: 8-4-4-4-12 hex chars
		expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		sm.close();
	});

	test("messages appear in buildSessionContext in order", async () => {
		const sm = createSm();
		const m1 = makeUserMessage("first");
		const m2 = makeAssistantMessage("second");
		await sm.appendMessage(m1);
		await sm.appendMessage(m2);
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual(m1);
		expect(messages[1]).toEqual(m2);
		sm.close();
	});
});

// ─── appendCustomMessageEntry ─────────────────────────────────────────────────

describe("appendCustomMessageEntry", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const id = await sm.appendCustomMessageEntry("ext-1", "hello", true);
		expect(id).toBeTruthy();
		sm.close();
	});

	test("content is included in buildSessionContext messages as custom role", async () => {
		const sm = createSm();
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
		sm.close();
	});

	test("details are stored and exposed on the message", async () => {
		const sm = createSm();
		await sm.appendCustomMessageEntry("ext-1", "msg", false, { foo: "bar" });
		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].details).toEqual({ foo: "bar" });
		sm.close();
	});

	test("content as array of content blocks is preserved", async () => {
		const sm = createSm();
		const content = [{ type: "text" as const, text: "block" }];
		await sm.appendCustomMessageEntry("ext-1", content, false);
		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing custom role field
		expect(messages[0].content).toEqual(content);
		sm.close();
	});
});

// ─── appendCustomEntry ────────────────────────────────────────────────────────

describe("appendCustomEntry", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const id = await sm.appendCustomEntry("ext-1", { state: true });
		expect(id).toBeTruthy();
		sm.close();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createSm();
		await sm.appendCustomEntry("ext-1", { state: true });
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
		sm.close();
	});
});

// ─── appendModelChange ────────────────────────────────────────────────────────

describe("appendModelChange", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const id = await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		expect(id).toBeTruthy();
		sm.close();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createSm();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
		sm.close();
	});

	test("is reflected in buildSessionContext model", async () => {
		const sm = createSm();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "off");
		const { model } = await sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
		sm.close();
	});

	test("is reflected in buildSessionContext thinkingLevel", async () => {
		const sm = createSm();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("high");
		sm.close();
	});

	test("latest model change wins", async () => {
		const sm = createSm();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-haiku" }, "off");
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "low");
		const { model, thinkingLevel } = await sm.buildSessionContext();
		expect(model).toEqual({ provider: "anthropic", modelId: "claude-opus" });
		expect(thinkingLevel).toBe("low");
		sm.close();
	});
});

// ─── appendThinkingLevelChange ────────────────────────────────────────────────

describe("appendThinkingLevelChange", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const id = await sm.appendThinkingLevelChange("high");
		expect(id).toBeTruthy();
		sm.close();
	});

	test("does NOT appear in buildSessionContext messages", async () => {
		const sm = createSm();
		await sm.appendThinkingLevelChange("high");
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
		sm.close();
	});

	test("is reflected in buildSessionContext thinkingLevel", async () => {
		const sm = createSm();
		await sm.appendThinkingLevelChange("low");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("low");
		sm.close();
	});

	test("latest thinkingLevelChange wins over a prior modelChange", async () => {
		const sm = createSm();
		await sm.appendModelChange({ provider: "anthropic", modelId: "claude-opus" }, "high");
		await sm.appendThinkingLevelChange("off");
		const { thinkingLevel } = await sm.buildSessionContext();
		expect(thinkingLevel).toBe("off");
		sm.close();
	});
});

// ─── appendLabel ──────────────────────────────────────────────────────────────

describe("appendLabel", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		const labelId = await sm.appendLabel("important", msgId);
		expect(labelId).toBeTruthy();
		expect(labelId).not.toBe(msgId);
		sm.close();
	});

	test("does NOT affect buildSessionContext messages", async () => {
		const sm = createSm();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		await sm.appendLabel("important", msgId);
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		sm.close();
	});
});

// ─── compact ──────────────────────────────────────────────────────────────────

describe("compact", () => {
	test("returns a unique EntryId", async () => {
		const sm = createSm();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		const compactId = await sm.compact("summary", msgId);
		expect(compactId).toBeTruthy();
		expect(compactId).not.toBe(msgId);
		sm.close();
	});

	test("messages before firstKeptEntryId are replaced by CompactionSummaryMessage", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		const keepId = await sm.appendMessage(makeUserMessage("keep this"));
		await sm.appendMessage(makeAssistantMessage("after keep"));
		await sm.compact("This is the summary", keepId);

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("This is the summary");
		expect(messages[1].role).toBe("user");
		expect(messages[2].role).toBe("assistant");
		sm.close();
	});

	test("tokensBefore is stored and surfaced on CompactionSummaryMessage", async () => {
		const sm = createSm();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId, 42000);

		const { messages } = await sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(42000);
		sm.close();
	});

	test("tokensBefore defaults to 0 when omitted", async () => {
		const sm = createSm();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId);

		const { messages } = await sm.buildSessionContext();
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(0);
		sm.close();
	});

	test("messages appended after compact() are included after the summary", async () => {
		const sm = createSm();
		const keepId = await sm.appendMessage(makeUserMessage("keep"));
		await sm.compact("summary", keepId);
		await sm.appendMessage(makeAssistantMessage("new message"));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(3);
		expect(messages[2].role).toBe("assistant");
		sm.close();
	});

	test("firstKeptEntryId not found — summary only, no pre-compaction messages", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact("summary", "nonexistent-id");

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("summary");
		sm.close();
	});

	test("firstKeptEntryId not found still includes messages appended after compact()", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old"));
		await sm.compact("summary", "nonexistent-id");
		await sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("compactionSummary");
		expect(messages[1].role).toBe("assistant");
		sm.close();
	});

	test("no arguments — full compaction with no summary message", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact();

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(0);
		sm.close();
	});

	test("no arguments — messages appended after compact() are kept", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old"));
		await sm.compact();
		await sm.appendMessage(makeAssistantMessage("new after compact"));

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("assistant");
		sm.close();
	});

	test("summary only (no firstKeptEntryId) — full compaction with summary message", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		await sm.appendMessage(makeAssistantMessage("old 2"));
		await sm.compact("my summary");

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("my summary");
		sm.close();
	});

	test("firstKeptEntryId only (no summary) — kept messages, no summary message", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		const keepId = await sm.appendMessage(makeUserMessage("keep this"));
		await sm.appendMessage(makeAssistantMessage("after keep"));
		await sm.compact(undefined, keepId);

		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("user");
		expect(messages[1].role).toBe("assistant");
		sm.close();
	});

	test("summary + firstKeptEntryId — summary message followed by kept messages", async () => {
		const sm = createSm();
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
		sm.close();
	});

	test("latest compaction wins when compact() is called multiple times", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("old 1"));
		const firstKeepId = await sm.appendMessage(makeUserMessage("first keep"));
		await sm.compact("first summary", firstKeepId);

		await sm.appendMessage(makeAssistantMessage("middle"));
		const secondKeepId = await sm.appendMessage(makeUserMessage("second keep"));
		await sm.compact("second summary", secondKeepId);

		await sm.appendMessage(makeAssistantMessage("latest"));

		const { messages } = await sm.buildSessionContext();
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("second summary");
		expect(messages).toHaveLength(3);
		sm.close();
	});
});

// ─── unique IDs across all entry types ───────────────────────────────────────

describe("EntryId uniqueness", () => {
	test("all append methods return unique IDs across the same instance", async () => {
		const sm = createSm();
		const ids = [
			await sm.appendMessage(makeUserMessage("m")),
			await sm.appendCustomMessageEntry("ext", "c", true),
			await sm.appendCustomEntry("ext", {}),
			await sm.appendModelChange({ provider: "p", modelId: "m" }, "off"),
			await sm.appendThinkingLevelChange("low"),
			await sm.appendLabel("lbl", "1"),
		];
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
		sm.close();
	});
});

// ─── SessionManager.sqlite() namespace factory ───────────────────────────────

describe("SessionManager.sqlite()", () => {
	test("returns a working SessionManager instance", async () => {
		const sm = SessionManager.sqlite({ dbPath: dbPath(), sessionId: "ns-test" });
		expect(sm).toBeDefined();
		const ctx = await sm.buildSessionContext();
		expect(ctx.messages).toEqual([]);
		expect(ctx.thinkingLevel).toBe("off");
		expect(ctx.model).toBeNull();
		sm.close();
	});

	test("each call returns an independent instance", async () => {
		const sm1 = SessionManager.sqlite({ dbPath: dbPath(), sessionId: "s1" });
		const sm2 = SessionManager.sqlite({ dbPath: dbPath(), sessionId: "s2" });
		await sm1.appendMessage(makeUserMessage("only in sm1"));
		expect((await sm1.buildSessionContext()).messages).toHaveLength(1);
		expect((await sm2.buildSessionContext()).messages).toHaveLength(0);
		sm1.close();
		sm2.close();
	});

	test("satisfies the SessionManager type (type-level check via createSqliteSessionManager)", async () => {
		const sm1 = SessionManager.sqlite({ dbPath: dbPath(), sessionId: "s1" });
		const sm2 = createSqliteSessionManager({ dbPath: dbPath(), sessionId: "s2" });
		expect(typeof sm1.appendMessage).toBe("function");
		expect(typeof sm2.appendMessage).toBe("function");
		sm1.close();
		sm2.close();
	});
});

// ─── getEntries ──────────────────────────────────────────────────────────────

describe("getEntries", () => {
	test("returns an empty array for a new session", async () => {
		const sm = createSm();
		expect(await sm.getEntries()).toEqual([]);
		sm.close();
	});

	test("returns all entries in append order", async () => {
		const sm = createSm();
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
		sm.close();
	});

	test("entries persist across close/reopen", async () => {
		const path = dbPath();
		const sessionId = "getEntries-persist";

		const sm1 = new SqliteSessionManager({ dbPath: path, sessionId });
		await sm1.appendMessage(makeUserMessage("survives"));
		await sm1.appendCustomEntry("ext", { data: 42 });
		sm1.close();

		const sm2 = new SqliteSessionManager({ dbPath: path, sessionId });
		const entries = await sm2.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe("message");
		expect(entries[1].type).toBe("customEntry");
		if (entries[1].type === "customEntry") {
			expect(entries[1].data).toEqual({ data: 42 });
		}
		sm2.close();
	});

	test("customEntry entries are included", async () => {
		const sm = createSm();
		await sm.appendMessage(makeUserMessage("visible"));
		await sm.appendCustomEntry("my-ext", { key: "value" });

		const entries = await sm.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[1].type).toBe("customEntry");
		if (entries[1].type === "customEntry") {
			expect(entries[1].customType).toBe("my-ext");
			expect(entries[1].data).toEqual({ key: "value" });
		}
		sm.close();
	});

	test("throws after close", async () => {
		const sm = createSm();
		sm.close();
		await expect(sm.getEntries()).rejects.toThrow("closed");
	});

	test("session isolation — entries from one session do not leak", async () => {
		const path = dbPath();
		const smA = new SqliteSessionManager({ dbPath: path, sessionId: "iso-A" });
		const smB = new SqliteSessionManager({ dbPath: path, sessionId: "iso-B" });

		await smA.appendMessage(makeUserMessage("only in A"));
		await smB.appendMessage(makeUserMessage("only in B"));

		expect(await smA.getEntries()).toHaveLength(1);
		expect((await smA.getEntries())[0].type).toBe("message");
		expect(await smB.getEntries()).toHaveLength(1);
		expect((await smB.getEntries())[0].type).toBe("message");

		smA.close();
		smB.close();
	});

	test("available via ReadonlySessionManager", async () => {
		const sm = createSm();
		await sm.appendCustomEntry("ext", { persisted: true });

		const readonly: ReadonlySessionManager = sm;
		const entries = await readonly.getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].type).toBe("customEntry");
		sm.close();
	});
});

// ─── constructor validation ────────────────────────────────────────────────────

describe("constructor validation", () => {
	test("throws for empty sessionId", async () => {
		expect(() => createSm("")).toThrow("sessionId must not be empty");
	});

	test("throws for sessionId exceeding 255 characters", async () => {
		const longId = "x".repeat(256);
		expect(() => createSm(longId)).toThrow("sessionId must not exceed 255 characters");
	});

	test("accepts sessionId at exactly 255 characters", async () => {
		const exactId = "x".repeat(255);
		const sm = createSm(exactId);
		await sm.appendMessage(makeUserMessage("ok"));
		expect((await sm.buildSessionContext()).messages).toHaveLength(1);
		sm.close();
	});
});

// ─── close() ──────────────────────────────────────────────────────────────────

describe("close()", () => {
	test("close() can be called without error", async () => {
		const sm = createSm();
		expect(() => sm.close()).not.toThrow();
	});

	test("calling close() twice logs a warning and does not throw", async () => {
		const sm = createSm();
		const originalWarn = console.warn;
		const warnings: unknown[] = [];
		console.warn = (...args: unknown[]) => warnings.push(args);

		try {
			sm.close();
			sm.close();

			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toEqual(
				expect.arrayContaining([expect.stringContaining("already-closed")]),
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("appendMessage throws after close", async () => {
		const sm = createSm();
		sm.close();
		await expect(sm.appendMessage(makeUserMessage("test"))).rejects.toThrow("closed");
	});

	test("buildSessionContext throws after close", async () => {
		const sm = createSm();
		sm.close();
		await expect(sm.buildSessionContext()).rejects.toThrow("closed");
	});

	test("appendCustomMessageEntry throws after close", async () => {
		const sm = createSm();
		sm.close();
		await expect(sm.appendCustomMessageEntry("ext", "msg", true)).rejects.toThrow("closed");
	});

	test("compact throws after close", async () => {
		const sm = createSm();
		const msgId = await sm.appendMessage(makeUserMessage("hi"));
		sm.close();
		await expect(sm.compact("summary", msgId)).rejects.toThrow("closed");
	});
});

// ─── SQLite-specific tests ───────────────────────────────────────────────────

describe("SQLite-specific behavior", () => {
	test("entries persist across close/reopen with the same session_id", async () => {
		const path = dbPath();
		const sessionId = "persist-test";

		const sm1 = new SqliteSessionManager({ dbPath: path, sessionId });
		await sm1.appendMessage(makeUserMessage("survives restart"));
		await sm1.appendMessage(makeAssistantMessage("also survives"));
		sm1.close();

		const sm2 = new SqliteSessionManager({ dbPath: path, sessionId });
		const { messages } = await sm2.buildSessionContext();
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("user");
		// @ts-expect-error — accessing user message text
		expect(messages[0].content[0].text).toBe("survives restart");
		expect(messages[1].role).toBe("assistant");
		sm2.close();
	});

	test("model and thinkingLevel persist across close/reopen", async () => {
		const path = dbPath();
		const sessionId = "persist-meta";

		const sm1 = new SqliteSessionManager({ dbPath: path, sessionId });
		await sm1.appendMessage(makeUserMessage("hello"));
		await sm1.appendModelChange({ provider: "openai", modelId: "gpt-4" }, "high");
		sm1.close();

		const sm2 = new SqliteSessionManager({ dbPath: path, sessionId });
		const { model, thinkingLevel } = await sm2.buildSessionContext();
		expect(model).toEqual({ provider: "openai", modelId: "gpt-4" });
		expect(thinkingLevel).toBe("high");
		sm2.close();
	});

	test("multiple sessions are isolated in the same database", async () => {
		const path = dbPath();

		const smA = new SqliteSessionManager({ dbPath: path, sessionId: "session-A" });
		const smB = new SqliteSessionManager({ dbPath: path, sessionId: "session-B" });

		await smA.appendMessage(makeUserMessage("only in A"));
		await smB.appendMessage(makeUserMessage("only in B"));

		expect((await smA.buildSessionContext()).messages).toHaveLength(1);
		expect((await smA.buildSessionContext()).messages[0].role).toBe("user");
		// @ts-expect-error — accessing user message text
		expect((await smA.buildSessionContext()).messages[0].content[0].text).toBe("only in A");

		expect((await smB.buildSessionContext()).messages).toHaveLength(1);
		expect((await smB.buildSessionContext()).messages[0].role).toBe("user");
		// @ts-expect-error — accessing user message text
		expect((await smB.buildSessionContext()).messages[0].content[0].text).toBe("only in B");

		smA.close();
		smB.close();
	});

	test("custom table name works", async () => {
		const sm = createSm("custom-table-test", "my_entries");
		await sm.appendMessage(makeUserMessage("custom table"));
		const { messages } = await sm.buildSessionContext();
		expect(messages).toHaveLength(1);
		sm.close();
	});

	test("invalid table name throws on construction", async () => {
		expect(() => createSm("bad-table", "DROP TABLE entries; --")).toThrow(/Invalid table name/);
		expect(() => createSm("bad-table", "123invalid")).toThrow(/Invalid table name/);
		expect(() => createSm("bad-table", "has spaces")).toThrow(/Invalid table name/);
	});

	test("compaction state persists across close/reopen", async () => {
		const path = dbPath();
		const sessionId = "persist-compact";

		const sm1 = new SqliteSessionManager({ dbPath: path, sessionId });
		await sm1.appendMessage(makeUserMessage("old 1"));
		await sm1.appendMessage(makeAssistantMessage("old 2"));
		const keepId = await sm1.appendMessage(makeUserMessage("keep this"));
		await sm1.compact("summary of old messages", keepId, 1000);
		sm1.close();

		const sm2 = new SqliteSessionManager({ dbPath: path, sessionId });
		const { messages } = await sm2.buildSessionContext();
		// compactionSummary + "keep this"
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("compactionSummary");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].summary).toBe("summary of old messages");
		// @ts-expect-error — accessing compactionSummary role field
		expect(messages[0].tokensBefore).toBe(1000);
		expect(messages[1].role).toBe("user");
		sm2.close();
	});

	test("custom message timestamp is preserved across close/reopen", async () => {
		const path = dbPath();
		const sessionId = "timestamp-test";

		const beforeInsert = Date.now();

		const sm1 = new SqliteSessionManager({ dbPath: path, sessionId });
		await sm1.appendCustomMessageEntry("ext-1", "original content", true);
		sm1.close();

		const afterInsert = Date.now();

		const sm2 = new SqliteSessionManager({ dbPath: path, sessionId });
		const { messages } = await sm2.buildSessionContext();
		expect(messages).toHaveLength(1);
		// The timestamp should be between beforeInsert and afterInsert, not the current time.
		// @ts-expect-error — accessing custom role field
		const timestamp = messages[0].timestamp as number;
		expect(timestamp).toBeGreaterThanOrEqual(beforeInsert);
		expect(timestamp).toBeLessThanOrEqual(afterInsert);
		sm2.close();
	});

	test("entries have sequential seq values within a session", async () => {
		const path = dbPath();
		const sessionId = "seq-test";

		const sm = new SqliteSessionManager({ dbPath: path, sessionId });
		const id1 = await sm.appendMessage(makeUserMessage("first"));
		const id2 = await sm.appendMessage(makeUserMessage("second"));

		// Verify seq ordering by checking a raw query
		// @ts-expect-error — accessing private db for testing
		const rows = sm.db
			.prepare("SELECT seq FROM entries WHERE session_id = ? ORDER BY seq ASC")
			.all(sessionId) as { seq: number }[];

		expect(rows).toHaveLength(2);
		expect(rows[0].seq).toBe(1);
		expect(rows[1].seq).toBe(2);
		sm.close();
	});
});
