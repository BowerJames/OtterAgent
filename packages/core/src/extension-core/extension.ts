import type { ExtensionsAPI } from "./extensions-api.js";

/**
 * Extension factory function.
 *
 * An extension is a function that receives the ExtensionsAPI and uses it
 * to register tools, commands, event handlers, etc. Supports both
 * synchronous and asynchronous initialisation.
 */
export type Extension = (api: ExtensionsAPI) => void | Promise<void>;
