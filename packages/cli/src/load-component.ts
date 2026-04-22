import { isAbsolute, resolve } from "node:path";
import type { ComponentTemplate } from "@otter-agent/core";
import { ComponentConfigValidationError, validateComponentConfig } from "@otter-agent/core";
import type { TSchema } from "@sinclair/typebox";
import type { ComponentReference } from "./config.js";

/**
 * Error thrown when a component template cannot be loaded.
 */
export class ComponentLoadError extends Error {
	constructor(
		public readonly templatePath: string,
		message: string,
	) {
		super(`Failed to load component template "${templatePath}": ${message}`);
		this.name = "ComponentLoadError";
	}
}

/**
 * Error thrown when a component config file cannot be parsed or is invalid.
 * Kept for backwards compatibility with existing error handling patterns.
 */
export class ComponentConfigFileError extends Error {
	constructor(
		public readonly filePath: string,
		message: string,
	) {
		super(`Component config file "${filePath}": ${message}`);
		this.name = "ComponentConfigFileError";
	}
}

/**
 * Resolve a template path for use with `import()`.
 *
 * Uses a path-prefix heuristic:
 * - Starts with `.` or `..` → relative file path, resolved against `configDir`
 * - Starts with `/` → absolute path, used as-is
 * - Anything else → package specifier, passed directly to `import()`
 *   (e.g. `@otter-agent/core/dist/...` resolves through node_modules)
 *
 * @param templatePath - The `filepath` value from the config.
 * @param configDir - Directory of the config file; used to resolve relative paths.
 * @returns The path or specifier to pass to `import()`.
 */
export function resolveTemplatePath(templatePath: string, configDir: string): string {
	if (templatePath.startsWith(".") || templatePath.startsWith("/")) {
		return isAbsolute(templatePath) ? templatePath : resolve(configDir, templatePath);
	}
	// Package specifier — return as-is for Node/Bun module resolution
	return templatePath;
}

/**
 * Load a {@link ComponentTemplate} from a TypeScript or JavaScript module.
 *
 * The module must have a default export that is a `ComponentTemplate`.
 *
 * @param templatePath - Path or package specifier for the template module.
 * @param configDir - Directory of the config file; used to resolve relative paths.
 * @returns The loaded ComponentTemplate.
 * @throws {ComponentLoadError} If the module cannot be imported, has no
 *   default export, or the default export is not a ComponentTemplate.
 */
export async function loadComponentTemplate<TInstance>(
	templatePath: string,
	configDir: string,
): Promise<ComponentTemplate<TSchema, TInstance>> {
	const resolved = resolveTemplatePath(templatePath, configDir);

	let mod: Record<string, unknown>;
	try {
		mod = await import(resolved);
	} catch (err) {
		throw new ComponentLoadError(
			resolved,
			`Import failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (mod.default === undefined) {
		throw new ComponentLoadError(
			resolved,
			"Module has no default export. Component templates must use `export default`.",
		);
	}

	const template = mod.default as ComponentTemplate<TSchema, TInstance>;

	if (
		typeof template.configSchema !== "function" ||
		typeof template.defaultConfig !== "function" ||
		typeof template.build !== "function"
	) {
		throw new ComponentLoadError(
			resolved,
			"Default export does not implement the ComponentTemplate interface. Expected configSchema(), defaultConfig(), and build() methods.",
		);
	}

	return template;
}

/**
 * Resolve a ComponentReference to a built instance.
 *
 * For `{ name, config }` — delegates to the registry builder.
 * For `{ filepath, config }` — loads the template module, validates config, builds.
 *
 * @param ref - The component reference from the config file.
 * @param configDir - Directory of the config file; used to resolve relative paths.
 * @param registryBuilder - A function that builds a component by registry name.
 * @returns The built component instance.
 * @throws {ComponentLoadError} If the component cannot be loaded or built.
 * @throws {ComponentConfigValidationError} If config validation fails.
 */
export async function resolveComponentFromReference<T>(
	ref: ComponentReference,
	configDir: string,
	registryBuilder: (options: { name: string; config: unknown }) => T,
): Promise<T> {
	if ("name" in ref) {
		return registryBuilder({ name: ref.name, config: ref.config ?? {} });
	}

	const template = await loadComponentTemplate<T>(ref.filepath, configDir);
	return validateComponentConfig(template, ref.config ?? {});
}

export { ComponentConfigValidationError };
