/**
 * RPC UIProvider — bridges extension UI calls to the RPC transport.
 *
 * When an extension calls a UIProvider method (dialog, confirm, input,
 * select, notify), this implementation emits an `extension_ui_request`
 * message over the transport and waits for the matching
 * `extension_ui_response` from the client.
 *
 * Follows the same UUID-based pending-promise pattern as pi-coding-agent.
 */
import type { UIProvider } from "../interfaces/ui-provider.js";
import type { ExtensionUIRequest, ExtensionUIResponse, RpcTransport } from "../rpc/types.js";

interface PendingRequest {
	resolve: (response: ExtensionUIResponse) => void;
	reject: (error: Error) => void;
}

export class RpcUIProvider implements UIProvider {
	private readonly _transport: RpcTransport;
	private readonly _pending = new Map<string, PendingRequest>();

	constructor(transport: RpcTransport) {
		this._transport = transport;
	}

	private _createDialogPromise<T>(
		request: ExtensionUIRequest,
		extract: (response: ExtensionUIResponse) => T,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this._pending.set(request.id, {
				resolve: (response) => resolve(extract(response)),
				reject,
			});
			this._transport.send(request);
		});
	}

	dialog(title: string, body: string): Promise<void> {
		const id = crypto.randomUUID();
		return this._createDialogPromise(
			{ type: "extension_ui_request", id, method: "dialog", title, body },
			() => undefined,
		);
	}

	confirm(title: string, body: string): Promise<boolean> {
		const id = crypto.randomUUID();
		return this._createDialogPromise(
			{ type: "extension_ui_request", id, method: "confirm", title, body },
			(r) => (r.cancelled ? false : (r.confirmed ?? false)),
		);
	}

	input(title: string, placeholder?: string): Promise<string | undefined> {
		const id = crypto.randomUUID();
		return this._createDialogPromise(
			{ type: "extension_ui_request", id, method: "input", title, placeholder },
			(r) => (r.cancelled ? undefined : r.value),
		);
	}

	select<T>(title: string, items: T[]): Promise<T | undefined> {
		const id = crypto.randomUUID();
		return this._createDialogPromise(
			{ type: "extension_ui_request", id, method: "select", title, items },
			(r) => {
				if (r.cancelled) return undefined;
				if (r.value === undefined) return undefined;
				const index = Number(r.value);
				if (!Number.isNaN(index) && index >= 0 && index < items.length) {
					return items[index];
				}
				return undefined;
			},
		);
	}

	notify(message: string, type?: "info" | "warning" | "error"): void {
		const id = crypto.randomUUID();
		// Fire-and-forget — no response expected
		this._transport.send({
			type: "extension_ui_request",
			id,
			method: "notify",
			message,
			notifyType: type,
		});
	}

	resolveResponse(response: ExtensionUIResponse): void {
		const entry = this._pending.get(response.id);
		if (entry) {
			this._pending.delete(response.id);
			entry.resolve(response);
		}
	}

	rejectAll(reason: string): void {
		const error = new Error(reason);
		for (const entry of this._pending.values()) {
			entry.reject(error);
		}
		this._pending.clear();
	}
}

/**
 * Create a UIProvider that bridges extension UI calls to an RPC transport.
 *
 * Call `resolveResponse()` when an `extension_ui_response` arrives from
 * the client. Call `rejectAll()` during shutdown to clean up pending
 * requests.
 */
export function createRpcUIProvider(transport: RpcTransport): {
	uiProvider: RpcUIProvider;
	resolveResponse: (response: ExtensionUIResponse) => void;
	rejectAll: (reason: string) => void;
} {
	const provider = new RpcUIProvider(transport);
	return {
		uiProvider: provider,
		resolveResponse: (response) => provider.resolveResponse(response),
		rejectAll: (reason) => provider.rejectAll(reason),
	};
}
