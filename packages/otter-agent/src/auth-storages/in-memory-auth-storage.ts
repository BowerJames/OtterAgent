import type { AuthStorage } from "../interfaces/auth-storage.js";

export class InMemoryAuthStorage implements AuthStorage {
	private readonly keys: ReadonlyMap<string, string>;

	constructor(keys: Record<string, string> = {}) {
		this.keys = new Map(Object.entries(keys));
	}

	async getApiKey(provider: string): Promise<string | undefined> {
		return this.keys.get(provider);
	}
}

/**
 * Creates a new read-only in-memory {@link AuthStorage} seeded with the
 * provided provider-to-API-key map. Returns `undefined` for any provider
 * not present in the initial map.
 *
 * @param keys - Optional map of provider identifier to API key
 *   (e.g., `{ anthropic: "sk-ant-...", openai: "sk-..." }`).
 */
export function createInMemoryAuthStorage(keys?: Record<string, string>): InMemoryAuthStorage {
	return new InMemoryAuthStorage(keys);
}
