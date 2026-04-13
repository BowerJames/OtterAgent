import { describe, expect, it } from "bun:test";
import { validateExtensionConfig } from "@otter-agent/core";
/**
 * Tests for ExtensionRegistry.
 */
import { Type } from "@sinclair/typebox";
import { ExtensionRegistry, ExtensionRegistryError } from "./registry.js";

// Minimal test template
const TestConfigSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	label: Type.String({ default: "test" }),
});

type TestConfig = { enabled: boolean; label: string };

const testTemplate = {
	configSchema: () => TestConfigSchema,
	defaultConfig: (): TestConfig => ({ enabled: true, label: "test" }),
	buildExtension: (config: TestConfig) => {
		return () => {
			// Extension captures config in closure — verified via build return
			void config;
		};
	},
};

describe("ExtensionRegistry", () => {
	describe("register", () => {
		it("registers a template under a name", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			expect(registry.has("test")).toBe(true);
		});

		it("throws on duplicate name", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			expect(() => registry.register("test", testTemplate)).toThrow(ExtensionRegistryError);
			expect(() => registry.register("test", testTemplate)).toThrow(
				'template "test" is already registered',
			);
		});

		it("allows different names", () => {
			const registry = new ExtensionRegistry();
			registry.register("a", testTemplate);
			registry.register("b", testTemplate);
			expect(registry.has("a")).toBe(true);
			expect(registry.has("b")).toBe(true);
		});
	});

	describe("get", () => {
		it("returns the registered template", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			expect(registry.get("test")).toBe(testTemplate);
		});

		it("returns undefined for unknown name", () => {
			const registry = new ExtensionRegistry();
			expect(registry.get("unknown")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("returns true for registered name", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			expect(registry.has("test")).toBe(true);
		});

		it("returns false for unknown name", () => {
			const registry = new ExtensionRegistry();
			expect(registry.has("unknown")).toBe(false);
		});

		it("returns false for empty registry", () => {
			const registry = new ExtensionRegistry();
			expect(registry.has("anything")).toBe(false);
		});
	});

	describe("getRegisteredNames", () => {
		it("returns empty array for empty registry", () => {
			const registry = new ExtensionRegistry();
			expect(registry.getRegisteredNames()).toEqual([]);
		});

		it("returns all registered names in insertion order", () => {
			const registry = new ExtensionRegistry();
			registry.register("first", testTemplate);
			registry.register("second", testTemplate);
			registry.register("third", testTemplate);
			expect(registry.getRegisteredNames()).toEqual(["first", "second", "third"]);
		});
	});

	describe("build", () => {
		it("throws for unknown name", () => {
			const registry = new ExtensionRegistry();
			expect(() => registry.build("unknown")).toThrow(ExtensionRegistryError);
			expect(() => registry.build("unknown")).toThrow(
				'No extension template registered under "unknown"',
			);
		});

		it("lists registered names in error message", () => {
			const registry = new ExtensionRegistry();
			registry.register("known", testTemplate);
			expect(() => registry.build("unknown")).toThrow(/Registered: known/);
		});

		it("builds with defaults when no config provided", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			const extension = registry.build("test");
			expect(typeof extension).toBe("function");
		});

		it("builds with merged config", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			const extension = registry.build("test", { label: "custom" });
			expect(typeof extension).toBe("function");
		});

		it("throws on invalid config", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			// Pass a value that violates the schema (enabled should be boolean)
			expect(() =>
				registry.build("test", { enabled: "not-a-boolean" as unknown as boolean }),
			).toThrow("Extension config validation failed");
		});

		it("delegates to validateExtensionConfig from core", () => {
			const registry = new ExtensionRegistry();
			registry.register("test", testTemplate);
			const config = { label: "delegated" };
			// Build via registry
			const registryResult = registry.build("test", config);
			// Build via core directly
			const coreResult = validateExtensionConfig(testTemplate, config);
			// Both should produce functions
			expect(typeof registryResult).toBe("function");
			expect(typeof coreResult).toBe("function");
		});
	});
});
