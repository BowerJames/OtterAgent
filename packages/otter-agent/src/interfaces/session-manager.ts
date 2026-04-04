import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";

/**
 * A unique identifier for a session entry.
 */
export type EntryId = string;

/**
 * The result of building session context for the LLM.
 *
 * Contains the ordered message list along with the model and thinking
 * level that were active when the session was last used.
 */
export interface SessionContext {
	/** Ordered array of messages suitable for the LLM context. */
	messages: AgentMessage[];
	/** The thinking level at the end of the session. Defaults to "off". */
	thinkingLevel: ThinkingLevel;
	/** The model in use at the end of the session, or null if unknown. */
	model: { provider: string; modelId: string } | null;
}

/**
 * Minimal interface for persisting conversation state.
 *
 * Follows an append-only model. Does not mandate tree/branching semantics —
 * a tree-based implementation can be built on top of this interface.
 *
 * Every entry gets a unique ID. Manages single-session operations only —
 * multi-session management (listing, switching, creating) is left to
 * implementations.
 */
export interface SessionManager {
	/**
	 * Append an agent message as the next entry in the session.
	 *
	 * @param message - The agent message to persist.
	 * @returns The unique ID of the created entry.
	 */
	appendMessage(message: AgentMessage): EntryId;

	/**
	 * Build the session context for the LLM.
	 *
	 * Handles compaction: if a compaction marker exists, messages before
	 * `firstKeptEntryId` are discarded and the compaction summary is
	 * inserted as an assistant message.
	 *
	 * Custom message entries (from `appendCustomMessageEntry`) are included.
	 * Metadata entries (model change, thinking level, labels) and custom
	 * entries (from `appendCustomEntry`) are excluded from the messages
	 * array, but model and thinking level are extracted from their
	 * respective metadata entries.
	 *
	 * @returns The session context including messages, thinking level, and model.
	 */
	buildSessionContext(): SessionContext;

	/**
	 * Record a compaction event. When `buildSessionContext()` is called,
	 * messages before `firstKeptEntryId` will be replaced by the summary.
	 *
	 * @param summary - The compaction summary text.
	 * @param firstKeptEntryId - The ID of the first entry to keep after
	 *   compaction. All entries before this are replaced by the summary.
	 * @param tokensBefore - The number of tokens in the context before
	 *   compaction. Used for display purposes. Defaults to 0 if unknown.
	 * @param details - Optional implementation-specific compaction metadata.
	 * @returns The unique ID of the compaction entry.
	 */
	compact(
		summary: string,
		firstKeptEntryId: EntryId,
		tokensBefore?: number,
		details?: unknown,
	): EntryId;

	/**
	 * Persist extension state that is NOT included in LLM context.
	 *
	 * Used by extensions to store state that survives session reloads.
	 * On reload, extensions can scan for their `customType` to reconstruct
	 * internal state.
	 *
	 * @param customType - Extension identifier for filtering entries.
	 * @param data - Optional extension-specific data to persist.
	 * @returns The unique ID of the created entry.
	 */
	appendCustomEntry(customType: string, data?: unknown): EntryId;

	/**
	 * Persist an extension message that IS included in LLM context.
	 *
	 * Unlike `appendCustomEntry`, custom message entries participate in
	 * the conversation — their `content` is included by `buildSessionContext()`.
	 *
	 * @param customType - Extension identifier for filtering entries.
	 * @param content - The message content sent to the LLM. Can be a plain
	 *   string or an array of text/image content blocks.
	 * @param display - Whether the message should be shown in the UI.
	 *   `true` = visible with distinct styling, `false` = hidden.
	 * @param details - Optional extension-specific metadata (not sent to LLM).
	 * @returns The unique ID of the created entry.
	 */
	appendCustomMessageEntry(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: unknown,
	): EntryId;

	/**
	 * Record a model and thinking level change.
	 *
	 * This metadata entry is persisted for session restore but is not
	 * included in the LLM context.
	 *
	 * @param model - The new model identifier.
	 * @param thinkingLevel - The thinking level at the time of the change.
	 * @returns The unique ID of the created entry.
	 */
	appendModelChange(model: { provider: string; modelId: string }, thinkingLevel: string): EntryId;

	/**
	 * Record a thinking level change.
	 *
	 * This metadata entry is persisted for session restore but is not
	 * included in the LLM context.
	 *
	 * @param thinkingLevel - The new thinking level.
	 * @returns The unique ID of the created entry.
	 */
	appendThinkingLevelChange(thinkingLevel: string): EntryId;

	/**
	 * Attach a label/bookmark to a specific entry.
	 *
	 * Labels are user-defined markers that can be used for navigation
	 * or bookmarking significant points in the conversation.
	 *
	 * @param label - The label text.
	 * @param targetEntryId - The ID of the entry to label.
	 * @returns The unique ID of the label entry.
	 */
	appendLabel(label: string, targetEntryId: EntryId): EntryId;
}

/**
 * Read-only view of a SessionManager.
 *
 * Exposed to extensions in event handlers to prevent uncontrolled
 * mutation of session state. Extensions should use the ExtensionsAPI
 * methods (sendMessage, appendEntry, etc.) to write to the session.
 */
export type ReadonlySessionManager = Pick<SessionManager, "buildSessionContext">;
