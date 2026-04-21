import { InMemorySessionManager } from "@otter-agent/core";
import type { ComponentTemplate } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

/**
 * Minimal valid ComponentTemplate for testing.
 *
 * Produces an InMemorySessionManager so no filesystem side-effects occur.
 * Config schema: { label?: string }
 */
const template: ComponentTemplate = {
	configSchema: () =>
		Type.Object({
			label: Type.Optional(Type.String()),
		}),
	defaultConfig: () => ({ label: "test" }),
	build: () => new InMemorySessionManager(),
};

export default template;
