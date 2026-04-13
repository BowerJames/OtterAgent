import { dirname } from "node:path";
import type { ExtensionTemplate } from "@otter-agent/core";
import { ExtensionConfigValidationError, validateExtensionConfig } from "@otter-agent/core";
import type { Extension } from "@otter-agent/core";
import {
	type ComponentConfigEntry,
	ComponentConfigFileError,
	ComponentLoadError,
	parseComponentConfigFile,
	resolveTemplatePath,
} from "./load-component.js";

/**
 * Parsed extension config entry. Re-exported for backward compatibility.
 * @deprecated Use {@link ComponentConfigEntry} from `./load-component.js`.
 */
export type ExtensionConfigEntry = ComponentConfigEntry;

/**
 * Error thrown when an extension config file cannot be parsed or is invalid.
 * Thin wrapper around {@link ComponentConfigFileError} for backward compatibility.
 */
export class ExtensionConfigFileError extends ComponentConfigFileError {
	constructor(filePath: string, message: string) {
		super(filePath, message);
		this.name = "ExtensionConfigFileError";
	}
}

/**
 * Error thrown when an extension template cannot be loaded.
 * Thin wrapper around {@link ComponentLoadError} for backward compatibility.
 */
export class ExtensionLoadError extends ComponentLoadError {
	constructor(templatePath: string, message: string) {
		super(templatePath, message);
		this.name = "ExtensionLoadError";
	}
}

/**
 * Parse an extension config file (JSON or YAML).
 *
 * Delegates to {@link parseComponentConfigFile} and re-throws any
 * {@link ComponentConfigFileError} as an {@link ExtensionConfigFileError}.
 *
 * @param filePath - Absolute or relative path to the config file.
 * @returns The parsed config entry.
 * @throws {ExtensionConfigFileError} If the file cannot be read, parsed,
 *   or is missing the required `path` property.
 */
export function parseExtensionConfigFile(filePath: string): ExtensionConfigEntry {
	try {
		return parseComponentConfigFile(filePath);
	} catch (err) {
		if (err instanceof ComponentConfigFileError) {
			// Re-throw as ExtensionConfigFileError to preserve the error name/class
			const msg = err.message.replace(/^Component config file "[^"]+": /, "");
			throw new ExtensionConfigFileError(err.filePath, msg);
		}
		throw err;
	}
}

/**
 * Load an ExtensionTemplate from a TypeScript or JavaScript file.
 *
 * Delegates to the shared path resolution and import logic, then validates
 * the extension-specific interface shape (configSchema, defaultConfig, buildExtension).
 *
 * @param templatePath - Path to the extension template file (.ts or .js).
 * @param configDir - Directory to resolve relative paths against.
 * @returns The loaded ExtensionTemplate.
 * @throws {ExtensionLoadError} If the module cannot be imported, has no
 *   default export, or does not implement ExtensionTemplate.
 */
export async function loadExtensionTemplate(
	templatePath: string,
	configDir: string,
): Promise<ExtensionTemplate> {
	const resolved = resolveTemplatePath(templatePath, configDir);

	let mod: Record<string, unknown>;
	try {
		mod = await import(resolved);
	} catch (err) {
		throw new ExtensionLoadError(
			resolved,
			`Import failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (mod.default === undefined) {
		throw new ExtensionLoadError(
			resolved,
			"Module has no default export. Extension templates must use `export default`.",
		);
	}

	const template = mod.default as ExtensionTemplate;

	if (
		typeof template.configSchema !== "function" ||
		typeof template.defaultConfig !== "function" ||
		typeof template.buildExtension !== "function"
	) {
		throw new ExtensionLoadError(
			resolved,
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
 * Errors are **non-fatal**: a warning is logged to stderr and the extension
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

export { ExtensionConfigValidationError };
