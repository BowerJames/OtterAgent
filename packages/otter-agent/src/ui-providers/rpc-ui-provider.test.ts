import { describe, expect, test } from "bun:test";
import type { ExtensionUIResponse, RpcOutboundMessage, RpcTransport } from "../rpc/types.js";
import { UIProvider } from "./index.js";
import { createRpcUIProvider } from "./rpc-ui-provider.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

interface MockTransport extends RpcTransport {
	sent: RpcOutboundMessage[];
}

function createMockTransport(): MockTransport {
	const transport: MockTransport = {
		sent: [],
		onMessage: () => {},
		send(message) {
			transport.sent.push(message);
		},
	};
	return transport;
}

function getUIRequests(transport: MockTransport) {
	return transport.sent.filter((m) => m.type === "extension_ui_request");
}

// ─── createRpcUIProvider ──────────────────────────────────────────────

describe("createRpcUIProvider", () => {
	test("returns uiProvider, resolveResponse, and rejectAll", () => {
		const { uiProvider, resolveResponse, rejectAll } = createRpcUIProvider(createMockTransport());
		expect(uiProvider).toBeDefined();
		expect(resolveResponse).toBeFunction();
		expect(rejectAll).toBeFunction();
	});

	// ─── dialog ──────────────────────────────────────────────────────

	test("dialog sends extension_ui_request with method=dialog", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const dialogPromise = uiProvider.dialog("Title", "Body");
		const requests = getUIRequests(transport);
		expect(requests).toHaveLength(1);

		const req = requests[0] as { id: string; method: string; title: string; body: string };
		expect(req.method).toBe("dialog");
		expect(req.title).toBe("Title");
		expect(req.body).toBe("Body");

		resolveResponse({ type: "extension_ui_response", id: req.id });
		await expect(dialogPromise).resolves.toBeUndefined();
	});

	// ─── confirm ─────────────────────────────────────────────────────

	test("confirm sends extension_ui_request with method=confirm", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const confirmPromise = uiProvider.confirm("Title", "Are you sure?");
		const req = getUIRequests(transport)[0] as { id: string; method: string };
		expect(req.method).toBe("confirm");

		resolveResponse({ type: "extension_ui_response", id: req.id, confirmed: true });
		await expect(confirmPromise).resolves.toBe(true);
	});

	test("confirm resolves false when confirmed=false", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const confirmPromise = uiProvider.confirm("Title", "Body");
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, confirmed: false });
		await expect(confirmPromise).resolves.toBe(false);
	});

	test("confirm resolves false when cancelled", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const confirmPromise = uiProvider.confirm("Title", "Body");
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, cancelled: true });
		await expect(confirmPromise).resolves.toBe(false);
	});

	// ─── input ───────────────────────────────────────────────────────

	test("input sends extension_ui_request with method=input", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const inputPromise = uiProvider.input("Name?", "placeholder text");
		const req = getUIRequests(transport)[0] as {
			id: string;
			method: string;
			placeholder?: string;
		};
		expect(req.method).toBe("input");
		expect(req.placeholder).toBe("placeholder text");

		resolveResponse({ type: "extension_ui_response", id: req.id, value: "Alice" });
		await expect(inputPromise).resolves.toBe("Alice");
	});

	test("input resolves undefined when cancelled", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const inputPromise = uiProvider.input("Name?");
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, cancelled: true });
		await expect(inputPromise).resolves.toBeUndefined();
	});

	// ─── select ──────────────────────────────────────────────────────

	test("select sends extension_ui_request with method=select and items", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const items = ["apple", "banana", "cherry"];
		const selectPromise = uiProvider.select("Pick one", items);
		const req = getUIRequests(transport)[0] as { id: string; method: string; items: unknown[] };
		expect(req.method).toBe("select");
		expect(req.items).toEqual(items);

		// Client returns index "1" → banana
		resolveResponse({ type: "extension_ui_response", id: req.id, value: "1" });
		await expect(selectPromise).resolves.toBe("banana");
	});

	test("select resolves undefined when cancelled", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const selectPromise = uiProvider.select("Pick one", ["a", "b"]);
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, cancelled: true });
		await expect(selectPromise).resolves.toBeUndefined();
	});

	test("select resolves undefined when index is out of range", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const selectPromise = uiProvider.select("Pick one", ["a", "b"]);
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, value: "99" });
		await expect(selectPromise).resolves.toBeUndefined();
	});

	test("select resolves undefined when value is non-numeric", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const selectPromise = uiProvider.select("Pick one", ["a", "b"]);
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({ type: "extension_ui_response", id: req.id, value: "not-a-number" });
		await expect(selectPromise).resolves.toBeUndefined();
	});

	// ─── notify ──────────────────────────────────────────────────────

	test("notify sends extension_ui_request with method=notify (fire-and-forget)", () => {
		const transport = createMockTransport();
		const { uiProvider } = createRpcUIProvider(transport);

		uiProvider.notify("Hello", "info");

		const requests = getUIRequests(transport);
		expect(requests).toHaveLength(1);

		const req = requests[0] as { method: string; message: string; notifyType?: string };
		expect(req.method).toBe("notify");
		expect(req.message).toBe("Hello");
		expect(req.notifyType).toBe("info");
	});

	test("notify does not add entry to pending (no resolveResponse needed)", () => {
		const transport = createMockTransport();
		const { uiProvider, rejectAll } = createRpcUIProvider(transport);

		uiProvider.notify("Hello");

		// rejectAll should not reject anything — notify is not pending
		expect(() => rejectAll("shutdown")).not.toThrow();
	});

	// ─── resolveResponse ─────────────────────────────────────────────

	test("resolveResponse resolves the matching pending promise", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = createRpcUIProvider(transport);

		const p1 = uiProvider.confirm("First", "Body");
		const p2 = uiProvider.confirm("Second", "Body");

		const reqs = getUIRequests(transport) as Array<{ id: string }>;
		expect(reqs).toHaveLength(2);

		// Resolve only the second
		resolveResponse({ type: "extension_ui_response", id: reqs[1].id, confirmed: true });
		await expect(p2).resolves.toBe(true);

		// First is still pending — resolve it too
		resolveResponse({ type: "extension_ui_response", id: reqs[0].id, confirmed: false });
		await expect(p1).resolves.toBe(false);
	});

	test("resolveResponse is a no-op for unknown ids", () => {
		const transport = createMockTransport();
		const { resolveResponse } = createRpcUIProvider(transport);

		// Should not throw
		expect(() =>
			resolveResponse({ type: "extension_ui_response", id: "unknown-uuid" }),
		).not.toThrow();
	});

	// ─── rejectAll ───────────────────────────────────────────────────

	test("rejectAll rejects all pending promises with the given reason", async () => {
		const transport = createMockTransport();
		const { uiProvider, rejectAll } = createRpcUIProvider(transport);

		const p1 = uiProvider.confirm("First", "Body");
		const p2 = uiProvider.input("Second");

		rejectAll("RPC handler stopped");

		await expect(p1).rejects.toThrow("RPC handler stopped");
		await expect(p2).rejects.toThrow("RPC handler stopped");
	});

	test("rejectAll clears pending map so subsequent calls are no-ops", async () => {
		const transport = createMockTransport();
		const { uiProvider, rejectAll } = createRpcUIProvider(transport);

		const p = uiProvider.confirm("Title", "Body");
		rejectAll("shutdown");
		await expect(p).rejects.toThrow("shutdown");

		// Second rejectAll should not throw
		expect(() => rejectAll("again")).not.toThrow();
	});
});

