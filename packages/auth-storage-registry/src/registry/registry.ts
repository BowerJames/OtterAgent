import type { AuthStorage, ComponentTemplate } from "@otter-agent/core";
import { validateComponentConfig } from "@otter-agent/core";
import type { TSchema } from "@sinclair/typebox";
import type { BuildAuthStorageOptions } from "../index.js";

/**
 * Internal registry mapping auth storage names to their templates.
 */
const registry = new Map<string, ComponentTemplate<TSchema, AuthStorage>>();

/**
 * Register an auth storage template under the given name.
 *
 * Internal-only — not exported from the package.
 */
export function registerAuthStorage(
	name: string,
	template: ComponentTemplate<TSchema, AuthStorage>,
): void {
	registry.set(name, template);
}

/**
 * Build an {@link AuthStorage} by name.
 *
 * Workflow:
 * 1. Look up the registered template by name. Throws if not found.
 * 2. Merge the provided config with the template's defaults.
 *    If config is null or undefined, uses defaults as-is.
 * 3. Validate the merged config against the template's TypeBox schema.
 * 4. Build and return the AuthStorage instance.
 *
 * @param options - The auth storage name and optional config.
 * @returns A built AuthStorage instance.
 * @throws {Error} If no template is registered under the given name.
 * @throws {import("@otter-agent/core").ComponentConfigValidationError} If config validation fails.
 */
export function buildAuthStorage(options: BuildAuthStorageOptions): AuthStorage {
	const template = registry.get(options.name);

	if (!template) {
		const registered = [...registry.keys()].join(", ");
		throw new Error(
			`Unknown auth storage "${options.name}". Registered auth storages: ${registered}`,
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
