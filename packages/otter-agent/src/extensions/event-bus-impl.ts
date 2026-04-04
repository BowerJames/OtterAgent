/**
 * EventBus implementation for extension-to-extension communication.
 */
import type { EventBus } from "./event-bus.js";

export function createEventBus(): EventBus & { clear(): void } {
	const handlers = new Map<string, Set<(data: unknown) => void>>();

	return {
		emit(channel: string, data: unknown): void {
			const set = handlers.get(channel);
			if (set) {
				for (const handler of set) {
					handler(data);
				}
			}
		},

		on(channel: string, handler: (data: unknown) => void): () => void {
			let set = handlers.get(channel);
			if (!set) {
				set = new Set();
				handlers.set(channel, set);
			}
			set.add(handler);
			return () => {
				set.delete(handler);
				if (set.size === 0) {
					handlers.delete(channel);
				}
			};
		},

		clear(): void {
			handlers.clear();
		},
	};
}
