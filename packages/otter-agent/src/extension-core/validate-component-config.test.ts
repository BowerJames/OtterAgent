import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import type { ComponentTemplate } from "../interfaces/component-template.js";
import {
	ComponentConfigValidationError,
	validateComponentConfig,
	validateComponentConfigOnly,
} from "./validate-component-config.js";

function createTestTemplate(overrides?: {
	defaultConfig?: Record<string, unknown>;
	build?: (config: Record<string, unknown>) => { id: string };
}): ComponentTemplate {
	const schema = Type.Object({
		apiKey: Type.String(),
		maxRetries: Type.Number(),
		enabled: Type.Boolean(),
		nested: Type.Object({
			host: Type.String(),
			port: Type.Number(),
		}),
	});

	const defaultConfig = overrides?.defaultConfig ?? {
		apiKey: "",
		maxRetries: 3,
		enabled: true,
		nested: { host: "localhost", port: 5432 },
	};

	const build = overrides?.build ?? ((config) => ({ id: config.apiKey }));

	return {
		configSchema: () => schema,
		defaultConfig: () => defaultConfig,
		build: build as (config: never) => { id: string },
	};
}

describe("validateComponentConfig", () => {
	test("returns a built component with valid config overrides", () => {
		const template = createTestTemplate();
		const instance = validateComponentConfig(template, { apiKey: "sk-test" });

		expect(instance).toEqual({ id: "sk-test" });
	});

	test("uses defaults when no rawConfig provided", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			build: (config) => {
				receivedConfig = config;
				return { id: "captured" };
			},
		});

		validateComponentConfig(template);

		expect(receivedConfig).toEqual({
			apiKey: "",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});

	test("deep merges nested config objects", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			build: (config) => {
				receivedConfig = config;
				return { id: "captured" };
			},
		});

		validateComponentConfig(template, { nested: { port: 3306 } });

		// host should be preserved from defaults, port overridden
		expect(receivedConfig?.nested).toEqual({ host: "localhost", port: 3306 });
	});

	test("throws ComponentConfigValidationError for invalid config", () => {
		const template = createTestTemplate();

		expect(() =>
			validateComponentConfig(template, {
				apiKey: "sk-test",
				maxRetries: "not-a-number",
			}),
		).toThrow(ComponentConfigValidationError);
	});

	test("error message includes validation details", () => {
		const template = createTestTemplate();

		try {
			validateComponentConfig(template, { apiKey: "sk-test", maxRetries: "not-a-number" });
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ComponentConfigValidationError);
			const validationErr = err as ComponentConfigValidationError;
			expect(validationErr.name).toBe("ComponentConfigValidationError");
			expect(validationErr.errors.length).toBeGreaterThan(0);
			expect(validationErr.template).toBe(template);
			expect(validationErr.message).toContain("validation failed");
		}
	});

	test("extra properties at top level do not cause validation error", () => {
		const template = createTestTemplate();
		// TypeBox allows additional properties by default
		const instance = validateComponentConfig(template, {
			apiKey: "sk-test",
			unknownField: "ignored",
		});
		expect(instance).toEqual({ id: "sk-test" });
	});

	test("deep merge provides missing nested required fields from defaults", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			build: (config) => {
				receivedConfig = config;
				return { id: "captured" };
			},
		});

		validateComponentConfig(template, { nested: { host: "localhost" } });

		expect(receivedConfig?.nested).toEqual({ host: "localhost", port: 5432 });
	});

	test("partial config merges with defaults for the rest", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			build: (config) => {
				receivedConfig = config;
				return { id: "captured" };
			},
		});

		validateComponentConfig(template, { apiKey: "sk-test" });

		expect(receivedConfig).toEqual({
			apiKey: "sk-test",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});
});

describe("validateComponentConfigOnly", () => {
	test("returns validated config without building component", () => {
		const template = createTestTemplate();
		const config = validateComponentConfigOnly(template, { apiKey: "sk-test" });

		expect(config).toEqual({
			apiKey: "sk-test",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});

	test("throws validation error for invalid config", () => {
		const template = createTestTemplate();

		expect(() => validateComponentConfigOnly(template, { apiKey: 12345 })).toThrow(
			ComponentConfigValidationError,
		);
	});

	test("returns defaults when no rawConfig provided", () => {
		const template = createTestTemplate();
		const config = validateComponentConfigOnly(template);

		expect(config).toEqual({
			apiKey: "",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});

	test("deep merges nested config", () => {
		const template = createTestTemplate();
		const config = validateComponentConfigOnly(template, { nested: { port: 3306 } });

		expect(config.nested).toEqual({ host: "localhost", port: 3306 });
	});
});

describe("ComponentConfigValidationError", () => {
	test("has correct name and properties", () => {
		const template = createTestTemplate();
		const error = new ComponentConfigValidationError(template, [
			"/apiKey: Expected string",
			"/maxRetries: Expected number",
		]);

		expect(error.name).toBe("ComponentConfigValidationError");
		expect(error.template).toBe(template);
		expect(error.errors).toEqual(["/apiKey: Expected string", "/maxRetries: Expected number"]);
		expect(error.message).toContain("/apiKey: Expected string");
		expect(error.message).toContain("/maxRetries: Expected number");
	});

	test("is instanceof Error", () => {
		const template = createTestTemplate();
		const error = new ComponentConfigValidationError(template, ["test"]);

		expect(error).toBeInstanceOf(Error);
	});
});
