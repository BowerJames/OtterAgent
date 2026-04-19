/**
 * EnvironmentRegistry — a dynamic registry of named environment templates.
 *
 * Provides methods to register, look up, and build environments by name.
 * A default pre-populated singleton is available via {@link defaultRegistry}.
 */
import { validateComponentConfig } from "@otter-agent/core";
import type { ComponentTemplate } from "@otter-agent/core";
import type { AgentEnvironment } from "@otter-agent/core";
import type { TSchema } from "@sinclair/typebox";

/**
 * Error thrown when attempting to register a template under a name
 * that is already in use.
 */
export class EnvironmentRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EnvironmentRegistryError";
	}
}

/**
 * A dynamic registry of named environment templates.
 *
 * Templates are registered with a unique string name and can be built
 * into concrete AgentEnvironment instances with validated config.
 *
 * @example
 * ```ts
 * const registry = new EnvironmentRegistry();
 * registry.register("my-env", myTemplate);
 *
 * const environment = registry.build("my-env", { someOption: true });
 * ```
 */
export class EnvironmentRegistry {
	private readonly _templates = new Map<string, ComponentTemplate<TSchema, AgentEnvironment>>();

	/**
	 * Register a template under the given name.
	 *
	 * @param name - Unique name for the template. Must not already be registered.
	 * @param template - The environment template to register.
	 * @throws {EnvironmentRegistryError} If a template with the same name is already registered.
	 */
	register(name: string, template: ComponentTemplate<TSchema, AgentEnvironment>): void {
		if (this._templates.has(name)) {
			throw new EnvironmentRegistryError(`Environment template "${name}" is already registered.`);
		}
		this._templates.set(name, template);
	}

	/**
	 * Get a registered template by name.
	 *
	 * @param name - The registered template name.
	 * @returns The template, or `undefined` if not found.
	 */
	get(name: string): ComponentTemplate<TSchema, AgentEnvironment> | undefined {
		return this._templates.get(name);
	}

	/**
	 * Check if a template is registered under the given name.
	 *
	 * @param name - The template name to check.
	 * @returns `true` if a template is registered with this name.
	 */
	has(name: string): boolean {
		return this._templates.has(name);
	}

	/**
	 * List all registered template names.
	 *
	 * @returns Array of registered names in insertion order.
	 */
	getRegisteredNames(): string[] {
		return [...this._templates.keys()];
	}

	/**
	 * Build an environment by name with optional config.
	 *
	 * Delegates to {@link validateComponentConfig} from `@otter-agent/core`
	 * for schema validation, default merging, and environment building.
	 *
	 * @param name - The registered template name.
	 * @param config - Optional user-provided config. Deep-merged with the
	 *   template's defaults before validation.
	 * @returns A built AgentEnvironment ready for use with AgentSession.
	 * @throws {EnvironmentRegistryError} If no template is registered under the given name.
	 * @throws {ComponentConfigValidationError} If config validation fails.
	 */
	build(name: string, config?: Record<string, unknown>): AgentEnvironment {
		const template = this._templates.get(name);
		if (!template) {
			throw new EnvironmentRegistryError(
				`No environment template registered under "${name}". ` +
					`Registered: ${this.getRegisteredNames().join(", ") || "(none)"}`,
			);
		}
		return validateComponentConfig(template, config);
	}
}
