import { validateComponentConfig } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { EnvironmentRegistry, EnvironmentRegistryError } from "./registry.js";

// Minimal test template
const TestConfigSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	label: Type.String({ default: "test" }),
});

type TestConfig = { enabled: boolean; label: string };

const testTemplate = {
	configSchema: () => TestConfigSchema,
	defaultConfig: (): TestConfig => ({ enabled: true, label: "test" }),
	build: (config: TestConfig) => {
		return {
			getSystemMessageAppend: () => `enabled=${config.enabled} label=${config.label}`,
			getTools: () => [],
		};
	},
};

describe("EnvironmentRegistry", () => {
	describe("register", () => {
		it("registers a template under a name", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			expect(registry.has("test")).toBe(true);
		});

		it("throws on duplicate name", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			expect(() => registry.register("test", testTemplate)).toThrow(EnvironmentRegistryError);
			expect(() => registry.register("test", testTemplate)).toThrow(
				'template "test" is already registered',
			);
		});

		it("allows different names", () => {
			const registry = new EnvironmentRegistry();
			registry.register("a", testTemplate);
			registry.register("b", testTemplate);
			expect(registry.has("a")).toBe(true);
			expect(registry.has("b")).toBe(true);
		});
	});

	describe("get", () => {
		it("returns the registered template", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			expect(registry.get("test")).toBe(testTemplate);
		});

		it("returns undefined for unknown name", () => {
			const registry = new EnvironmentRegistry();
			expect(registry.get("unknown")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("returns true for registered name", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			expect(registry.has("test")).toBe(true);
		});

		it("returns false for unknown name", () => {
			const registry = new EnvironmentRegistry();
			expect(registry.has("unknown")).toBe(false);
		});

		it("returns false for empty registry", () => {
			const registry = new EnvironmentRegistry();
			expect(registry.has("anything")).toBe(false);
		});
	});

	describe("getRegisteredNames", () => {
		it("returns empty array for empty registry", () => {
			const registry = new EnvironmentRegistry();
			expect(registry.getRegisteredNames()).toEqual([]);
		});

		it("returns all registered names in insertion order", () => {
			const registry = new EnvironmentRegistry();
			registry.register("first", testTemplate);
			registry.register("second", testTemplate);
			registry.register("third", testTemplate);
			expect(registry.getRegisteredNames()).toEqual(["first", "second", "third"]);
		});
	});

	describe("build", () => {
		it("throws for unknown name", () => {
			const registry = new EnvironmentRegistry();
			expect(() => registry.build("unknown")).toThrow(EnvironmentRegistryError);
			expect(() => registry.build("unknown")).toThrow(
				'No environment template registered under "unknown"',
			);
		});

		it("lists registered names in error message", () => {
			const registry = new EnvironmentRegistry();
			registry.register("known", testTemplate);
			expect(() => registry.build("unknown")).toThrow(/Registered: known/);
		});

		it("builds with defaults when no config provided", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			const env = registry.build("test");
			expect(env).toBeDefined();
			expect(env.getSystemMessageAppend()).toBe("enabled=true label=test");
		});

		it("builds with merged config", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			const env = registry.build("test", { label: "custom" });
			expect(env).toBeDefined();
			expect(env.getSystemMessageAppend()).toBe("enabled=true label=custom");
		});

		it("throws on invalid config", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			// Pass a value that violates the schema (enabled should be boolean)
			expect(() =>
				registry.build("test", { enabled: "not-a-boolean" as unknown as boolean }),
			).toThrow("Component config validation failed");
		});

		it("delegates to validateComponentConfig from core", () => {
			const registry = new EnvironmentRegistry();
			registry.register("test", testTemplate);
			const config = { label: "delegated" };
			// Build via registry
			const registryResult = registry.build("test", config);
			// Build via core directly
			const coreResult = validateComponentConfig(testTemplate, config);
			// Both should produce environments
			expect(registryResult.getSystemMessageAppend()).toBe(coreResult.getSystemMessageAppend());
		});
	});
});
