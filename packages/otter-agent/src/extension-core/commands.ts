/**
 * Command registration types for the ExtensionsAPI.
 */
import type { ExtensionCommandContext } from "./context.js";

/** Options for registering a slash command. */
export interface CommandOptions {
	/** Human-readable description of the command. */
	description?: string;

	/** Handler invoked when the command is executed. */
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

/** Information about a registered command. */
export interface CommandInfo {
	/** Command name (without the leading slash). */
	name: string;

	/** Human-readable description, if provided. */
	description?: string;
}
