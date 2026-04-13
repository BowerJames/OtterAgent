import { ContextInjectorTemplate } from "./built-ins/index.js";
/**
 * Default registry — pre-populated singleton with all built-in extension templates.
 *
 * Import {@link defaultRegistry} directly for advanced use, or use the
 * convenience functions from `convenience.ts` for the common case.
 */
import { ExtensionRegistry } from "./registry.js";

/**
 * The default extension registry, pre-populated with all built-in templates.
 *
 * @example
 * ```ts
 * import { defaultRegistry } from "@otter-agent/extension-registry";
 *
 * const extension = defaultRegistry.build("context-injector", {
 *   content: "Always respond in French.",
 * });
 * ```
 */
export const defaultRegistry = new ExtensionRegistry();

// Register all built-in templates
defaultRegistry.register("context-injector", ContextInjectorTemplate);
