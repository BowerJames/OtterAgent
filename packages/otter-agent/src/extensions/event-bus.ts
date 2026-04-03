/**
 * Shared event bus for extension-to-extension communication.
 *
 * Untyped by design — extensions define their own event contracts.
 */
export interface EventBus {
	/** Emit an event on a named channel. */
	emit(channel: string, data: unknown): void;

	/** Subscribe to a named channel. Returns an unsubscribe function. */
	on(channel: string, handler: (data: unknown) => void): () => void;
}
