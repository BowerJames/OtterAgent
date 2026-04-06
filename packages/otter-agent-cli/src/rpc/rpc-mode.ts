import type { CreateRpcSessionOptions } from "@otter-agent/core";
import { createRpcSession } from "@otter-agent/core";
import { StdioTransport } from "./stdio-transport.js";

/**
 * Run the agent in RPC mode.
 *
 * Creates a StdioTransport, uses `createRpcSession()` to wire the session
 * and handler together with the UIProvider baked in at construction, then
 * blocks forever — the process exits only when killed externally.
 */
export async function runRpcMode(
	options: Omit<CreateRpcSessionOptions, "transport">,
): Promise<void> {
	const transport = new StdioTransport();
	const { handler } = await createRpcSession({ transport, ...options });

	handler.start();

	// Block forever — RPC mode runs until the process is killed.
	return new Promise(() => {});
}
