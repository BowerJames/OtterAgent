// Re-export AuthStorage type from core.
export type { AuthStorage } from "@otter-agent/core";

// Public exports for the in-memory auth storage.
export {
	InMemoryAuthStorage,
	InMemoryAuthStorageOptionsSchema,
	InMemoryAuthStorageTemplate,
} from "./auth-storages/in-memory/index.js";

/**
 * Options for {@link buildAuthStorage}.
 */
export interface BuildAuthStorageOptions {
	/** The registered auth storage name (e.g. "in-memory"). */
	name: string;
	/**
	 * Configuration to merge with the auth storage template's defaults.
	 * Pass null or undefined to use defaults as-is.
	 */
	config: unknown;
}

// Eagerly populate the registry with built-in auth storages.
import "./registry/register-auth-storages.js";

export { buildAuthStorage } from "./registry/registry.js";
