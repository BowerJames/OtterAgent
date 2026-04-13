/**
 * Tests for the ContextInjector built-in extension template.
 */
import { describe, expect, it } from "bun:test";
import { validateExtensionConfig } from "@otter-agent/core";
import {
	type ContextInjectorConfig,
	ContextInjectorConfigSchema,
	ContextInjectorTemplate,
} from "./context-injector.js";

describe("ContextInjectorTemplate", () => {
	it("has all required ExtensionTemplate methods", () => {
		expect(typeof ContextInjectorTemplate.configSchema).toBe("function");
		expect(typeof ContextInjectorTemplate.defaultConfig).toBe("function");
		expect(typeof ContextInjectorTemplate.buildExtension).toBe("function");
	});

	it("returns a valid TypeBox schema from configSchema()", () => {
		const schema = ContextInjectorTemplate.configSchema();
		expect(schema).toBeDefined();
		expect(ContextInjectorConfigSchema).toBe(schema);
	});

	it("returns correct defaults from defaultConfig()", () => {
		const defaults = ContextInjectorTemplate.defaultConfig();
		expect(defaults).toEqual({ content: "" });
	});

	it("builds an extension function", () => {
		const extension = ContextInjectorTemplate.buildExtension({ content: "test" });
		expect(typeof extension).toBe("function");
	});

	it("builds via validateExtensionConfig from core", () => {
		const extension = validateExtensionConfig(ContextInjectorTemplate, {
			content: "Always respond in French.",
		});
		expect(typeof extension).toBe("function");
	});

	it("the extension modifies the system prompt on before_agent_start", async () => {
		let capturedSystemPrompt: string | undefined;

		// Build a minimal fake ExtensionsAPI
		const handlers = new Map<string, unknown>();
		const api = {
			on: (event: string, handler: unknown) => {
				handlers.set(event, handler);
			},
		} as unknown as Parameters<ReturnType<typeof ContextInjectorTemplate.buildExtension>>[0];

		// Build and invoke the extension
		const extension = ContextInjectorTemplate.buildExtension({ content: "APPENDED TEXT" });
		await extension(api);

		// Simulate a before_agent_start event
		const handler = handlers.get("before_agent_start") as (event: {
			systemPrompt: string;
			prompt: string;
		}) => { systemPrompt?: string };
		expect(typeof handler).toBe("function");

		const result = handler({ systemPrompt: "Base prompt", prompt: "hello" });
		expect(result).toEqual({ systemPrompt: "Base prompt\n\nAPPENDED TEXT" });
	});

	it("validates that invalid content type is rejected", () => {
		// content must be a string — passing a number should fail validation
		expect(() =>
			validateExtensionConfig(ContextInjectorTemplate, { content: 42 as unknown as string }),
		).toThrow("Extension config validation failed");
	});

	it("fills content from defaults when omitted", () => {
		// No content provided — should use default "" and not throw
		const extension = validateExtensionConfig(ContextInjectorTemplate, {});
		expect(typeof extension).toBe("function");
	});

	it("accepts valid config", () => {
		const extension = validateExtensionConfig(ContextInjectorTemplate, {
			content: "Some context",
		});
		expect(typeof extension).toBe("function");
	});
});
