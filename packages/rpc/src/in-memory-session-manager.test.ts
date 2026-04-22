import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, test } from "vitest";
import {
	InMemorySessionManager,
	createInMemorySessionManager,
} from "./in-memory-session-manager.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function userMsg(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1,
	} as AgentMessage;
}

function assistantMsg(text: string): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		timestamp: 2,
	} as AgentMessage;
}

// ─── Entry uniqueness & ordering ─────────────────────────────────────

describe("InMemorySessionManager", () => {
	describe("entry IDs", () => {
		test("appendMessage returns unique sequential IDs", async () => {
			const sm = createInMemorySessionManager();
			const id1 = await sm.appendMessage(userMsg("a"));
			const id2 = await sm.appendMessage(userMsg("b"));
			expect(id1).toBe("1");
			expect(id2).toBe("2");
			expect(id1).not.toBe(id2);
		});

		test("IDs are unique across different entry types", async () => {
			const sm = createInMemorySessionManager();
			const id1 = await sm.appendMessage(userMsg("a"));
			const id2 = await sm.appendLabel("bookmark", id1);
			const id3 = await sm.compact();
			expect(id1).toBe("1");
			expect(id2).toBe("2");
			expect(id3).toBe("3");
		});
	});

	// ─── getEntries ─────────────────────────────────────────────────

	describe("getEntries", () => {
		test("returns a snapshot (not a live reference)", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("a"));
			const entries1 = await sm.getEntries();
			await sm.appendMessage(userMsg("b"));
			const entries2 = await sm.getEntries();
			expect(entries1).toHaveLength(1);
			expect(entries2).toHaveLength(2);
		});

		test("returns all entry types verbatim", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("hello"));
			await sm.appendCustomEntry("my-ext", { foo: "bar" });
			await sm.appendModelChange({ provider: "anthropic", modelId: "claude-3" }, "low");
			await sm.appendLabel("important", "1");

			const entries = await sm.getEntries();
			expect(entries).toHaveLength(4);
			expect(entries[0].type).toBe("message");
			expect(entries[1].type).toBe("customEntry");
			expect(entries[2].type).toBe("modelChange");
			expect(entries[3].type).toBe("label");
		});
	});

	// ─── buildSessionContext — no compaction ────────────────────────

	describe("buildSessionContext (no compaction)", () => {
		test("returns empty context for new session", async () => {
			const sm = createInMemorySessionManager();
			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toEqual([]);
			expect(ctx.model).toBeNull();
			expect(ctx.thinkingLevel).toBe("off");
		});

		test("includes all appended messages in order", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("hello"));
			await sm.appendMessage(assistantMsg("hi there"));
			await sm.appendMessage(userMsg("bye"));

			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toHaveLength(3);
			expect((ctx.messages[0] as AgentMessage).content).toEqual([{ type: "text", text: "hello" }]);
			expect((ctx.messages[1] as AgentMessage).content).toEqual([
				{ type: "text", text: "hi there" },
			]);
			expect((ctx.messages[2] as AgentMessage).content).toEqual([{ type: "text", text: "bye" }]);
		});

		test("includes custom message entries in context", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("question"));
			await sm.appendCustomMessageEntry("system_notice", "Processing...", true);

			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toHaveLength(2);
			// Second message should be a custom message
			expect((ctx.messages[1] as AgentMessage).role).toBe("custom");
		});

		test("excludes metadata entries (modelChange, thinkingLevelChange, label, customEntry) from messages", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("hello"));
			await sm.appendModelChange({ provider: "anthropic", modelId: "claude-3" }, "low");
			await sm.appendThinkingLevelChange("high");
			await sm.appendLabel("bookmark", "1");
			await sm.appendCustomEntry("my-ext", { state: {} });
			await sm.appendMessage(userMsg("world"));

			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toHaveLength(2);
		});

		test("extracts latest model and thinking level from metadata entries", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendModelChange({ provider: "openai", modelId: "gpt-4" }, "off");
			await sm.appendMessage(userMsg("switch"));
			await sm.appendModelChange({ provider: "anthropic", modelId: "claude-3" }, "low");
			await sm.appendThinkingLevelChange("high");

			const ctx = await sm.buildSessionContext();
			expect(ctx.model).toEqual({ provider: "anthropic", modelId: "claude-3" });
			expect(ctx.thinkingLevel).toBe("high");
		});

		test("thinkingLevel defaults to off when no metadata entries exist", async () => {
			const sm = createInMemorySessionManager();
			const ctx = await sm.buildSessionContext();
			expect(ctx.thinkingLevel).toBe("off");
		});

		test("model defaults to null when no metadata entries exist", async () => {
			const sm = createInMemorySessionManager();
			const ctx = await sm.buildSessionContext();
			expect(ctx.model).toBeNull();
		});
	});

	// ─── buildSessionContext — with compaction ──────────────────────

	describe("buildSessionContext (with compaction)", () => {
		test("full compaction (no summary, no firstKeptEntryId) discards all pre-compaction messages", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("old 1"));
			await sm.appendMessage(userMsg("old 2"));
			await sm.compact();
			await sm.appendMessage(userMsg("new 1"));

			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toHaveLength(1);
			expect((ctx.messages[0] as AgentMessage).content).toEqual([{ type: "text", text: "new 1" }]);
		});

		test("compaction with summary prepends summary message", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("old"));
			await sm.compact("Summarized conversation", undefined, 500);
			await sm.appendMessage(userMsg("new"));

			const ctx = await sm.buildSessionContext();
			expect(ctx.messages).toHaveLength(2);
			// Summary message has role compactionSummary
			expect((ctx.messages[0] as AgentMessage).role).toBe("compactionSummary");
			expect((ctx.messages[1] as AgentMessage).content).toEqual([{ type: "text", text: "new" }]);
		});

		test("compaction with firstKeptEntryId keeps messages from that entry onward (excluding compaction entry)", async () => {
			const sm = createInMemorySessionManager();
			const id1 = await sm.appendMessage(userMsg("msg 1"));
			await sm.appendMessage(userMsg("msg 2"));
			const id3 = await sm.appendMessage(userMsg("msg 3"));
			await sm.appendMessage(userMsg("msg 4"));
			// Compact but keep from msg 3 onward
			await sm.compact("summary", id3);

			const ctx = await sm.buildSessionContext();
			// Summary + msg 3 + msg 4
			expect(ctx.messages).toHaveLength(3);
			expect((ctx.messages[1] as AgentMessage).content).toEqual([{ type: "text", text: "msg 3" }]);
			expect((ctx.messages[2] as AgentMessage).content).toEqual([{ type: "text", text: "msg 4" }]);
		});

		test("latest compaction wins when multiple compactions exist", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("a"));
			await sm.compact("first summary");
			await sm.appendMessage(userMsg("b"));
			await sm.compact("second summary");
			await sm.appendMessage(userMsg("c"));

			const ctx = await sm.buildSessionContext();
			// Second summary + msg c (msg a and b are behind both compactions)
			expect(ctx.messages).toHaveLength(2);
			expect((ctx.messages[0] as AgentMessage).role).toBe("compactionSummary");
			expect((ctx.messages[1] as AgentMessage).content).toEqual([{ type: "text", text: "c" }]);
		});

		test("messages after compaction are always included", async () => {
			const sm = createInMemorySessionManager();
			await sm.appendMessage(userMsg("before"));
			await sm.compact("summary", undefined, 100);
			await sm.appendMessage(userMsg("after 1"));
			await sm.appendCustomMessageEntry("notice", "pinned", true);
			await sm.appendMessage(userMsg("after 2"));

			const ctx = await sm.buildSessionContext();
			// summary + after1 + custom notice + after2
			expect(ctx.messages).toHaveLength(4);
		});
	});

	// ─── Factory ────────────────────────────────────────────────────

	describe("createInMemorySessionManager", () => {
		test("returns an InMemorySessionManager instance", () => {
			const sm = createInMemorySessionManager();
			expect(sm).toBeInstanceOf(InMemorySessionManager);
		});
	});
});
