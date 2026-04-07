import { readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { ExtensionTemplate } from "@otter-agent/core";
import { ExtensionConfigValidationError, validateExtensionConfig } from "@otter-agent/core";
import type { Extension } from "@otter-agent/core";
import { parse as parseYaml } from "yaml";

/**
 * Parsed extension config entry.
 */
export interface ExtensionConfigEntry {
	/** Path to the TypeScript or JavaScript file exporting an ExtensionTemplate. */
	path: string;
	/** User-provided config to validate and pass to the template builder. */
	config: Record<string, unknown>;
}

/**
 * Error thrown when an extension config file cannot be parsed or is invalid.
 */
export class ExtensionConfigFileError extends Error {
	constructor(
		public readonly filePath: string,
		message: string,
	) {
		super(`Extension config file "${filePath}": ${message}`);
		this.name = "ExtensionConfigFileError";
	}
}

/**
 * Error thrown when an extension template cannot be loaded.
 */
export class ExtensionLoadError extends Error {
	constructor(
		public readonly templatePath: string,
		message: string,
	) {
		super(`Failed to load extension template "${templatePath}": ${message}`);
		this.name = "ExtensionLoadError";
	}
}

/**
 * Parse an extension config file (JSON or YAML).
 *
 * The file must contain a JSON object or YAML mapping with at least a
 * `path` property (string) pointing to the extension template file.
 * An optional `config` property provides configuration to validate
 * against the template's schema.
 *
 * @param filePath - Absolute or relative path to the config file.
 * @returns The parsed config entry.
 * @throws {ExtensionConfigFileError} If the file cannot be read, parsed,
 *   or is missing the required `path` property.
 */
export function parseExtensionConfigFile(filePath: string): ExtensionConfigEntry {
	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch (err) {
		throw new ExtensionConfigFileError(filePath, err instanceof Error ? err.message : String(err));
	}

	const ext = extname(filePath).toLowerCase();
	let parsed: unknown;

	if (ext === ".json") {
		try {
			parsed = JSON.parse(content);
		} catch (err) {
			throw new ExtensionConfigFileError(
				filePath,
				`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else if (ext === ".yaml" || ext === ".yml") {
		try {
			parsed = parseYaml(content);
		} catch (err) {
			throw new ExtensionConfigFileError(
				filePath,
				`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else {
		throw new ExtensionConfigFileError(
			filePath,
			`Unsupported file extension "${ext}". Expected .json, .yaml, or .yml.`,
		);
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new ExtensionConfigFileError(
			filePath,
			"Config file must contain a JSON object or YAML mapping.",
		);
	}

	const record = parsed as Record<string, unknown>;

	if (typeof record.path !== "string" || record.path.length === 0) {
		throw new ExtensionConfigFileError(
			filePath,
			'Missing or invalid "path" property. It must be a non-empty string pointing to an extension template file.',
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
 * Load an ExtensionTemplate from a TypeScript or JavaScript file.
 *
 * The templatePath is resolved relative to configDir if it is not absolute.
 * The module must have a default export that is an ExtensionTemplate.
 *
 * @param templatePath - Path to the extension template file (.ts or .js).
 * @param configDir - Directory to resolve relative paths against (typically
 *   the directory containing the config file).
 * @returns The loaded ExtensionTemplate.
 * @throws {ExtensionLoadError} If the module cannot be imported or has no
 *   default export, or if the default export is not an ExtensionTemplate.
 */
export async function loadExtensionTemplate(
	templatePath: string,
	configDir: string,
): Promise<ExtensionTemplate> {
	const resolvedPath = isAbsolute(templatePath) ? templatePath : resolve(configDir, templatePath);

	let mod: Record<string, unknown>;
	try {
		mod = await import(resolvedPath);
	} catch (err) {
		throw new ExtensionLoadError(
			resolvedPath,
			`Import failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (mod.default === undefined) {
		throw new ExtensionLoadError(
			resolvedPath,
			"Module has no default export. Extension templates must use `export default`.",
		);
	}

	const template = mod.default as ExtensionTemplate;

	// Basic shape check: ExtensionTemplate must have configSchema, defaultConfig, buildExtension
	if (
		typeof template.configSchema !== "function" ||
		typeof template.defaultConfig !== "function" ||
		typeof template.buildExtension !== "function"
	) {
		throw new ExtensionLoadError(
			resolvedPath,
			"Default export does not implement the ExtensionTemplate interface. Expected configSchema(), defaultConfig(), and buildExtension() methods.",
		);
	}

	return template;
}

/**
 * Load extensions from an array of config file paths.
 *
 * For each config file:
 * 1. Parse the config file (JSON or YAML) to get the template path and config
 * 2. Load the ExtensionTemplate from the template file
 * 3. Validate the config against the template's schema and build the Extension
 *
 * Errors are non-fatal: a warning is logged to stderr and the extension
 * is skipped. Successfully loaded extensions are returned.
 *
 * @param configPaths - Array of paths to extension config files.
 * @returns Array of successfully built Extension functions.
 */
export async function loadExtensionsFromConfigFiles(configPaths: string[]): Promise<Extension[]> {
	const extensions: Extension[] = [];

	for (const configPath of configPaths) {
		try {
			const configEntry = parseExtensionConfigFile(configPath);
			const configDir = dirname(configPath);
			const template = await loadExtensionTemplate(configEntry.path, configDir);
			const extension = validateExtensionConfig(template, configEntry.config);
			extensions.push(extension);
		} catch (err) {
			const label =
				err instanceof ExtensionConfigFileError
					? `Config file "${configPath}"`
					: err instanceof ExtensionLoadError
						? `Extension "${configPath}"`
						: `Extension "${configPath}"`;

			if (err instanceof ExtensionConfigValidationError) {
				console.warn(`Warning: ${label} — config validation failed:\n${err.errors.join("\n")}`);
			} else {
				console.warn(`Warning: ${label} — ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	return extensions;
}
