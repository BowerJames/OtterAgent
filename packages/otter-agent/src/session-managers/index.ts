import type { SessionManager as ISessionManager } from "../interfaces/session-manager.js";
import { createInMemorySessionManager } from "./in-memory-session-manager.js";

export { createInMemorySessionManager } from "./in-memory-session-manager.js";

/**
 * Namespace providing factory methods for built-in {@link ISessionManager}
 * implementations. The empty interface extension below enables TypeScript
 * declaration merging so `SessionManager` is both a type (the full interface)
 * and a value (the namespace with factory methods) in a single export.
 *
 * @example
 * ```typescript
 * import { SessionManager } from "@otter-agent/core";
 * const sm: SessionManager = SessionManager.inMemory();
 * ```
 */
// Empty interface extension enables declaration merging with the namespace below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionManager extends ISessionManager {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SessionManager {
	/**
	 * Creates an in-memory {@link ISessionManager} with no filesystem
	 * persistence. Useful for testing, embedded usage, and consumers who
	 * manage their own persistence.
	 */
	export function inMemory(): ISessionManager {
		return createInMemorySessionManager();
	}
}
