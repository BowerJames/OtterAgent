import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import type { ExtensionTemplate } from "../interfaces/extension-template.js";
import {
	ExtensionConfigValidationError,
	validateExtensionConfig,
	validateExtensionConfigOnly,
} from "./validate-extension-config.js";

function createTestTemplate(overrides?: {
	defaultConfig?: Record<string, unknown>;
	buildExtension?: (config: Record<string, unknown>) => () => void;
}): ExtensionTemplate {
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

	const buildExtension = overrides?.buildExtension ?? (() => () => {});

	return {
		configSchema: () => schema,
		defaultConfig: () => defaultConfig,
		buildExtension: buildExtension as (config: never) => () => void,
	};
}

describe("validateExtensionConfig", () => {
	test("returns an extension with valid config overrides", () => {
		const template = createTestTemplate();
		const extension = validateExtensionConfig(template, {
			apiKey: "sk-test",
		});

		expect(typeof extension).toBe("function");
	});

	test("uses defaults when no rawConfig provided", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			buildExtension: (config) => {
				receivedConfig = config;
				return () => {};
			},
		});

		validateExtensionConfig(template);

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
			buildExtension: (config) => {
				receivedConfig = config;
				return () => {};
			},
		});

		validateExtensionConfig(template, {
			nested: { port: 3306 },
		});

		// host should be preserved from defaults, port overridden
		expect(receivedConfig?.nested).toEqual({
			host: "localhost",
			port: 3306,
		});
	});

	test("throws ExtensionConfigValidationError for invalid config", () => {
		const template = createTestTemplate();

		expect(() =>
			validateExtensionConfig(template, {
				apiKey: "sk-test",
				maxRetries: "not-a-number", // type mismatch
			}),
		).toThrow(ExtensionConfigValidationError);
	});

	test("error message includes validation details", () => {
		const template = createTestTemplate();

		try {
			validateExtensionConfig(template, {
				apiKey: "sk-test",
				maxRetries: "not-a-number",
			});
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigValidationError);
			const validationErr = err as ExtensionConfigValidationError;
			expect(validationErr.name).toBe("ExtensionConfigValidationError");
			expect(validationErr.errors.length).toBeGreaterThan(0);
			expect(validationErr.template).toBe(template);
			expect(validationErr.message).toContain("validation failed");
		}
	});

	test("extra properties at top level do not cause validation error", () => {
		const template = createTestTemplate();
		// TypeBox allows additional properties by default
		const extension = validateExtensionConfig(template, {
			apiKey: "sk-test",
			unknownField: "ignored",
		});
		expect(typeof extension).toBe("function");
	});

	test("deep merge provides missing nested required fields from defaults", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			buildExtension: (config) => {
				receivedConfig = config;
				return () => {};
			},
		});

		// Provide partial nested config — port comes from defaults
		validateExtensionConfig(template, {
			nested: { host: "localhost" },
		});

		expect(receivedConfig?.nested).toEqual({ host: "localhost", port: 5432 });
	});

	test("partial config merges with defaults for the rest", () => {
		let receivedConfig: Record<string, unknown> | undefined;
		const template = createTestTemplate({
			buildExtension: (config) => {
				receivedConfig = config;
				return () => {};
			},
		});

		validateExtensionConfig(template, { apiKey: "sk-test" });

		expect(receivedConfig).toEqual({
			apiKey: "sk-test",
			maxRetries: 3, // from defaults
			enabled: true, // from defaults
			nested: { host: "localhost", port: 5432 }, // from defaults
		});
	});
});

describe("validateExtensionConfigOnly", () => {
	test("returns validated config without building extension", () => {
		const template = createTestTemplate();
		const config = validateExtensionConfigOnly(template, { apiKey: "sk-test" });

		expect(config).toEqual({
			apiKey: "sk-test",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});

	test("throws validation error for invalid config", () => {
		const template = createTestTemplate();

		expect(() =>
			validateExtensionConfigOnly(template, {
				apiKey: 12345, // wrong type
			}),
		).toThrow(ExtensionConfigValidationError);
	});

	test("returns defaults when no rawConfig provided", () => {
		const template = createTestTemplate();
		const config = validateExtensionConfigOnly(template);

		expect(config).toEqual({
			apiKey: "",
			maxRetries: 3,
			enabled: true,
			nested: { host: "localhost", port: 5432 },
		});
	});

	test("deep merges nested config", () => {
		const template = createTestTemplate();
		const config = validateExtensionConfigOnly(template, {
			nested: { port: 3306 },
		});

		expect(config.nested).toEqual({ host: "localhost", port: 3306 });
	});
});

describe("ExtensionConfigValidationError", () => {
	test("has correct name and properties", () => {
		const template = createTestTemplate();
		const error = new ExtensionConfigValidationError(template, [
			"/apiKey: Expected string",
			"/maxRetries: Expected number",
		]);

		expect(error.name).toBe("ExtensionConfigValidationError");
		expect(error.template).toBe(template);
		expect(error.errors).toEqual(["/apiKey: Expected string", "/maxRetries: Expected number"]);
		expect(error.message).toContain("/apiKey: Expected string");
		expect(error.message).toContain("/maxRetries: Expected number");
	});

	test("is instanceof Error", () => {
		const template = createTestTemplate();
		const error = new ExtensionConfigValidationError(template, ["test"]);

		expect(error).toBeInstanceOf(Error);
	});
});
