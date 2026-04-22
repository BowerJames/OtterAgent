// Re-export Extension type from core.
export type { Extension } from "@otter-agent/core";

/**
 * Options for {@link buildExtension}.
 */
export interface BuildExtensionOptions {
	/** The registered extension name (e.g. "no-op"). */
	name: string;
	/**
	 * Configuration to merge with the extension template's defaults.
	 * Pass null or undefined to use defaults as-is.
	 */
	config: unknown;
}

// Eagerly populate the registry with built-in extensions.
import "./registry/register-extensions.js";

export { buildExtension } from "./registry/registry.js";
