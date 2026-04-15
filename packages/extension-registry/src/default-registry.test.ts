/**
 * Tests for the default registry.
 */
import { describe, expect, it } from "vitest";
import {
	ContextInjectorConfigSchema,
	ContextInjectorTemplate,
} from "./built-ins/context-injector/index.js";
import { defaultRegistry } from "./default-registry.js";

describe("defaultRegistry", () => {
	it("has the context-injector built-in registered", () => {
		expect(defaultRegistry.has("context-injector")).toBe(true);
	});

	it("returns the correct template for context-injector", () => {
		const template = defaultRegistry.get("context-injector");
		expect(template).toBe(ContextInjectorTemplate);
	});

	it("context-injector template has the correct schema", () => {
		const template = defaultRegistry.get("context-injector");
		expect(template?.configSchema()).toBe(ContextInjectorConfigSchema);
	});

	it("builds a working context-injector extension", () => {
		const extension = defaultRegistry.build("context-injector", {
			content: "Test context",
		});
		expect(typeof extension).toBe("function");
	});

	it("does not have unregistered names", () => {
		expect(defaultRegistry.has("nonexistent")).toBe(false);
	});

	it("throws for unknown build", () => {
		expect(() => defaultRegistry.build("nonexistent")).toThrow(
			'No extension template registered under "nonexistent"',
		);
	});

	it("lists registered names", () => {
		const names = defaultRegistry.getRegisteredNames();
		expect(names).toContain("context-injector");
	});
});
