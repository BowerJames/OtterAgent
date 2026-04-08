import { Database } from "bun:sqlite";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { EntryId, SessionContext, SessionManager } from "../interfaces/session-manager.js";
import { createCompactionSummaryMessage, createCustomMessage } from "../session/messages.js";

// ─── Entry types (mirrors InMemoryEntry) ─────────────────────────────────────

type SqliteEntry =
	| { type: "message"; id: EntryId; message: AgentMessage }
	| {
			type: "customMessage";
			id: EntryId;
			customType: string;
			content: string | (TextContent | ImageContent)[];
			display: boolean;
			details?: unknown;
			timestamp: number;
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

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * Options for {@link SqliteSessionManager}.
 */
export interface SqliteSessionManagerOptions {
	/** Path to the SQLite database file. Created if it doesn't exist. */
	dbPath: string;
	/** Unique session identifier. Entries are scoped to this ID. */
	sessionId: string;
	/** Optional table name. Defaults to "entries". */
	tableName?: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateTableName(tableName: string): void {
	if (!TABLE_NAME_RE.test(tableName)) {
		throw new Error(`Invalid table name "${tableName}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`);
	}
}

const MAX_SESSION_ID_LENGTH = 255;

function validateSessionId(sessionId: string): void {
	if (sessionId.length === 0) {
		throw new Error("sessionId must not be empty.");
	}
	if (sessionId.length > MAX_SESSION_ID_LENGTH) {
		throw new Error(
			`sessionId must not exceed ${MAX_SESSION_ID_LENGTH} characters (got ${sessionId.length}).`,
		);
	}
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * A {@link SessionManager} implementation backed by a SQLite database.
 *
 * Entries are persisted in a single table shared across sessions, scoped by
 * `session_id`. One database file can serve many sessions simultaneously.
 *
 * Uses `bun:sqlite` for synchronous, high-performance access. WAL journal
 * mode is enabled for safe concurrent reads.
 *
 * @example
 * ```typescript
 * import { SqliteSessionManager } from "@otter-agent/core";
 *
 * const sm = new SqliteSessionManager({
 *   dbPath: "./sessions.db",
 *   sessionId: "my-session-id",
 * });
 *
 * // Or via the namespace factory:
 * import { SessionManager } from "@otter-agent/core";
 * const sm = SessionManager.sqlite({ dbPath: "./sessions.db", sessionId: "my-session-id" });
 * ```
 */
export class SqliteSessionManager implements SessionManager {
	private readonly db: Database;
	private readonly sessionId: string;
	private readonly tableName: string;

	private closed = false;

	constructor(options: SqliteSessionManagerOptions) {
		const tableName = options.tableName ?? "entries";
		validateTableName(tableName);
		validateSessionId(options.sessionId);

		this.db = new Database(options.dbPath, { create: true });
		this.sessionId = options.sessionId;
		this.tableName = tableName;

		this.db.exec("PRAGMA journal_mode=WAL");
		this.db.exec("PRAGMA foreign_keys=ON");

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS "${this.tableName}" (
				id         TEXT NOT NULL,
				session_id TEXT NOT NULL,
				seq        INTEGER NOT NULL,
				type       TEXT NOT NULL,
				data       TEXT NOT NULL,
				created_at TEXT NOT NULL,
				PRIMARY KEY (id)
			)
		`);

		this.db.exec(
			`CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_session_seq" ON "${this.tableName}"(session_id, seq)`,
		);
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	private assertNotClosed(): void {
		if (this.closed) {
			throw new Error("SqliteSessionManager is closed. No further operations are permitted.");
		}
	}

	private insert(type: string, data: unknown): EntryId {
		this.assertNotClosed();
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();

		this.db
			.prepare(
				`INSERT INTO "${this.tableName}" (id, session_id, seq, type, data, created_at)
			 VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM "${this.tableName}" WHERE session_id = ?), ?, ?, ?)`,
			)
			.run(id, this.sessionId, this.sessionId, type, JSON.stringify(data), createdAt);

		return id;
	}

	private loadEntries(): SqliteEntry[] {
		this.assertNotClosed();
		const rows = this.db
			.prepare(
				`SELECT id, type, data FROM "${this.tableName}" WHERE session_id = ? ORDER BY seq ASC`,
			)
			.all(this.sessionId) as { id: string; type: string; data: string }[];

		return rows.map((row) => {
			const parsed = JSON.parse(row.data) as Record<string, unknown>;
			switch (row.type) {
				case "message":
					return { type: "message", id: row.id, message: parsed.message as AgentMessage };
				case "customMessage":
					return {
						type: "customMessage",
						id: row.id,
						customType: parsed.customType as string,
						content: parsed.content as string | (TextContent | ImageContent)[],
						display: parsed.display as boolean,
						details: parsed.details as unknown,
						timestamp: parsed.timestamp as number,
					};
				case "customEntry":
					return {
						type: "customEntry",
						id: row.id,
						customType: parsed.customType as string,
						data: parsed.data as unknown,
					};
				case "modelChange":
					return {
						type: "modelChange",
						id: row.id,
						model: parsed.model as { provider: string; modelId: string },
						thinkingLevel: parsed.thinkingLevel as string,
					};
				case "thinkingLevelChange":
					return {
						type: "thinkingLevelChange",
						id: row.id,
						thinkingLevel: parsed.thinkingLevel as string,
					};
				case "compaction":
					return {
						type: "compaction",
						id: row.id,
						summary: parsed.summary as string,
						firstKeptEntryId: parsed.firstKeptEntryId as EntryId,
						tokensBefore: parsed.tokensBefore as number,
						details: parsed.details as unknown,
					};
				case "label":
					return {
						type: "label",
						id: row.id,
						label: parsed.label as string,
						targetEntryId: parsed.targetEntryId as EntryId,
					};
				default:
					throw new Error(`Unknown entry type "${row.type}" in session data.`);
			}
		});
	}

	// ── SessionManager interface ─────────────────────────────────────────────

	appendMessage(message: AgentMessage): EntryId {
		this.assertNotClosed();
		return this.insert("message", { message });
	}

	appendCustomMessageEntry(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: unknown,
	): EntryId {
		this.assertNotClosed();
		return this.insert("customMessage", {
			customType,
			content,
			display,
			details,
			timestamp: Date.now(),
		});
	}

	appendCustomEntry(customType: string, data?: unknown): EntryId {
		this.assertNotClosed();
		return this.insert("customEntry", { customType, data });
	}

	appendModelChange(model: { provider: string; modelId: string }, thinkingLevel: string): EntryId {
		this.assertNotClosed();
		return this.insert("modelChange", { model, thinkingLevel });
	}

	appendThinkingLevelChange(thinkingLevel: string): EntryId {
		this.assertNotClosed();
		return this.insert("thinkingLevelChange", { thinkingLevel });
	}

	compact(
		summary: string,
		firstKeptEntryId: EntryId,
		tokensBefore = 0,
		details?: unknown,
	): EntryId {
		this.assertNotClosed();
		return this.insert("compaction", { summary, firstKeptEntryId, tokensBefore, details });
	}

	appendLabel(label: string, targetEntryId: EntryId): EntryId {
		this.assertNotClosed();
		return this.insert("label", { label, targetEntryId });
	}

	buildSessionContext(): SessionContext {
		this.assertNotClosed();
		const entries = this.loadEntries();

		// Find the latest compaction entry.
		let latestCompaction: Extract<SqliteEntry, { type: "compaction" }> | undefined;
		for (const entry of entries) {
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
			const firstKeptIndex = entries.findIndex((e) => e.id === compaction.firstKeptEntryId);

			if (firstKeptIndex === -1) {
				// firstKeptEntryId not found — full compaction fallback.
				const compactionIndex = entries.indexOf(latestCompaction);
				const afterCompaction = entries.slice(compactionIndex + 1);
				messages = [compactionSummary, ...extractMessages(afterCompaction)];
			} else {
				// Include message-bearing entries from firstKeptEntryId onward,
				// but stop before (and excluding) the compaction entry itself.
				const compactionIndex = entries.indexOf(latestCompaction);
				const tail = entries.slice(firstKeptIndex, compactionIndex);
				const tailMessages = extractMessages(tail);

				// Also include any message-bearing entries after the compaction entry.
				const afterCompaction = entries.slice(compactionIndex + 1);
				const afterMessages = extractMessages(afterCompaction);

				messages = [compactionSummary, ...tailMessages, ...afterMessages];
			}
		} else {
			messages = extractMessages(entries);
		}

		// Extract the latest model and thinking level from metadata entries.
		let model: { provider: string; modelId: string } | null = null;
		let thinkingLevel = "off";

		for (const entry of entries) {
			if (entry.type === "modelChange") {
				model = entry.model;
				thinkingLevel = entry.thinkingLevel;
			} else if (entry.type === "thinkingLevelChange") {
				thinkingLevel = entry.thinkingLevel;
			}
		}

		return { messages, thinkingLevel: thinkingLevel as ThinkingLevel, model };
	}

	// ── SqliteSessionManager-specific ────────────────────────────────────────

	/**
	 * Close the underlying database connection.
	 *
	 * After calling this, any further method calls on this instance will throw.
	 * Calling close() more than once is safe — subsequent calls log a warning
	 * and return silently.
	 */
	close(): void {
		if (this.closed) {
			console.warn("SqliteSessionManager.close() called on an already-closed instance.");
			return;
		}
		this.db.close();
		this.closed = true;
	}
}

// ─── Standalone extraction helper (avoids `this` binding in callbacks) ───────

function extractMessages(entries: SqliteEntry[]): AgentMessage[] {
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

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new SQLite-backed {@link SessionManager} that persists entries to
 * a database file. One database file can hold entries for many sessions,
 * with each instance scoped to a single `session_id`.
 *
 * @param options - Configuration for the session manager.
 * @returns A new {@link SqliteSessionManager} instance.
 */
export function createSqliteSessionManager(
	options: SqliteSessionManagerOptions,
): SqliteSessionManager {
	return new SqliteSessionManager(options);
}
