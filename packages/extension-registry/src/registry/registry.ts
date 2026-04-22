import type { ComponentTemplate, Extension } from "@otter-agent/core";
import { validateComponentConfig } from "@otter-agent/core";
import type { TSchema } from "@sinclair/typebox";
import type { BuildExtensionOptions } from "../index.js";

/**
 * Internal registry mapping extension names to their templates.
 */
const registry = new Map<string, ComponentTemplate<TSchema, Extension>>();

/**
 * Register an extension template under the given name.
 *
 * Internal-only — not exported from the package.
 */
export function registerExtension(
	name: string,
	template: ComponentTemplate<TSchema, Extension>,
): void {
	registry.set(name, template);
}

/**
 * Build an {@link Extension} by name.
 *
 * Workflow:
 * 1. Look up the registered template by name. Throws if not found.
 * 2. Merge the provided config with the template's defaults.
 *    If config is null or undefined, uses defaults as-is.
 * 3. Validate the merged config against the template's TypeBox schema.
 * 4. Build and return the Extension function.
 *
 * @param options - The extension name and optional config.
 * @returns A built Extension function.
 * @throws {Error} If no template is registered under the given name.
 * @throws {import("@otter-agent/core").ComponentConfigValidationError} If config validation fails.
 */
export function buildExtension(options: BuildExtensionOptions): Extension {
	const template = registry.get(options.name);

	if (!template) {
		const registered = [...registry.keys()].join(", ");
		throw new Error(`Unknown extension "${options.name}". Registered extensions: ${registered}`);
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
