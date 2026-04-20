import { createRpcSession } from "../create-rpc-session.js";
import type { CreateRpcSessionOptions } from "../create-rpc-session.js";
import { StdioTransport } from "./stdio-transport.js";

/**
 * Run the agent in RPC mode.
 *
 * Creates a StdioTransport, uses `createRpcSession()` to wire the session
 * and handler together with the UIProvider baked in at construction, then
 * blocks until a graceful shutdown is triggered (via RPC command, stdin
 * close, or SIGTERM/SIGINT signal).
 */
export async function runRpcMode(
	options: Omit<CreateRpcSessionOptions, "transport">,
): Promise<void> {
	// Mutable ref so the StdioTransport callback can trigger shutdown
	// on the handler that is created after the transport.
	const ref = { handler: null as unknown as { requestShutdown(): void } };

	const transport = new StdioTransport(() => ref.handler.requestShutdown());

	let resolveShutdown: () => void;
	const shutdownPromise = new Promise<void>((resolve) => {
		resolveShutdown = resolve;
	});

	const { handler } = await createRpcSession({
		transport,
		...options,
		onShutdown: () => resolveShutdown(),
	});
	ref.handler = handler;
	handler.start();

	// Signal handlers for graceful shutdown
	const shutdown = () => handler.requestShutdown();
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	await shutdownPromise;
	// Graceful shutdown complete — exit cleanly
	process.exit(0);
}
