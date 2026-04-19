/**
 * @otter-agent/environment-registry
 *
 * A dynamic registry of named environment templates with a default
 * pre-populated singleton and convenience functions.
 */

// Registry
export { EnvironmentRegistry, EnvironmentRegistryError } from "./registry.js";

// Default registry (pre-populated singleton)
export { defaultRegistry } from "./default-registry.js";

// Convenience functions (delegate to the default registry)
export { buildEnvironment, getRegisteredNames, isRegistered } from "./convenience.js";

// Built-in templates (also importable individually)
export { JustBashTemplate } from "./built-ins/index.js";

// Re-export core types consumers need
export type { AgentEnvironment, ComponentTemplate } from "@otter-agent/core";
export {
	ComponentConfigValidationError,
	validateComponentConfig,
	validateComponentConfigOnly,
} from "@otter-agent/core";
