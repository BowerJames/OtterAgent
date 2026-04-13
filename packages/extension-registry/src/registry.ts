/**
 * ExtensionRegistry — a dynamic registry of named extension templates.
 *
 * Provides methods to register, look up, and build extensions by name.
 * A default pre-populated singleton is available via {@link defaultRegistry}.
 */
import { validateExtensionConfig } from "@otter-agent/core";
import type { ExtensionTemplate } from "@otter-agent/core";
import type { Extension } from "@otter-agent/core";

/**
 * Error thrown when attempting to register a template under a name
 * that is already in use.
 */
export class ExtensionRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExtensionRegistryError";
	}
}

/**
 * A dynamic registry of named extension templates.
 *
 * Templates are registered with a unique string name and can be built
 * into concrete Extension functions with validated config.
 *
 * @example
 * ```ts
 * const registry = new ExtensionRegistry();
 * registry.register("my-ext", myTemplate);
 *
 * const extension = registry.build("my-ext", { someOption: true });
 * ```
 */
export class ExtensionRegistry {
	private readonly _templates = new Map<string, ExtensionTemplate>();

	/**
	 * Register a template under the given name.
	 *
	 * @param name - Unique name for the template. Must not already be registered.
	 * @param template - The extension template to register.
	 * @throws {ExtensionRegistryError} If a template with the same name is already registered.
	 */
	register(name: string, template: ExtensionTemplate): void {
		if (this._templates.has(name)) {
			throw new ExtensionRegistryError(`Extension template "${name}" is already registered.`);
		}
		this._templates.set(name, template);
	}

	/**
	 * Get a registered template by name.
	 *
	 * @param name - The registered template name.
	 * @returns The template, or `undefined` if not found.
	 */
	get(name: string): ExtensionTemplate | undefined {
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
	 * Build an extension by name with optional config.
	 *
	 * Delegates to {@link validateExtensionConfig} from `@otter-agent/core`
	 * for schema validation, default merging, and extension building.
	 *
	 * @param name - The registered template name.
	 * @param config - Optional user-provided config. Deep-merged with the
	 *   template's defaults before validation.
	 * @returns A built Extension ready for use with AgentSession.
	 * @throws {ExtensionRegistryError} If no template is registered under the given name.
	 * @throws {ExtensionConfigValidationError} If config validation fails.
	 */
	build(name: string, config?: Record<string, unknown>): Extension {
		const template = this._templates.get(name);
		if (!template) {
			throw new ExtensionRegistryError(
				`No extension template registered under "${name}". ` +
					`Registered: ${this.getRegisteredNames().join(", ") || "(none)"}`,
			);
		}
		return validateExtensionConfig(template, config);
	}
}
