import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type {
	ComponentTemplate,
	Entry,
	EntryId,
	SessionContext,
	SessionManager,
} from "@otter-agent/core";
import { createCompactionSummaryMessage, createCustomMessage } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

export class InMemorySessionManager implements SessionManager {
	private readonly entries: Entry[] = [];
	private nextId = 1;

	private generateId(): EntryId {
		return String(this.nextId++);
	}

	async appendMessage(message: AgentMessage): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({ type: "message", id, message });
		return id;
	}

	async appendCustomMessageEntry(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: unknown,
	): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({
			type: "customMessage",
			id,
			customType,
			content,
			display,
			details,
			timestamp: Date.now(),
		});
		return id;
	}

	async appendCustomEntry(customType: string, data?: unknown): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({ type: "customEntry", id, customType, data });
		return id;
	}

	async appendModelChange(
		model: { provider: string; modelId: string },
		thinkingLevel: string,
	): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({ type: "modelChange", id, model, thinkingLevel });
		return id;
	}

	async appendThinkingLevelChange(thinkingLevel: string): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({ type: "thinkingLevelChange", id, thinkingLevel });
		return id;
	}

	async compact(
		summary?: string,
		firstKeptEntryId?: EntryId,
		tokensBefore = 0,
		details?: unknown,
	): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({
			type: "compaction",
			id,
			summary,
			firstKeptEntryId,
			tokensBefore,
			details,
		});
		return id;
	}

	async appendLabel(label: string, targetEntryId: EntryId): Promise<EntryId> {
		const id = this.generateId();
		this.entries.push({ type: "label", id, label, targetEntryId });
		return id;
	}

	async getEntries(): Promise<Entry[]> {
		return [...this.entries];
	}

	async buildSessionContext(): Promise<SessionContext> {
		// Find the latest compaction entry.
		let latestCompaction: Extract<Entry, { type: "compaction" }> | undefined;
		for (const entry of this.entries) {
			if (entry.type === "compaction") {
				latestCompaction = entry;
			}
		}

		// Collect messages.
		let messages: AgentMessage[];

		if (latestCompaction !== undefined) {
			const compaction = latestCompaction;
			const compactionIndex = this.entries.indexOf(latestCompaction);

			// Build the message list starting with an optional summary.
			messages = [];

			if (compaction.summary !== undefined) {
				messages.push(createCompactionSummaryMessage(compaction.summary, compaction.tokensBefore));
			}

			if (compaction.firstKeptEntryId !== undefined) {
				// Include message-bearing entries from firstKeptEntryId onward,
				// but stop before (and excluding) the compaction entry itself.
				const firstKeptIndex = this.entries.findIndex((e) => e.id === compaction.firstKeptEntryId);
				if (firstKeptIndex !== -1) {
					const tail = this.entries.slice(firstKeptIndex, compactionIndex);
					messages.push(...this.extractMessages(tail));
				}
			}

			// Include any message-bearing entries after the compaction entry.
			const afterCompaction = this.entries.slice(compactionIndex + 1);
			messages.push(...this.extractMessages(afterCompaction));
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

	private extractMessages(entries: Entry[]): AgentMessage[] {
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
						entry.timestamp,
					),
				);
			}
		}
		return messages;
	}
}

// ─── ComponentTemplate ────────────────────────────────────────────────────────

/** TypeBox schema for {@link InMemorySessionManager} options. */
export const InMemorySessionManagerOptionsSchema = Type.Object({});

/**
 * {@link ComponentTemplate} for {@link InMemorySessionManager}.
 *
 * Builds an in-memory session manager with no configuration.
 */
export const InMemorySessionManagerTemplate: ComponentTemplate<
	typeof InMemorySessionManagerOptionsSchema,
	InMemorySessionManager
> = {
	configSchema: () => InMemorySessionManagerOptionsSchema,
	defaultConfig: () => ({}),
	build() {
		return new InMemorySessionManager();
	},
};
