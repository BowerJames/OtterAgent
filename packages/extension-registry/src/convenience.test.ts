/**
 * Tests for convenience functions (buildExtension, isRegistered, getRegisteredNames).
 *
 * These test the public API directly rather than relying on indirect coverage
 * via the default-registry tests. This catches regressions if convenience.ts
 * is accidentally changed to delegate to a different registry instance.
 */
import { describe, expect, it } from "vitest";
import { buildExtension, getRegisteredNames, isRegistered } from "./convenience.js";

describe("convenience functions", () => {
	describe("isRegistered", () => {
		it("returns true for a built-in template", () => {
			expect(isRegistered("context-injector")).toBe(true);
		});

		it("returns false for an unknown name", () => {
			expect(isRegistered("nonexistent")).toBe(false);
		});
	});

	describe("getRegisteredNames", () => {
		it("returns an array containing all built-in names", () => {
			const names = getRegisteredNames();
			expect(Array.isArray(names)).toBe(true);
			expect(names).toContain("context-injector");
		});

		it("returns a copy (mutations do not affect the registry)", () => {
			const names = getRegisteredNames();
			names.push("injected");
			expect(getRegisteredNames()).not.toContain("injected");
		});
	});

	describe("buildExtension", () => {
		it("builds a known template with config", () => {
			const extension = buildExtension("context-injector", { content: "test" });
			expect(typeof extension).toBe("function");
		});

		it("builds a known template without config", () => {
			const extension = buildExtension("context-injector");
			expect(typeof extension).toBe("function");
		});

		it("throws for an unknown name", () => {
			expect(() => buildExtension("nonexistent")).toThrow(
				'No extension template registered under "nonexistent"',
			);
		});

		it("throws on invalid config", () => {
			expect(() =>
				buildExtension("context-injector", { content: 42 as unknown as string }),
			).toThrow("Component config validation failed");
		});
	});
});
