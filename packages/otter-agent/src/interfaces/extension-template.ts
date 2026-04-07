import type { Static, TSchema } from "@sinclair/typebox";
import type { Extension } from "../extensions/extension.js";

/**
 * A configurable factory for building extensions.
 *
 * Unlike {@link Extension} (a single factory function), a template defines
 * its own config schema and provides defaults. Callers validate user-provided
 * config against the schema, merge with defaults, and call {@link buildExtension}
 * to produce a concrete Extension for use with AgentSession.
 *
 * @typeParam TConfig - The TypeBox schema describing the config shape.
 *   When omitted, config defaults to `TSchema` with no type inference.
 */
export interface ExtensionTemplate<TConfig extends TSchema = TSchema> {
	/**
	 * Return the TypeBox schema for this template's configuration.
	 *
	 * Used by callers (and by {@link validateExtensionConfig}) to validate
	 * user-provided config before passing it to {@link buildExtension}.
	 */
	configSchema(): TConfig;

	/**
	 * Return the default configuration values.
	 *
	 * Callers should merge user-provided config on top of these defaults
	 * before calling {@link buildExtension}. Even templates where every
	 * field is required should implement this (returning `{}` cast to the
	 * appropriate type) so that callers can use a uniform pattern.
	 */
	defaultConfig(): Static<TConfig>;

	/**
	 * Build the extension function from a validated config.
	 *
	 * The returned Extension can be passed directly to AgentSession or
	 * createAgentSession. The config is consumed at build time — extensions
	 * that need runtime access should capture it in a closure.
	 */
	buildExtension(config: Static<TConfig>): Extension;
}
