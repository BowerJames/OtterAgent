import { describe, expect, it } from "vitest";
import { buildSessionManager } from "../index.js";

describe("buildSessionManager", () => {
	it("builds 'in-memory' session manager with default config", () => {
		const sessionManager = buildSessionManager({ name: "in-memory", config: {} });
		expect(sessionManager).toBeDefined();
		expect(typeof sessionManager.appendMessage).toBe("function");
		expect(typeof sessionManager.buildSessionContext).toBe("function");
	});

	it("builds 'in-memory' session manager with null config (uses defaults)", () => {
		const sessionManager = buildSessionManager({ name: "in-memory", config: null });
		expect(sessionManager).toBeDefined();
	});

	it("builds 'in-memory' session manager with undefined config (uses defaults)", () => {
		const sessionManager = buildSessionManager({ name: "in-memory", config: undefined });
		expect(sessionManager).toBeDefined();
	});

	it("throws Error for unknown session manager name", () => {
		expect(() => buildSessionManager({ name: "nonexistent", config: {} })).toThrow(
			'Unknown session manager "nonexistent". Registered session managers: in-memory',
		);
	});
});
