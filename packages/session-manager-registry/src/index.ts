// Re-export SessionManager type from core.
export type { SessionManager } from "@otter-agent/core";

// Public exports for the in-memory session manager.
export {
	InMemorySessionManager,
	InMemorySessionManagerOptionsSchema,
	InMemorySessionManagerTemplate,
	createInMemorySessionManager,
} from "./session-managers/in-memory/index.js";

/**
 * Options for {@link buildSessionManager}.
 */
export interface BuildSessionManagerOptions {
	/** The registered session manager name (e.g. "in-memory"). */
	name: string;
	/**
	 * Configuration to merge with the session manager template's defaults.
	 * Pass null or undefined to use defaults as-is.
	 */
	config: unknown;
}

// Eagerly populate the registry with built-in session managers.
import "./registry/register-session-managers.js";

export { buildSessionManager } from "./registry/registry.js";
