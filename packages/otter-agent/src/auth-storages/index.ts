import type { AuthStorage as IAuthStorage } from "../interfaces/auth-storage.js";
import { type InMemoryAuthStorage, createInMemoryAuthStorage } from "./in-memory-auth-storage.js";

export { createInMemoryAuthStorage, InMemoryAuthStorage } from "./in-memory-auth-storage.js";

/**
 * Namespace providing factory methods for built-in {@link IAuthStorage}
 * implementations. The empty interface extension below enables TypeScript
 * declaration merging so `AuthStorage` is both a type (the full interface)
 * and a value (the namespace with factory methods) in a single export.
 *
 * @example
 * ```typescript
 * import { AuthStorage } from "@otter-agent/core";
 * const auth: AuthStorage = AuthStorage.inMemory({ anthropic: "sk-ant-..." });
 * ```
 */
// Empty interface extension enables declaration merging with the namespace below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AuthStorage extends IAuthStorage {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AuthStorage {
	/**
	 * Creates a read-only in-memory {@link InMemoryAuthStorage} seeded with the
	 * provided provider-to-API-key map. Useful for testing and embedded usage
	 * where credentials are known at construction time.
	 *
	 * @param keys - Optional map of provider identifier to API key
	 *   (e.g., `{ anthropic: "sk-ant-...", openai: "sk-..." }`).
	 */
	export function inMemory(keys?: Record<string, string>): InMemoryAuthStorage {
		return createInMemoryAuthStorage(keys);
	}
}
