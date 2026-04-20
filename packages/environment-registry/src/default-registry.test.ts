import {
	JustBashAgentEnvironmentOptionsSchema,
	JustBashAgentEnvironmentTemplate,
} from "@otter-agent/core";
/**
 * Tests for the default registry.
 */
import { describe, expect, it } from "vitest";
import { defaultRegistry } from "./default-registry.js";

describe("defaultRegistry", () => {
	it("has the just-bash built-in registered", () => {
		expect(defaultRegistry.has("just-bash")).toBe(true);
	});

	it("returns the correct template for just-bash", () => {
		const template = defaultRegistry.get("just-bash");
		expect(template).toBe(JustBashAgentEnvironmentTemplate);
	});

	it("just-bash template has the correct schema", () => {
		const template = defaultRegistry.get("just-bash");
		expect(template?.configSchema()).toBe(JustBashAgentEnvironmentOptionsSchema);
	});

	it("builds a working just-bash environment", () => {
		const env = defaultRegistry.build("just-bash", {
			cwd: "/workspace",
		});
		expect(env).toBeDefined();
		expect(env.getTools().length).toBeGreaterThan(0);
	});

	it("does not have unregistered names", () => {
		expect(defaultRegistry.has("nonexistent")).toBe(false);
	});

	it("throws for unknown build", () => {
		expect(() => defaultRegistry.build("nonexistent")).toThrow(
			'No environment template registered under "nonexistent"',
		);
	});

	it("lists registered names", () => {
		const names = defaultRegistry.getRegisteredNames();
		expect(names).toContain("just-bash");
	});
});
