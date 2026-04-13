import type { ComponentTemplate, Extension } from "@otter-agent/core";
/**
 * Context Injector — built-in extension template that appends custom
 * text to the system prompt on every agent turn.
 *
 * This serves as the canonical example of a ComponentTemplate that
 * produces an Extension.
 */
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

/**
 * Config schema for the context-injector extension.
 */
export const ContextInjectorConfigSchema = Type.Object({
	content: Type.String({
		description: "Text to append to the system prompt on every turn.",
	}),
});

/**
 * Config type for the context-injector extension.
 */
export type ContextInjectorConfig = Static<typeof ContextInjectorConfigSchema>;

/**
 * Context Injector extension template.
 *
 * Appends the configured `content` to the system prompt on every
 * `before_agent_start` event.
 *
 * @example
 * ```ts
 * import { validateComponentConfig } from "@otter-agent/core";
 * import { ContextInjectorTemplate } from "@otter-agent/extension-registry";
 *
 * const extension = validateComponentConfig(ContextInjectorTemplate, {
 *   content: "Always respond in French.",
 * });
 * ```
 */
export const ContextInjectorTemplate: ComponentTemplate<
	typeof ContextInjectorConfigSchema,
	Extension
> = {
	configSchema: () => ContextInjectorConfigSchema,
	defaultConfig: () => ({ content: "" }),
	build: (config: ContextInjectorConfig) => (api) => {
		api.on("before_agent_start", (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${config.content}`,
		}));
	},
};
