import type { Static, TSchema } from "@sinclair/typebox";
import type { AgentEnvironment } from "./agent-environment.js";
import type { AuthStorage } from "./auth-storage.js";
import type { SessionManager } from "./session-manager.js";

/**
 * A configurable factory for building pluggable components.
 *
 * Serves all three core pluggable component types: {@link SessionManager},
 * {@link AuthStorage}, and {@link AgentEnvironment}. Callers validate
 * user-provided config against the schema, merge with defaults, and call
 * {@link build} to produce a concrete instance.
 *
 * @typeParam TConfig - The TypeBox schema describing the config shape.
 * @typeParam TInstance - The type of instance produced by {@link build}.
 */
export interface ComponentTemplate<TConfig extends TSchema = TSchema, TInstance = unknown> {
	/**
	 * Return the TypeBox schema for this template's configuration.
	 *
	 * Used by callers (and by {@link validateComponentConfig}) to validate
	 * user-provided config before passing it to {@link build}.
	 */
	configSchema(): TConfig;

	/**
	 * Return the default configuration values.
	 *
	 * Callers should merge user-provided config on top of these defaults
	 * before calling {@link build}. Templates where every field is required
	 * should still implement this (returning `{}` cast to the appropriate
	 * type) so callers can use a uniform pattern.
	 */
	defaultConfig(): Static<TConfig>;

	/**
	 * Build the component instance from a validated config.
	 *
	 * The config is consumed at build time — implementations that need
	 * runtime access should capture it in a closure or store it on the
	 * constructed instance.
	 */
	build(config: Static<TConfig>): TInstance;
}

/**
 * Convenience alias: a {@link ComponentTemplate} that produces a {@link SessionManager}.
 */
export type SessionManagerTemplate<TConfig extends TSchema = TSchema> = ComponentTemplate<
	TConfig,
	SessionManager
>;

/**
 * Convenience alias: a {@link ComponentTemplate} that produces an {@link AuthStorage}.
 */
export type AuthStorageTemplate<TConfig extends TSchema = TSchema> = ComponentTemplate<
	TConfig,
	AuthStorage
>;

/**
 * Convenience alias: a {@link ComponentTemplate} that produces an {@link AgentEnvironment}.
 */
export type AgentEnvironmentTemplate<TConfig extends TSchema = TSchema> = ComponentTemplate<
	TConfig,
	AgentEnvironment
>;
