import type { ComponentTemplate, SessionManager } from "@otter-agent/core";
import { validateComponentConfig } from "@otter-agent/core";
import type { TSchema } from "@sinclair/typebox";
import type { BuildSessionManagerOptions } from "../index.js";

/**
 * Internal registry mapping session manager names to their templates.
 */
const registry = new Map<string, ComponentTemplate<TSchema, SessionManager>>();

/**
 * Register a session manager template under the given name.
 *
 * Internal-only — not exported from the package.
 */
export function registerSessionManager(
	name: string,
	template: ComponentTemplate<TSchema, SessionManager>,
): void {
	registry.set(name, template);
}

/**
 * Build a {@link SessionManager} by name.
 *
 * Workflow:
 * 1. Look up the registered template by name. Throws if not found.
 * 2. Merge the provided config with the template's defaults.
 *    If config is null or undefined, uses defaults as-is.
 * 3. Validate the merged config against the template's TypeBox schema.
 * 4. Build and return the SessionManager instance.
 *
 * @param options - The session manager name and optional config.
 * @returns A built SessionManager instance.
 * @throws {Error} If no template is registered under the given name.
 * @throws {import("@otter-agent/core").ComponentConfigValidationError} If config validation fails.
 */
export function buildSessionManager(options: BuildSessionManagerOptions): SessionManager {
	const template = registry.get(options.name);

	if (!template) {
		const registered = [...registry.keys()].join(", ");
		throw new Error(
			`Unknown session manager "${options.name}". Registered session managers: ${registered}`,
		);
	}

	const rawConfig =
		options.config !== null &&
		options.config !== undefined &&
		typeof options.config === "object" &&
		!Array.isArray(options.config)
			? (options.config as Record<string, unknown>)
			: {};

	return validateComponentConfig(template, rawConfig);
}
