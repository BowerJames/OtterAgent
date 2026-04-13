import type { Static, TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { ComponentTemplate } from "../interfaces/component-template.js";

/**
 * Error thrown when component config validation fails.
 */
export class ComponentConfigValidationError extends Error {
	constructor(
		public readonly template: ComponentTemplate,
		public readonly errors: string[],
	) {
		super(`Component config validation failed:\n${errors.join("\n")}`);
		this.name = "ComponentConfigValidationError";
	}
}

/**
 * Validate raw config against a template's schema, merge with defaults,
 * and build the component instance.
 *
 * Workflow:
 * 1. Start with `template.defaultConfig()`
 * 2. Deep-merge user-provided `rawConfig` on top
 * 3. Validate the merged result against `template.configSchema()`
 * 4. Call `template.build()` with the validated config
 *
 * @param template - The component template.
 * @param rawConfig - User-provided config values. Deep-merged with defaults.
 * @returns A built component instance.
 * @throws {ComponentConfigValidationError} If validation fails.
 */
export function validateComponentConfig<TConfig extends TSchema, TInstance>(
	template: ComponentTemplate<TConfig, TInstance>,
	rawConfig: Partial<Static<TConfig>> = {},
): TInstance {
	const merged = mergeAndValidate(template, rawConfig);
	return template.build(merged);
}

/**
 * Validate raw config against a template's schema and return the
 * validated config without building the component.
 *
 * Useful when the caller wants to inspect validated config before
 * passing it to `build()` manually.
 *
 * @param template - The component template.
 * @param rawConfig - User-provided config values. Deep-merged with defaults.
 * @returns The validated config matching the schema.
 * @throws {ComponentConfigValidationError} If validation fails.
 */
export function validateComponentConfigOnly<TConfig extends TSchema, TInstance>(
	template: ComponentTemplate<TConfig, TInstance>,
	rawConfig: Partial<Static<TConfig>> = {},
): Static<TConfig> {
	return mergeAndValidate(template, rawConfig);
}

function mergeAndValidate<TConfig extends TSchema, TInstance>(
	template: ComponentTemplate<TConfig, TInstance>,
	rawConfig: Partial<Static<TConfig>>,
): Static<TConfig> {
	const defaults = template.defaultConfig();
	const schema = template.configSchema();

	// Deep merge: defaults as base, rawConfig overrides
	const merged = deepMerge(defaults, rawConfig) as Static<TConfig>;

	// Validate against schema
	const compiler = TypeCompiler.Compile(schema);
	const errors = [...compiler.Errors(merged)].map((e) => `${e.path}: ${e.message}`);

	if (errors.length > 0) {
		throw new ComponentConfigValidationError(template, errors);
	}

	return merged;
}

function deepMerge(target: unknown, source: unknown): unknown {
	if (typeof source !== "object" || source === null || Array.isArray(source)) {
		return source;
	}
	if (typeof target !== "object" || target === null || Array.isArray(target)) {
		return source;
	}
	const result = { ...target };
	for (const key of Object.keys(source as Record<string, unknown>)) {
		const sourceVal = (source as Record<string, unknown>)[key];
		const targetVal = (target as Record<string, unknown>)[key];
		if (
			typeof sourceVal === "object" &&
			sourceVal !== null &&
			!Array.isArray(sourceVal) &&
			typeof targetVal === "object" &&
			targetVal !== null &&
			!Array.isArray(targetVal)
		) {
			(result as Record<string, unknown>)[key] = deepMerge(targetVal, sourceVal);
		} else {
			(result as Record<string, unknown>)[key] = sourceVal;
		}
	}
	return result;
}
