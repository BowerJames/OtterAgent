import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DatabaseConstructor from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AuthStorage } from "./index.js";
import { SqliteAuthStorage, createSqliteAuthStorage } from "./sqlite-auth-storage.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempDir: string;

function dbPath(): string {
	return join(tempDir, "test.db");
}

function createAuth(
	storageId = "test-storage",
	tableName?: string,
	path?: string,
): SqliteAuthStorage {
	return new SqliteAuthStorage({
		dbPath: path ?? dbPath(),
		storageId,
		tableName,
	});
}

/** Insert a key directly into the database for testing.
 * Creates the table if it doesn't exist so that tests that use insertKey
 * without first constructing a SqliteAuthStorage still have the schema.
 */
function insertKey(
	dbPath: string,
	tableName: string,
	storageId: string,
	provider: string,
	apiKey: string,
): void {
	const db = new DatabaseConstructor(dbPath);
	db.exec("PRAGMA journal_mode=WAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS "${tableName}" (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			storage_id TEXT NOT NULL,
			provider   TEXT NOT NULL,
			api_key    TEXT NOT NULL,
			created_at TEXT NOT NULL,
			UNIQUE(storage_id, provider)
		)
	`);
	db.prepare(
		`INSERT INTO "${tableName}" (storage_id, provider, api_key, created_at) VALUES (?, ?, ?, ?)`,
	).run(storageId, provider, apiKey, new Date().toISOString());
	db.close();
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "otter-sqlite-auth-test-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

// ─── getApiKey ───────────────────────────────────────────────────────────────

describe("getApiKey", () => {
	test("returns undefined when no keys exist for the storage", async () => {
		const auth = createAuth();
		expect(await auth.getApiKey("anthropic")).toBeUndefined();
		expect(await auth.getApiKey("openai")).toBeUndefined();
		auth.close();
	});

	test("returns the key for a known provider", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "test-storage", "anthropic", "sk-ant-123");
		const auth = createAuth("test-storage", undefined, path);
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
		auth.close();
	});

	test("returns undefined for an unknown provider", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "test-storage", "anthropic", "sk-ant-123");
		const auth = createAuth("test-storage", undefined, path);
		expect(await auth.getApiKey("openai")).toBeUndefined();
		auth.close();
	});

	test("supports multiple providers in the same storage", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "test-storage", "anthropic", "sk-ant-123");
		insertKey(path, "auth_keys", "test-storage", "openai", "sk-oai-456");
		const auth = createAuth("test-storage", undefined, path);
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
		expect(await auth.getApiKey("openai")).toBe("sk-oai-456");
		auth.close();
	});
});

// ─── Storage isolation ───────────────────────────────────────────────────────

describe("storage isolation", () => {
	test("keys are isolated by storageId", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "storage-A", "anthropic", "key-A");
		insertKey(path, "auth_keys", "storage-B", "anthropic", "key-B");

		const authA = createAuth("storage-A", undefined, path);
		const authB = createAuth("storage-B", undefined, path);

		expect(await authA.getApiKey("anthropic")).toBe("key-A");
		expect(await authB.getApiKey("anthropic")).toBe("key-B");
		authA.close();
		authB.close();
	});

	test("a storage does not see keys from another storage", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "storage-A", "openai", "sk-oai");
		insertKey(path, "auth_keys", "storage-B", "anthropic", "sk-ant");

		const authA = createAuth("storage-A", undefined, path);
		expect(await authA.getApiKey("openai")).toBe("sk-oai");
		expect(await authA.getApiKey("anthropic")).toBeUndefined();
		authA.close();
	});
});

// ─── Persistence across close/reopen ─────────────────────────────────────────

describe("persistence across close/reopen", () => {
	test("keys survive close and reopen with the same storageId", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "persist-test", "anthropic", "sk-ant-persist");

		const auth1 = createAuth("persist-test", undefined, path);
		expect(await auth1.getApiKey("anthropic")).toBe("sk-ant-persist");
		auth1.close();

		const auth2 = createAuth("persist-test", undefined, path);
		expect(await auth2.getApiKey("anthropic")).toBe("sk-ant-persist");
		auth2.close();
	});

	test("multiple providers persist across close/reopen", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "multi-persist", "anthropic", "sk-ant");
		insertKey(path, "auth_keys", "multi-persist", "openai", "sk-oai");
		insertKey(path, "auth_keys", "multi-persist", "google", "sk-gem");

		const auth1 = createAuth("multi-persist", undefined, path);
		expect(await auth1.getApiKey("anthropic")).toBe("sk-ant");
		expect(await auth1.getApiKey("openai")).toBe("sk-oai");
		expect(await auth1.getApiKey("google")).toBe("sk-gem");
		auth1.close();

		const auth2 = createAuth("multi-persist", undefined, path);
		expect(await auth2.getApiKey("anthropic")).toBe("sk-ant");
		expect(await auth2.getApiKey("openai")).toBe("sk-oai");
		expect(await auth2.getApiKey("google")).toBe("sk-gem");
		auth2.close();
	});
});

// ─── AuthStorage.sqlite() namespace factory ──────────────────────────────────

describe("AuthStorage.sqlite()", () => {
	test("returns a working AuthStorage instance", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "ns-test", "anthropic", "sk-ant-ns");
		const auth = AuthStorage.sqlite({ dbPath: path, storageId: "ns-test" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-ns");
		auth.close();
	});

	test("returns undefined for unknown provider", async () => {
		const auth = AuthStorage.sqlite({ dbPath: dbPath(), storageId: "ns-test" });
		expect(await auth.getApiKey("openai")).toBeUndefined();
		auth.close();
	});

	test("each call returns an independent instance", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "s1", "anthropic", "key-1");
		insertKey(path, "auth_keys", "s2", "anthropic", "key-2");

		const auth1 = AuthStorage.sqlite({ dbPath: path, storageId: "s1" });
		const auth2 = AuthStorage.sqlite({ dbPath: path, storageId: "s2" });

		expect(await auth1.getApiKey("anthropic")).toBe("key-1");
		expect(await auth2.getApiKey("anthropic")).toBe("key-2");
		auth1.close();
		auth2.close();
	});

	test("satisfies the AuthStorage type (type-level check via createSqliteAuthStorage)", async () => {
		const auth1 = AuthStorage.sqlite({ dbPath: dbPath(), storageId: "s1" });
		const auth2 = createSqliteAuthStorage({ dbPath: dbPath(), storageId: "s2" });
		expect(typeof auth1.getApiKey).toBe("function");
		expect(typeof auth2.getApiKey).toBe("function");
		auth1.close();
		auth2.close();
	});
});

// ─── Direct construction & instanceof ────────────────────────────────────────

describe("SqliteAuthStorage — direct construction", () => {
	test("can be constructed directly via new", async () => {
		const path = dbPath();
		insertKey(path, "auth_keys", "direct-test", "anthropic", "sk-ant-direct");
		const auth = new SqliteAuthStorage({ dbPath: path, storageId: "direct-test" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-direct");
		auth.close();
	});

	test("instanceof SqliteAuthStorage is true for direct construction", () => {
		const auth = new SqliteAuthStorage({ dbPath: dbPath(), storageId: "instanceof-test" });
		expect(auth instanceof SqliteAuthStorage).toBe(true);
		auth.close();
	});

	test("instanceof SqliteAuthStorage is true for factory creation", () => {
		const auth = createSqliteAuthStorage({ dbPath: dbPath(), storageId: "instanceof-test" });
		expect(auth instanceof SqliteAuthStorage).toBe(true);
		auth.close();
	});

	test("instanceof SqliteAuthStorage is true for namespace factory creation", () => {
		const auth = AuthStorage.sqlite({ dbPath: dbPath(), storageId: "instanceof-test" });
		expect(auth instanceof SqliteAuthStorage).toBe(true);
		auth.close();
	});
});

// ─── Constructor validation ──────────────────────────────────────────────────

describe("constructor validation", () => {
	test("throws for empty storageId", () => {
		expect(() => createAuth("")).toThrow("storageId must not be empty");
	});

	test("throws for storageId exceeding 255 characters", () => {
		const longId = "x".repeat(256);
		expect(() => createAuth(longId)).toThrow("storageId must not exceed 255 characters");
	});

	test("accepts storageId at exactly 255 characters", async () => {
		const exactId = "x".repeat(255);
		const auth = createAuth(exactId);
		expect(await auth.getApiKey("anthropic")).toBeUndefined();
		auth.close();
	});

	test("throws for invalid table name with SQL injection", () => {
		expect(() => createAuth("test", "DROP TABLE entries; --")).toThrow(/Invalid table name/);
	});

	test("throws for table name starting with a digit", () => {
		expect(() => createAuth("test", "123invalid")).toThrow(/Invalid table name/);
	});

	test("throws for table name with spaces", () => {
		expect(() => createAuth("test", "has spaces")).toThrow(/Invalid table name/);
	});

	test("custom valid table name works", async () => {
		const path = dbPath();
		const db = new DatabaseConstructor(path);
		db.exec("PRAGMA journal_mode=WAL");
		db.exec(`
			CREATE TABLE IF NOT EXISTS "my_keys" (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				storage_id TEXT NOT NULL,
				provider   TEXT NOT NULL,
				api_key    TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE(storage_id, provider)
			)
		`);
		db.prepare(
			'INSERT INTO "my_keys" (storage_id, provider, api_key, created_at) VALUES (?, ?, ?, ?)',
		).run("custom-table-test", "anthropic", "sk-custom", new Date().toISOString());
		db.close();

		const auth = createAuth("custom-table-test", "my_keys", path);
		expect(await auth.getApiKey("anthropic")).toBe("sk-custom");
		auth.close();
	});
});

// ─── close() ──────────────────────────────────────────────────────────────────

describe("close()", () => {
	test("close() can be called without error", () => {
		const auth = createAuth();
		expect(() => auth.close()).not.toThrow();
	});

	test("calling close() twice logs a warning and does not throw", () => {
		const auth = createAuth();
		const originalWarn = console.warn;
		const warnings: unknown[] = [];
		console.warn = (...args: unknown[]) => warnings.push(args);

		try {
			auth.close();
			auth.close();

			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toEqual(
				expect.arrayContaining([expect.stringContaining("already-closed")]),
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("getApiKey throws after close", async () => {
		const auth = createAuth();
		auth.close();
		await expect(auth.getApiKey("anthropic")).rejects.toThrow("closed");
	});
});
