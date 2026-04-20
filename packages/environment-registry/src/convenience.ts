import type { AgentEnvironment } from "@otter-agent/core";
import { defaultRegistry } from "./default-registry.js";

/**
 * Build an environment from the default registry.
 *
 * @param name - The registered template name (e.g. "just-bash").
 * @param config - Optional user-provided config. Deep-merged with the
 *   template's defaults before validation.
 * @returns A built AgentEnvironment ready for use with AgentSession.
 * @throws {EnvironmentRegistryError} If no template is registered under the given name.
 * @throws {ComponentConfigValidationError} If config validation fails.
 *
 * @example
 * ```ts
 * import { buildEnvironment } from "@otter-agent/environment-registry";
 *
 * const environment = buildEnvironment("just-bash", {
 *   cwd: "/workspace",
 * });
 * ```
 */
export function buildEnvironment(name: string, config?: Record<string, unknown>): AgentEnvironment {
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
