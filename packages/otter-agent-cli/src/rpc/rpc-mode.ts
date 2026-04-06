import { type AgentSession, RpcHandler } from "@otter-agent/core";
import { StdioTransport } from "./stdio-transport.js";

/**
 * Run the agent in RPC mode.
 *
 * Creates a StdioTransport, wires it to an RpcHandler, sets up the
 * UIProvider on the session, and blocks forever — the process exits
 * only when killed externally.
 */
export async function runRpcMode(session: AgentSession): Promise<void> {
	const transport = new StdioTransport();
	const handler = new RpcHandler({ session, transport });

	// Wire the UIProvider created by RpcHandler into the session so
	// that extensions loaded after session construction can use it.
	session.setUIProvider(handler.uiProvider);

	handler.start();

	// Block forever — RPC mode runs until the process is killed.
	return new Promise(() => {});
}
