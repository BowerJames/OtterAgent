/**
 * @otter-agent/extension-registry
 *
 * A dynamic registry of named extension templates with a default
 * pre-populated singleton and convenience functions.
 */

// Registry
export { ExtensionRegistry, ExtensionRegistryError } from "./registry.js";

// Default registry (pre-populated singleton)
export { defaultRegistry } from "./default-registry.js";

// Convenience functions (delegate to the default registry)
export { buildExtension, getRegisteredNames, isRegistered } from "./convenience.js";

// Built-in templates (also importable individually)
export {
	ContextInjectorTemplate,
	ContextInjectorConfigSchema,
} from "./built-ins/index.js";
export type { ContextInjectorConfig } from "./built-ins/index.js";

// Re-export core types consumers need
export type { Extension, ComponentTemplate } from "@otter-agent/core";
export {
	ComponentConfigValidationError,
	validateComponentConfig,
	validateComponentConfigOnly,
} from "@otter-agent/core";
