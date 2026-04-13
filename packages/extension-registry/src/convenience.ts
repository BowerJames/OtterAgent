import type { Extension } from "@otter-agent/core";
/**
 * Convenience functions that delegate to the default registry.
 *
 * These provide the simplest API for consumers who don't need
 * a custom registry instance.
 */
import { defaultRegistry } from "./default-registry.js";

/**
 * Build an extension from the default registry.
 *
 * @param name - The registered template name (e.g. "context-injector").
 * @param config - Optional user-provided config. Deep-merged with the
 *   template's defaults before validation.
 * @returns A built Extension ready for use with AgentSession.
 * @throws {ExtensionRegistryError} If no template is registered under the given name.
 * @throws {ComponentConfigValidationError} If config validation fails.
 *
 * @example
 * ```ts
 * import { buildExtension } from "@otter-agent/extension-registry";
 *
 * const extension = buildExtension("context-injector", {
 *   content: "Always respond in French.",
 * });
 * ```
 */
export function buildExtension(name: string, config?: Record<string, unknown>): Extension {
	return defaultRegistry.build(name, config);
}

/**
 * Check if a name is registered in the default registry.
 *
 * @param name - The template name to check.
 * @returns `true` if registered.
 */
export function isRegistered(name: string): boolean {
	return defaultRegistry.has(name);
}

/**
 * List all registered names in the default registry.
 *
 * @returns Array of registered names in insertion order.
 */
export function getRegisteredNames(): string[] {
	return defaultRegistry.getRegisteredNames();
}
