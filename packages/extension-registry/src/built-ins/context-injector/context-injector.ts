import type { ExtensionTemplate } from "@otter-agent/core";
/**
 * Context Injector — built-in extension template that appends custom
 * text to the system prompt on every agent turn.
 *
 * This serves as the canonical example of an ExtensionTemplate.
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
 * import { validateExtensionConfig } from "@otter-agent/core";
 * import { ContextInjectorTemplate } from "@otter-agent/extension-registry";
 *
 * const extension = validateExtensionConfig(ContextInjectorTemplate, {
 *   content: "Always respond in French.",
 * });
 * ```
 */
export const ContextInjectorTemplate: ExtensionTemplate<typeof ContextInjectorConfigSchema> = {
	configSchema: () => ContextInjectorConfigSchema,
	defaultConfig: () => ({ content: "" }),
	buildExtension: (config: ContextInjectorConfig) => (api) => {
		api.on("before_agent_start", (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${config.content}`,
		}));
	},
};
