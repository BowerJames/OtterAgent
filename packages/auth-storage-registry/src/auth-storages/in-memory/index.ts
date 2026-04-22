import type { AuthStorage } from "@otter-agent/core";
import type { ComponentTemplate } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

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

// ─── ComponentTemplate ────────────────────────────────────────────────────────

/** TypeBox schema for {@link InMemoryAuthStorage} options. */
export const InMemoryAuthStorageOptionsSchema = Type.Object({
	/** Optional map of provider identifier to API key. */
	keys: Type.Optional(Type.Record(Type.String(), Type.String())),
});

/**
 * {@link ComponentTemplate} for {@link InMemoryAuthStorage}.
 *
 * Builds an in-memory auth storage seeded with an optional key map.
 */
export const InMemoryAuthStorageTemplate: ComponentTemplate<
	typeof InMemoryAuthStorageOptionsSchema,
	InMemoryAuthStorage
> = {
	configSchema: () => InMemoryAuthStorageOptionsSchema,
	defaultConfig: () => ({}),
	build: ({ keys }) => new InMemoryAuthStorage(keys),
};
