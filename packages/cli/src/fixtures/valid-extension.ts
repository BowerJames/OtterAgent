import type { ComponentTemplate, Extension } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

/**
 * Minimal valid ComponentTemplate<Extension> for testing.
 *
 * Config schema: { apiKey: string, maxRetries: number }
 * Defaults: { apiKey: "default-key", maxRetries: 3 }
 */
const template: ComponentTemplate = {
	configSchema: () =>
		Type.Object({
			apiKey: Type.String(),
			maxRetries: Type.Number(),
		}),
	defaultConfig: () => ({
		apiKey: "default-key",
		maxRetries: 3,
	}),
	build: (config) => {
		return (_api: Parameters<Extension>[0]) => {
			// Extension does nothing — just for testing
			void config;
		};
	},
};

export default template;
