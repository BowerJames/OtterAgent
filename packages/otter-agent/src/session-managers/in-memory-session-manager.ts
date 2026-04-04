import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { EntryId, SessionContext, SessionManager } from "../interfaces/session-manager.js";
import { createCompactionSummaryMessage, createCustomMessage } from "../session/messages.js";

type InMemoryEntry =
	| { type: "message"; id: EntryId; message: AgentMessage }
	| {
			type: "customMessage";
			id: EntryId;
			customType: string;
			content: string | (TextContent | ImageContent)[];
			display: boolean;
			details?: unknown;
	  }
	| { type: "customEntry"; id: EntryId; customType: string; data?: unknown }
	| {
			type: "modelChange";
			id: EntryId;
			model: { provider: string; modelId: string };
			thinkingLevel: string;
	  }
	| { type: "thinkingLevelChange"; id: EntryId; thinkingLevel: string }
	| {
			type: "compaction";
			id: EntryId;
			summary: string;
			firstKeptEntryId: EntryId;
			tokensBefore: number;
			details?: unknown;
	  }
	| { type: "label"; id: EntryId; label: string; targetEntryId: EntryId };

class InMemorySessionManager implements SessionManager {
	private readonly entries: InMemoryEntry[] = [];
	private nextId = 1;

	private generateId(): EntryId {
		return String(this.nextId++);
	}

	appendMessage(message: AgentMessage): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "message", id, message });
		return id;
	}

	appendCustomMessageEntry(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: unknown,
	): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "customMessage", id, customType, content, display, details });
		return id;
	}

	appendCustomEntry(customType: string, data?: unknown): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "customEntry", id, customType, data });
		return id;
	}

	appendModelChange(model: { provider: string; modelId: string }, thinkingLevel: string): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "modelChange", id, model, thinkingLevel });
		return id;
	}

	appendThinkingLevelChange(thinkingLevel: string): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "thinkingLevelChange", id, thinkingLevel });
		return id;
	}

	compact(
		summary: string,
		firstKeptEntryId: EntryId,
		tokensBefore = 0,
		details?: unknown,
	): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "compaction", id, summary, firstKeptEntryId, tokensBefore, details });
		return id;
	}

	appendLabel(label: string, targetEntryId: EntryId): EntryId {
		const id = this.generateId();
		this.entries.push({ type: "label", id, label, targetEntryId });
		return id;
	}

	buildSessionContext(): SessionContext {
		// Find the latest compaction entry.
		let latestCompaction: Extract<InMemoryEntry, { type: "compaction" }> | undefined;
		for (const entry of this.entries) {
			if (entry.type === "compaction") {
				latestCompaction = entry;
			}
		}

		// Collect messages.
		let messages: AgentMessage[];

		if (latestCompaction !== undefined) {
			const compaction = latestCompaction;
			const compactionSummary = createCompactionSummaryMessage(
				compaction.summary,
				compaction.tokensBefore,
			);

			// Find the index of firstKeptEntryId.
			const firstKeptIndex = this.entries.findIndex((e) => e.id === compaction.firstKeptEntryId);

			if (firstKeptIndex === -1) {
				// firstKeptEntryId not found — full compaction fallback: no pre-compaction
				// messages kept, but messages appended after compact() are still included.
				const compactionIndex = this.entries.indexOf(latestCompaction);
				const afterCompaction = this.entries.slice(compactionIndex + 1);
				messages = [compactionSummary, ...this.extractMessages(afterCompaction)];
			} else {
				// Include message-bearing entries from firstKeptEntryId onward,
				// but stop before (and excluding) the compaction entry itself.
				const compactionIndex = this.entries.indexOf(latestCompaction);
				const tail = this.entries.slice(firstKeptIndex, compactionIndex);
				const tailMessages = this.extractMessages(tail);

				// Also include any message-bearing entries after the compaction entry.
				const afterCompaction = this.entries.slice(compactionIndex + 1);
				const afterMessages = this.extractMessages(afterCompaction);

				messages = [compactionSummary, ...tailMessages, ...afterMessages];
			}
		} else {
			messages = this.extractMessages(this.entries);
		}

		// Extract the latest model and thinking level from metadata entries.
		let model: { provider: string; modelId: string } | null = null;
		let thinkingLevel = "off";

		for (const entry of this.entries) {
			if (entry.type === "modelChange") {
				model = entry.model;
				thinkingLevel = entry.thinkingLevel;
			} else if (entry.type === "thinkingLevelChange") {
				thinkingLevel = entry.thinkingLevel;
			}
		}

		return { messages, thinkingLevel: thinkingLevel as ThinkingLevel, model };
	}

	private extractMessages(entries: InMemoryEntry[]): AgentMessage[] {
		const messages: AgentMessage[] = [];
		for (const entry of entries) {
			if (entry.type === "message") {
				messages.push(entry.message);
			} else if (entry.type === "customMessage") {
				messages.push(
					createCustomMessage(
						entry.customType,
						entry.content,
						entry.display,
						entry.details,
						Date.now(),
					),
				);
			}
		}
		return messages;
	}
}

/**
 * Creates a new in-memory {@link SessionManager} that stores all entries in
 * memory without any filesystem persistence. Suitable for testing,
 * programmatic/embedded usage, and consumers who manage their own persistence.
 */
export function createInMemorySessionManager(): SessionManager {
	return new InMemorySessionManager();
}
