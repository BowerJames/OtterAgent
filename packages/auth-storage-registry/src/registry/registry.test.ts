import { describe, expect, it } from "vitest";
import { buildAuthStorage } from "../index.js";

describe("buildAuthStorage", () => {
	it("builds 'in-memory' auth storage with default config", () => {
		const authStorage = buildAuthStorage({ name: "in-memory", config: {} });
		expect(authStorage).toBeDefined();
		expect(typeof authStorage.getApiKey).toBe("function");
	});

	it("builds 'in-memory' auth storage with null config (uses defaults)", () => {
		const authStorage = buildAuthStorage({ name: "in-memory", config: null });
		expect(authStorage).toBeDefined();
	});

	it("builds 'in-memory' auth storage with undefined config (uses defaults)", () => {
		const authStorage = buildAuthStorage({ name: "in-memory", config: undefined });
		expect(authStorage).toBeDefined();
	});

	it("throws Error for unknown auth storage name", () => {
		expect(() => buildAuthStorage({ name: "nonexistent", config: {} })).toThrow(
			'Unknown auth storage "nonexistent". Registered auth storages: in-memory',
		);
	});
});
