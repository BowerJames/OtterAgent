import type { Extension } from "@otter-agent/core";
import { buildExtension } from "@otter-agent/extension-registry";
import type { ComponentReference } from "./config.js";
import { ComponentConfigValidationError, ComponentLoadError } from "./load-component.js";
import { resolveComponentFromReference } from "./load-component.js";

/**
 * Load extensions from an array of ComponentReferences.
 *
 * Each reference is resolved via the extension registry (name) or loaded
 * from a TypeScript module (filepath).
 *
 * Errors are **non-fatal**: a warning is logged to stderr and the extension
 * is skipped. Successfully loaded extensions are returned.
 *
 * @param references - Array of ComponentReferences from the config file.
 * @param configDir - Directory of the config file; used to resolve relative paths.
 * @returns Array of successfully built Extension functions.
 */
export async function loadExtensionsFromReferences(
	references: ComponentReference[],
	configDir: string,
): Promise<Extension[]> {
	const extensions: Extension[] = [];

	for (let i = 0; i < references.length; i++) {
		const ref = references[i];
		const label = "name" in ref ? `extension "${ref.name}"` : `extension "${ref.filepath}"`;
		try {
			const extension = await resolveComponentFromReference<Extension>(ref, configDir, (options) =>
				buildExtension(options),
			);
			extensions.push(extension);
		} catch (err) {
			if (err instanceof ComponentConfigValidationError) {
				console.warn(
					`Warning: ${label} (extensions[${i}]) — config validation failed:\n${err.errors.join("\n")}`,
				);
			} else if (err instanceof ComponentLoadError) {
				console.warn(`Warning: ${label} (extensions[${i}]) — ${err.message}`);
			} else {
				console.warn(
					`Warning: ${label} (extensions[${i}]) — ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	return extensions;
}
