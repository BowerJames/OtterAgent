import type { UIProvider as IUIProvider } from "../interfaces/ui-provider.js";
import type { ExtensionUIResponse, RpcTransport } from "../rpc/types.js";
import { createNoOpUIProvider } from "./no-op-ui-provider.js";
import { createRpcUIProvider } from "./rpc-ui-provider.js";

export { createNoOpUIProvider } from "./no-op-ui-provider.js";

/**
 * Namespace providing factory methods for built-in {@link IUIProvider}
 * implementations. The empty interface extension below enables TypeScript
 * declaration merging with the namespace below, so `UIProvider` is both a
 * type (the full interface) and a value (the namespace with factory methods)
 * in a single export.
 *
 * @example
 * ```typescript
 * import { UIProvider } from "@otter-agent/core";
 * const ui: UIProvider = UIProvider.noOp();
 * const { uiProvider, resolveResponse, rejectAll } = UIProvider.rpc(transport);
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

	/**
	 * Creates a {@link IUIProvider} that bridges extension UI calls to an
	 * RPC transport. Call `resolveResponse()` when an `extension_ui_response`
	 * arrives from the client. Call `rejectAll()` during shutdown to clean up
	 * pending requests.
	 */
	export function rpc(transport: RpcTransport): {
		uiProvider: IUIProvider;
		resolveResponse: (response: ExtensionUIResponse) => void;
		rejectAll: (reason: string) => void;
	} {
		return createRpcUIProvider(transport);
	}
}
