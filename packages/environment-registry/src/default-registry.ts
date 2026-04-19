import { JustBashTemplate } from "./built-ins/index.js";
import { EnvironmentRegistry } from "./registry.js";

/**
 * The default environment registry, pre-populated with all built-in templates.
 *
 * @example
 * ```ts
 * import { defaultRegistry } from "@otter-agent/environment-registry";
 *
 * const environment = defaultRegistry.build("just-bash", {
 *   cwd: "/workspace",
 * });
 * ```
 */
export const defaultRegistry = new EnvironmentRegistry();

// Register all built-in templates
defaultRegistry.register("just-bash", JustBashTemplate);
