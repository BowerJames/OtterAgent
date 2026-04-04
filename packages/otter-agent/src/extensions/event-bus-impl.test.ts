import { describe, expect, test } from "bun:test";
import { createEventBus } from "./event-bus-impl.js";

describe("EventBus", () => {
	test("emit delivers data to all subscribers on a channel", () => {
		const bus = createEventBus();
		const received1: unknown[] = [];
		const received2: unknown[] = [];

		bus.on("test", (data) => received1.push(data));
		bus.on("test", (data) => received2.push(data));

		bus.emit("test", { hello: "world" });

		expect(received1).toEqual([{ hello: "world" }]);
		expect(received2).toEqual([{ hello: "world" }]);
	});

	test("emit on unknown channel is a no-op", () => {
		const bus = createEventBus();
		// Should not throw
		bus.emit("nonexistent", {});
	});

	test("unsubscribe removes the handler", () => {
		const bus = createEventBus();
		const received: unknown[] = [];

		const unsub = bus.on("ch", (data) => received.push(data));
		bus.emit("ch", 1);
		expect(received).toEqual([1]);

		unsub();
		bus.emit("ch", 2);
		expect(received).toEqual([1]); // no new delivery
	});

	test("different channels are independent", () => {
		const bus = createEventBus();
		const a: unknown[] = [];
		const b: unknown[] = [];

		bus.on("a", (data) => a.push(data));
		bus.on("b", (data) => b.push(data));

		bus.emit("a", "only-a");
		bus.emit("b", "only-b");

		expect(a).toEqual(["only-a"]);
		expect(b).toEqual(["only-b"]);
	});

	test("clear removes all subscriptions", () => {
		const bus = createEventBus();
		const received: unknown[] = [];

		bus.on("x", (data) => received.push(data));
		bus.on("y", (data) => received.push(data));

		bus.clear();

		bus.emit("x", 1);
		bus.emit("y", 2);
		expect(received).toEqual([]);
	});

	test("multiple handlers on the same channel each get their own unsubscribe", () => {
		const bus = createEventBus();
		const received: unknown[] = [];

		const unsub1 = bus.on("ch", (data) => received.push(`h1:${data}`));
		const unsub2 = bus.on("ch", (data) => received.push(`h2:${data}`));

		bus.emit("ch", "a");
		expect(received).toEqual(["h1:a", "h2:a"]);

		unsub1();
		bus.emit("ch", "b");
		expect(received).toEqual(["h1:a", "h2:a", "h2:b"]);

		unsub2();
		bus.emit("ch", "c");
		expect(received).toEqual(["h1:a", "h2:a", "h2:b"]);
	});
});
