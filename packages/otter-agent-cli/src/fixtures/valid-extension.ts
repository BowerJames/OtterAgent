import type { ExtensionTemplate } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

/**
 * Minimal valid ExtensionTemplate for testing.
 *
 * Config schema: { apiKey: string, maxRetries: number }
 * Defaults: { apiKey: "default-key", maxRetries: 3 }
 */
const template: ExtensionTemplate = {
	configSchema: () =>
		Type.Object({
			apiKey: Type.String(),
			maxRetries: Type.Number(),
		}),
	defaultConfig: () => ({
		apiKey: "default-key",
		maxRetries: 3,
	}),
	buildExtension: (config) => {
		return (_api) => {
			// Extension does nothing — just for testing
			void config;
		};
	},
};

export default template;
