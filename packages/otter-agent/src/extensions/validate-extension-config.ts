import type { Static, TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { ExtensionTemplate } from "../interfaces/extension-template.js";
import type { Extension } from "./extension.js";

/**
 * Error thrown when extension config validation fails.
 */
export class ExtensionConfigValidationError extends Error {
	constructor(
		public readonly template: ExtensionTemplate,
		public readonly errors: string[],
	) {
		super(`Extension config validation failed:\n${errors.join("\n")}`);
		this.name = "ExtensionConfigValidationError";
	}
}

/**
 * Validate raw config against a template's schema, merge with defaults,
 * and build the extension.
 *
 * Workflow:
 * 1. Start with `template.defaultConfig()`
 * 2. Deep-merge user-provided `rawConfig` on top
 * 3. Validate the merged result against `template.configSchema()`
 * 4. Call `template.buildExtension()` with the validated config
 *
 * @param template - The extension template.
 * @param rawConfig - User-provided config values. Deep-merged with defaults.
 * @returns A built Extension ready for use with AgentSession.
 * @throws {ExtensionConfigValidationError} If validation fails.
 */
export function validateExtensionConfig<TConfig extends TSchema>(
	template: ExtensionTemplate<TConfig>,
	rawConfig: Partial<Static<TConfig>> = {},
): Extension {
	const defaults = template.defaultConfig();
	const schema = template.configSchema();

	// Deep merge: defaults as base, rawConfig overrides
	const merged = deepMerge(defaults, rawConfig) as Static<TConfig>;

	// Validate against schema
	const compiler = TypeCompiler.Compile(schema);
	const errors = [...compiler.Errors(merged)].map((e) => `${e.path}: ${e.message}`);

	if (errors.length > 0) {
		throw new ExtensionConfigValidationError(template, errors);
	}

	return template.buildExtension(merged);
}

/**
 * Validate raw config against a template's schema and return the
 * validated config without building the extension.
 *
 * Useful when the caller wants to inspect validated config before
 * passing it to `buildExtension()` manually.
 *
 * @param template - The extension template.
 * @param rawConfig - User-provided config values. Deep-merged with defaults.
 * @returns The validated config matching the schema.
 * @throws {ExtensionConfigValidationError} If validation fails.
 */
export function validateExtensionConfigOnly<TConfig extends TSchema>(
	template: ExtensionTemplate<TConfig>,
	rawConfig: Partial<Static<TConfig>> = {},
): Static<TConfig> {
	const defaults = template.defaultConfig();
	const schema = template.configSchema();

	const merged = deepMerge(defaults, rawConfig) as Static<TConfig>;

	const compiler = TypeCompiler.Compile(schema);
	const errors = [...compiler.Errors(merged)].map((e) => `${e.path}: ${e.message}`);

	if (errors.length > 0) {
		throw new ExtensionConfigValidationError(template, errors);
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