// ─── UIProvider.rpc() namespace factory ──────────────────────────────

describe("UIProvider.rpc()", () => {
	test("returns uiProvider, resolveResponse, and rejectAll", () => {
		const { uiProvider, resolveResponse, rejectAll } = UIProvider.rpc(createMockTransport());
		expect(uiProvider).toBeDefined();
		expect(resolveResponse).toBeFunction();
		expect(rejectAll).toBeFunction();
	});

	test("uiProvider implements all UIProvider methods", () => {
		const { uiProvider } = UIProvider.rpc(createMockTransport());
		expect(uiProvider.dialog).toBeFunction();
		expect(uiProvider.confirm).toBeFunction();
		expect(uiProvider.input).toBeFunction();
		expect(uiProvider.select).toBeFunction();
		expect(uiProvider.notify).toBeFunction();
	});

	test("each call returns an independent instance", () => {
		const transport = createMockTransport();
		const r1 = UIProvider.rpc(transport);
		const r2 = UIProvider.rpc(transport);
		expect(r1.uiProvider).not.toBe(r2.uiProvider);
	});

	test("confirm sends request and resolves via resolveResponse", async () => {
		const transport = createMockTransport();
		const { uiProvider, resolveResponse } = UIProvider.rpc(transport);

		const confirmPromise = uiProvider.confirm("Title", "Body");
		const req = getUIRequests(transport)[0] as { id: string };

		resolveResponse({
			type: "extension_ui_response",
			id: req.id,
			confirmed: true,
		} as ExtensionUIResponse);
		await expect(confirmPromise).resolves.toBe(true);
	});
});
