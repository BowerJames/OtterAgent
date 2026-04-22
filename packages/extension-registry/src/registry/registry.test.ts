import { describe, expect, it } from "vitest";
import { buildExtension } from "../index.js";

describe("buildExtension", () => {
	it("builds 'no-op' extension with default config", () => {
		const ext = buildExtension({ name: "no-op", config: {} });
		expect(typeof ext).toBe("function");
	});

	it("builds 'no-op' extension with null config (uses defaults)", () => {
		const ext = buildExtension({ name: "no-op", config: null });
		expect(typeof ext).toBe("function");
	});

	it("builds 'no-op' extension with undefined config (uses defaults)", () => {
		const ext = buildExtension({ name: "no-op", config: undefined });
		expect(typeof ext).toBe("function");
	});

	it("throws Error for unknown extension name", () => {
		expect(() => buildExtension({ name: "nonexistent", config: {} })).toThrow(
			'Unknown extension "nonexistent". Registered extensions: no-op',
		);
	});
});
