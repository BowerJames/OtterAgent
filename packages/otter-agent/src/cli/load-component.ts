import { readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { TSchema } from "@sinclair/typebox";
import { parse as parseYaml } from "yaml";
import type { ComponentTemplate } from "../index.js";
import { ComponentConfigValidationError, validateComponentConfig } from "../index.js";

/**
 * Parsed component config entry.
 */
export interface ComponentConfigEntry {
	/** Path to the module exporting a ComponentTemplate as its default export. */
	path: string;
	/** User-provided config to validate and pass to the template builder. */
	config: Record<string, unknown>;
}

/**
 * Error thrown when a component config file cannot be parsed or is invalid.
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
 * Parse a component config file (JSON or YAML).
 *
 * The file must contain a JSON object or YAML mapping with at least a
 * `path` property (string) pointing to the component template module.
 * An optional `config` property provides configuration to validate
 * against the template's schema.
 *
 * This function is also used internally by {@link load-extensions.ts} for
 * extension config parsing.
 *
 * @param filePath - Absolute or relative path to the config file.
 * @returns The parsed config entry.
 * @throws {ComponentConfigFileError} If the file cannot be read, parsed,
 *   or is missing the required `path` property.
 */
export function parseComponentConfigFile(filePath: string): ComponentConfigEntry {
	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch (err) {
		throw new ComponentConfigFileError(filePath, err instanceof Error ? err.message : String(err));
	}

	const ext = extname(filePath).toLowerCase();
	let parsed: unknown;

	if (ext === ".json") {
		try {
			parsed = JSON.parse(content);
		} catch (err) {
			throw new ComponentConfigFileError(
				filePath,
				`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else if (ext === ".yaml" || ext === ".yml") {
		try {
			parsed = parseYaml(content);
		} catch (err) {
			throw new ComponentConfigFileError(
				filePath,
				`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else {
		throw new ComponentConfigFileError(
			filePath,
			`Unsupported file extension "${ext}". Expected .json, .yaml, or .yml.`,
		);
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new ComponentConfigFileError(
			filePath,
			"Config file must contain a JSON object or YAML mapping.",
		);
	}

	const record = parsed as Record<string, unknown>;

	if (typeof record.path !== "string" || record.path.length === 0) {
		throw new ComponentConfigFileError(
			filePath,
			'Missing or invalid "path" property. It must be a non-empty string pointing to a template module.',
		);
	}

	return {
		path: record.path,
		config:
			typeof record.config === "object" && record.config !== null && !Array.isArray(record.config)
				? (record.config as Record<string, unknown>)
				: {},
	};
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
 * @param templatePath - The `path` value from the config file.
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
 * Load and build a component from a config file path.
 *
 * This is the full pipeline: parse config file → load template → validate
 * config → build instance. Any error at any stage throws (fatal).
 *
 * @param configPath - Path to the JSON or YAML config file.
 * @returns The built component instance.
 * @throws {ComponentConfigFileError} If the config file is invalid.
 * @throws {ComponentLoadError} If the template module cannot be loaded.
 * @throws {ComponentConfigValidationError} If config validation fails.
 */
export async function loadComponent<TInstance>(configPath: string): Promise<TInstance> {
	const entry = parseComponentConfigFile(configPath);
	const configDir = dirname(configPath);
	const template = await loadComponentTemplate<TInstance>(entry.path, configDir);
	return validateComponentConfig(template, entry.config);
}

export { ComponentConfigValidationError };
