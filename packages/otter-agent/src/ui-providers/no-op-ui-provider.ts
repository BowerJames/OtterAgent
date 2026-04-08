import type { UIProvider } from "../interfaces/ui-provider.js";

export class NoOpUIProvider implements UIProvider {
	async dialog(_title: string, _body: string): Promise<void> {}

	async confirm(_title: string, _body: string): Promise<boolean> {
		return false;
	}

	async input(_title: string, _placeholder?: string): Promise<string | undefined> {
		return undefined;
	}

	async select<T>(_title: string, _items: T[]): Promise<T | undefined> {
		return undefined;
	}

	notify(_message: string, _type?: "info" | "warning" | "error"): void {}
}

/**
 * Creates a new no-op {@link UIProvider} that returns sensible defaults
 * for all methods. Useful as a fallback when no real UI is available.
 *
 * - `dialog` resolves immediately
 * - `confirm` returns `false`
 * - `input` returns `undefined`
 * - `select` returns `undefined`
 * - `notify` is a no-op
 */
export function createNoOpUIProvider(): NoOpUIProvider {
	return new NoOpUIProvider();
}
