/**
 * Tests for convenience functions (buildEnvironment, isRegistered, getRegisteredNames).
 *
 * These test the public API directly rather than relying on indirect coverage
 * via the default-registry tests. This catches regressions if convenience.ts
 * is accidentally changed to delegate to a different registry instance.
 */
import { describe, expect, it } from "vitest";
import { buildEnvironment, getRegisteredNames, isRegistered } from "./convenience.js";

describe("convenience functions", () => {
	describe("isRegistered", () => {
		it("returns true for a built-in template", () => {
			expect(isRegistered("just-bash")).toBe(true);
		});

		it("returns false for an unknown name", () => {
			expect(isRegistered("nonexistent")).toBe(false);
		});
	});

	describe("getRegisteredNames", () => {
		it("returns an array containing all built-in names", () => {
			const names = getRegisteredNames();
			expect(Array.isArray(names)).toBe(true);
			expect(names).toContain("just-bash");
		});

		it("returns a copy (mutations do not affect the registry)", () => {
			const names = getRegisteredNames();
			names.push("injected");
			expect(getRegisteredNames()).not.toContain("injected");
		});
	});

	describe("buildEnvironment", () => {
		it("builds a known template with config", () => {
			const env = buildEnvironment("just-bash", { cwd: "/workspace" });
			expect(env).toBeDefined();
			expect(env.getTools().length).toBeGreaterThan(0);
		});

		it("builds a known template without config", () => {
			const env = buildEnvironment("just-bash");
			expect(env).toBeDefined();
			expect(env.getTools().length).toBeGreaterThan(0);
		});

		it("throws for an unknown name", () => {
			expect(() => buildEnvironment("nonexistent")).toThrow(
				'No environment template registered under "nonexistent"',
			);
		});

		it("throws on invalid config", () => {
			expect(() => buildEnvironment("just-bash", { cwd: 42 as unknown as string })).toThrow(
				"Component config validation failed",
			);
		});
	});
});
