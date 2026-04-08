/**
 * Type declarations for the `bun:sqlite` module.
 *
 * Provides minimal type coverage for the SQLite API surface used by
 * SqliteSessionManager. Extend as needed when additional methods are required.
 */
declare module "bun:sqlite" {
	export class Database {
		constructor(
			filename: string,
			options?: { create?: boolean; readonly?: boolean; fileMustExist?: boolean },
		);
		close(): void;
		exec(sql: string, params?: unknown[]): Database;
		prepare(sql: string): Statement;
		query(sql: string): Query;
	}

	export class Statement {
		run(...params: unknown[]): Database;
		get(...params: unknown[]): Record<string, unknown> | undefined;
		all(...params: unknown[]): Record<string, unknown>[];
		values(...params: unknown[]): unknown[][];
		columns(): { name: string; type: string }[];
		finalize(): Statement;
	}

	export class Query {
		all(...params: unknown[]): Record<string, unknown>[];
		get(...params: unknown[]): Record<string, unknown> | undefined;
		values(...params: unknown[]): unknown[][];
		run(...params: unknown[]): Database;
		columns(): { name: string; type: string }[];
	}
}
