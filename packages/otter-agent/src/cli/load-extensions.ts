import type { Extension } from "../index.js";
import { ComponentConfigValidationError, loadComponent } from "./load-component.js";

/**
 * Load extensions from an array of config file paths.
 *
 * For each config file, delegates to {@link loadComponent} to parse the
 * config, load the template, validate, and build the Extension.
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
			const extension = await loadComponent<Extension>(configPath);
			extensions.push(extension);
		} catch (err) {
			const label = `Extension "${configPath}"`;

			if (err instanceof ComponentConfigValidationError) {
				console.warn(`Warning: ${label} — config validation failed:\n${err.errors.join("\n")}`);
			} else {
				console.warn(`Warning: ${label} — ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	return extensions;
}
