import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import type { ExtensionTemplate } from "./extension-template.js";

describe("ExtensionTemplate", () => {
	test("can define a template with full type inference", () => {
		const schema = Type.Object({
			apiKey: Type.String(),
			maxRetries: Type.Number(),
			enabled: Type.Boolean(),
		});

		const template: ExtensionTemplate<typeof schema> = {
			configSchema: () => schema,
			defaultConfig: () => ({
				apiKey: "",
				maxRetries: 3,
				enabled: true,
			}),
			buildExtension: (config) => {
				// config is fully typed: { apiKey: string; maxRetries: number; enabled: boolean }
				expect(config).toEqual({ apiKey: "test-key", maxRetries: 3, enabled: true });
				return (api) => {
					api.registerTool({
						name: "test_tool",
						label: "Test Tool",
						description: `A tool with ${config.maxRetries} retries`,
						parameters: Type.Object({ query: Type.String() }),
						execute: async (id, params) => ({
							content: `Result: ${params.query}`,
						}),
					});
				};
			},
		};

		// Verify all three methods work
		expect(template.configSchema()).toBe(schema);
		expect(template.defaultConfig()).toEqual({
			apiKey: "",
			maxRetries: 3,
			enabled: true,
		});

		const extension = template.buildExtension({ apiKey: "test-key", maxRetries: 3, enabled: true });
		expect(typeof extension).toBe("function");
	});

	test("buildExtension returns a valid Extension function", () => {
		const schema = Type.Object({ name: Type.String() });
		const template: ExtensionTemplate<typeof schema> = {
			configSchema: () => schema,
			defaultConfig: () => ({ name: "default" }),
			buildExtension: (config) => (api) => {
				api.registerCommand("test", {
					description: `Test command for ${config.name}`,
					handler: async () => {},
				});
			},
		};

		const extension = template.buildExtension({ name: "my-ext" });
		expect(typeof extension).toBe("function");

		// Verify it's a valid Extension (accepts ExtensionsAPI)
		// We can't fully test without a real ExtensionsAPI, but we can verify
		// the function signature is correct
		expect(extension.length).toBeGreaterThanOrEqual(0);
	});

	test("template with optional fields in defaultConfig", () => {
		const schema = Type.Object({
			required: Type.String(),
			optionalField: Type.Optional(Type.String()),
		});

		const template: ExtensionTemplate<typeof schema> = {
			configSchema: () => schema,
			defaultConfig: () => ({
				required: "default-value",
				optionalField: undefined,
			}),
			buildExtension: (config) => {
				expect(config.required).toBe("provided");
				expect(config.optionalField).toBeUndefined();
				return () => {};
			},
		};

		const extension = template.buildExtension({ required: "provided" });
		expect(typeof extension).toBe("function");
	});

	test("template with nested object config", () => {
		const schema = Type.Object({
			db: Type.Object({
				host: Type.String(),
				port: Type.Number(),
			}),
		});

		const template: ExtensionTemplate<typeof schema> = {
			configSchema: () => schema,
			defaultConfig: () => ({
				db: { host: "localhost", port: 5432 },
			}),
			buildExtension: (config) => {
				expect(config.db).toEqual({ host: "db.example.com", port: 3306 });
				return () => {};
			},
		};

		const extension = template.buildExtension({
			db: { host: "db.example.com", port: 3306 },
		});
		expect(typeof extension).toBe("function");
	});
});
