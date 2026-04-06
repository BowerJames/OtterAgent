import type { UIProvider as IUIProvider } from "../interfaces/ui-provider.js";
import { createNoOpUIProvider } from "./no-op-ui-provider.js";

export { createNoOpUIProvider } from "./no-op-ui-provider.js";

/**
 * Namespace providing factory methods for built-in {@link IUIProvider}
 * implementations. The empty interface extension below enables TypeScript
 * declaration merging so `UIProvider` is both a type (the full interface)
 * and a value (the namespace with factory methods) in a single export.
 *
 * @example
 * ```typescript
 * import { UIProvider } from "@otter-agent/core";
 * const ui: UIProvider = UIProvider.noOp();
 * ```
 */
// Empty interface extension enables declaration merging with the namespace below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UIProvider extends IUIProvider {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace UIProvider {
	/**
	 * Creates a no-op {@link IUIProvider} that returns sensible defaults
	 * for all methods. Useful as a fallback when no real UI is available.
	 */
	export function noOp(): IUIProvider {
		return createNoOpUIProvider();
	}
}
