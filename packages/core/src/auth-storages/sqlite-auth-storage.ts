import DatabaseConstructor from "better-sqlite3";
type Database = InstanceType<typeof DatabaseConstructor>;
import { Type } from "@sinclair/typebox";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { ComponentTemplate } from "../interfaces/component-template.js";

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * Options for {@link SqliteAuthStorage}.
 */
export interface SqliteAuthStorageOptions {
	/** Path to the SQLite database file. Created if it doesn't exist. */
	dbPath: string;
	/** Unique storage identifier. Keys are scoped to this ID. */
	storageId: string;
	/** Optional table name. Defaults to "auth_keys". */
	tableName?: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateTableName(tableName: string): void {
	if (!TABLE_NAME_RE.test(tableName)) {
		throw new Error(`Invalid table name "${tableName}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`);
	}
}

const MAX_STORAGE_ID_LENGTH = 255;

function validateStorageId(storageId: string): void {
	if (storageId.length === 0) {
		throw new Error("storageId must not be empty.");
	}
	if (storageId.length > MAX_STORAGE_ID_LENGTH) {
		throw new Error(
			`storageId must not exceed ${MAX_STORAGE_ID_LENGTH} characters (got ${storageId.length}).`,
		);
	}
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * A read-only {@link AuthStorage} implementation backed by a SQLite database.
 *
 * Keys are stored in a table scoped by `storage_id`. One database file can
 * hold keys for many storages simultaneously. This implementation is read-only
 * — keys must be inserted into the database externally (e.g., by a setup script
 * or migration).
 *
 * Uses `better-sqlite3` for synchronous, high-performance access. WAL journal
 * mode is enabled for safe concurrent reads.
 *
 * @example
 * ```typescript
 * import { SqliteAuthStorage } from "@otter-agent/core";
 *
 * const auth = new SqliteAuthStorage({
 *   dbPath: "./auth.db",
 *   storageId: "my-profile",
 * });
 *
 * // Or via the namespace factory:
 * import { AuthStorage } from "@otter-agent/core";
 * const auth = AuthStorage.sqlite({ dbPath: "./auth.db", storageId: "my-profile" });
 * ```
 */
export class SqliteAuthStorage implements AuthStorage {
	private readonly db: Database;
	private readonly storageId: string;
	private readonly tableName: string;

	private closed = false;

	constructor(options: SqliteAuthStorageOptions) {
		const tableName = options.tableName ?? "auth_keys";
		validateTableName(tableName);
		validateStorageId(options.storageId);

		this.db = new DatabaseConstructor(options.dbPath);
		this.storageId = options.storageId;
		this.tableName = tableName;

		this.db.exec("PRAGMA journal_mode=WAL");
		this.db.exec("PRAGMA foreign_keys=ON");

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS "${this.tableName}" (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				storage_id TEXT NOT NULL,
				provider   TEXT NOT NULL,
				api_key    TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE(storage_id, provider)
			)
		`);
	}

	// ── AuthStorage interface ─────────────────────────────────────────────

	async getApiKey(provider: string): Promise<string | undefined> {
		this.assertNotClosed();
		const row = this.db
			.prepare(`SELECT api_key FROM "${this.tableName}" WHERE storage_id = ? AND provider = ?`)
			.get(this.storageId, provider) as { api_key: string } | undefined;
		return row?.api_key;
	}

	// ── SqliteAuthStorage-specific ────────────────────────────────────────

	/**
	 * Close the underlying database connection.
	 *
	 * After calling this, any further method calls on this instance will throw.
	 * Calling close() more than once is safe — subsequent calls log a warning
	 * and return silently.
	 */
	close(): void {
		if (this.closed) {
			console.warn("SqliteAuthStorage.close() called on an already-closed instance.");
			return;
		}
		this.db.close();
		this.closed = true;
	}

	// ── Private helpers ──────────────────────────────────────────────────

	private assertNotClosed(): void {
		if (this.closed) {
			throw new Error("SqliteAuthStorage is closed. No further operations are permitted.");
		}
	}
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new read-only SQLite-backed {@link AuthStorage} that retrieves
 * API keys from a database file. One database file can hold keys for many
 * storages, with each instance scoped to a single `storageId`.
 *
 * @param options - Configuration for the auth storage.
 * @returns A new {@link SqliteAuthStorage} instance.
 */
export function createSqliteAuthStorage(options: SqliteAuthStorageOptions): SqliteAuthStorage {
	return new SqliteAuthStorage(options);
}

// ─── ComponentTemplate ────────────────────────────────────────────────────────

/** TypeBox schema for {@link SqliteAuthStorage} options. */
export const SqliteAuthStorageOptionsSchema = Type.Object({
	/** Path to the SQLite database file. Created if it doesn't exist. */
	dbPath: Type.String({ minLength: 1 }),
	/** Unique storage identifier. Keys are scoped to this ID. */
	storageId: Type.String({ minLength: 1 }),
	/** Optional table name. Defaults to "auth_keys". */
	tableName: Type.Optional(Type.String({ minLength: 1 })),
});

/**
 * {@link ComponentTemplate} for {@link SqliteAuthStorage}.
 *
 * Builds a SQLite-backed auth storage from a config file.
 */
export const SqliteAuthStorageTemplate: ComponentTemplate<
	typeof SqliteAuthStorageOptionsSchema,
	SqliteAuthStorage
> = {
	configSchema: () => SqliteAuthStorageOptionsSchema,
	defaultConfig: () => ({ dbPath: "./auth.db", storageId: "default" }),
	build: (config) => new SqliteAuthStorage(config),
};
