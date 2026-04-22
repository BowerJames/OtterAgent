// Re-export AgentEnvironment type from core.
export type { AgentEnvironment } from "@otter-agent/core";

// Public exports for the just-bash environment.
export type {
	JustBashAgentEnvironmentOptions,
	JustBashToolName,
} from "./environments/just-bash/index.js";
export {
	JustBashAgentEnvironment,
	JustBashAgentEnvironmentTemplate,
} from "./environments/just-bash/index.js";

/**
 * Options for {@link buildAgentEnvironment}.
 */
export interface BuildAgentEnvironmentOptions {
	/** The registered environment name (e.g. "no-op", "just-bash"). */
	name: string;
	/**
	 * Configuration to merge with the environment template's defaults.
	 * Pass null or undefined to use defaults as-is.
	 */
	config: unknown;
}

// Eagerly populate the registry with built-in environments.
import "./registry/register-environments.js";

export { buildAgentEnvironment } from "./registry/registry.js";
