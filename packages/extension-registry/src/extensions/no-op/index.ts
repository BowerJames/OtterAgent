import type { ComponentTemplate, Extension } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

/**
 * Extension that does nothing.
 *
 * Useful as a default or placeholder when no real extension is needed.
 */
const NoOpExtension: Extension = (_api) => {
	// no-op
};

const NoOpConfigSchema = Type.Object({});

/**
 * ComponentTemplate for {@link NoOpExtension}.
 *
 * Accepts no configuration — `configSchema()` is an empty object.
 */
export const NoOpExtensionTemplate: ComponentTemplate<typeof NoOpConfigSchema, Extension> = {
	configSchema() {
		return NoOpConfigSchema;
	},

	defaultConfig() {
		return {};
	},

	build(_config) {
		return NoOpExtension;
	},
};
