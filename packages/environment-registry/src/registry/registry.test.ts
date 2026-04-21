import { describe, expect, it } from "vitest";
import { buildAgentEnvironment } from "../index.js";

describe("buildAgentEnvironment", () => {
	it("builds 'no-op' environment with default config", () => {
		const env = buildAgentEnvironment({ name: "no-op", config: {} });
		expect(env.getSystemMessageAppend()).toBeUndefined();
		expect(env.getTools()).toEqual([]);
	});

	it("builds 'no-op' environment with null config (uses defaults)", () => {
		const env = buildAgentEnvironment({ name: "no-op", config: null });
		expect(env.getSystemMessageAppend()).toBeUndefined();
		expect(env.getTools()).toEqual([]);
	});

	it("builds 'no-op' environment with undefined config (uses defaults)", () => {
		const env = buildAgentEnvironment({ name: "no-op", config: undefined });
		expect(env.getSystemMessageAppend()).toBeUndefined();
		expect(env.getTools()).toEqual([]);
	});

	it("throws Error for unknown environment name", () => {
		expect(() => buildAgentEnvironment({ name: "nonexistent", config: {} })).toThrow(
			'Unknown environment "nonexistent". Registered environments: no-op',
		);
	});
});
