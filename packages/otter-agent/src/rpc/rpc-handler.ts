/**
 * RpcHandler — dispatches RPC commands to an AgentSession and forwards
 * events back over an abstract transport.
 *
 * Follows the same patterns as pi-coding-agent's `runRpcMode()`:
 * - `prompt` is fire-and-forget (returns success immediately, events stream async)
 * - All other commands are awaited before responding
 * - Events are forwarded 1:1 from session to transport
 * - Extension UI responses are routed to the RPC UIProvider
 * - Shutdown triggers a graceful sequence: abort → waitForIdle → dispose → stop
 */
import type { AgentSession, AgentSessionEvent } from "../session/agent-session.js";
import type {
	ExtensionUIResponse,
	RpcCommand,
	RpcInboundMessage,
	RpcOutboundMessage,
	RpcResponse,
	RpcSessionState,
	RpcTransport,
} from "./types.js";

/** Maximum time to wait for the agent to settle during graceful shutdown (ms). */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 120_000;

export interface RpcHandlerOptions {
	session: AgentSession;
	transport: RpcTransport;
	/** Resolves an extension UI response arriving from the client. */
	resolveUIResponse: (response: ExtensionUIResponse) => void;
	/** Rejects all pending extension UI requests (used during shutdown). */
	rejectAllUI: (reason: string) => void;
	/** Called when graceful shutdown completes (after abort → idle → dispose → stop). */
	onShutdown?: () => void;
}

export class RpcHandler {
	private readonly _session: AgentSession;
	private readonly _transport: RpcTransport;
	private readonly _resolveUIResponse: (response: ExtensionUIResponse) => void;
	private readonly _rejectAllUI: (reason: string) => void;
	private readonly _onShutdown?: () => void;
	private _unsubscribeSession: (() => void) | undefined;
	private _shutdownRequested = false;
	private _shutdownInProgress = false;
	private _resolveShutdown: (() => void) | undefined;
	private _shutdownPromise: Promise<void> | undefined;
	private _shutdownTimer: ReturnType<typeof setTimeout> | undefined;
	private _waitForIdleTimer: ReturnType<typeof setTimeout> | undefined;
	private _lastState: RpcSessionState | undefined;

	constructor(options: RpcHandlerOptions) {
		this._session = options.session;
		this._transport = options.transport;
		this._resolveUIResponse = options.resolveUIResponse;
		this._rejectAllUI = options.rejectAllUI;
		this._onShutdown = options.onShutdown;
	}

	/** Start listening for commands and forwarding events. */
	start(): void {
		// Capture initial state
		this._lastState = this._snapshotState();

		// Forward all session events to the transport, with state change detection
		this._unsubscribeSession = this._session.subscribe((event: AgentSessionEvent) => {
			this._transport.send({
				type: "event",
				event: event.type,
				payload: event,
			});
			this._checkStateChange();
		});

		// Handle incoming messages
		this._transport.onMessage((message: RpcInboundMessage) => {
			if (message.type === "extension_ui_response") {
				this._resolveUIResponse(message as ExtensionUIResponse);
				return;
			}
			this._handleCommand(message).catch((err) => {
				this._send(
					this._error(
						(message as { id?: string }).id,
						(message as { type: string }).type,
						String(err),
					),
				);
			});
		});
	}

	/** Stop the handler, reject pending UI requests, and clean up. */
	stop(): void {
		this._rejectAllUI("RPC handler stopped");
		this._unsubscribeSession?.();
		this._unsubscribeSession = undefined;
		this._transport.close?.();
	}

	// ─── Command Dispatch ────────────────────────────────────────────

	private async _handleCommand(command: RpcCommand): Promise<void> {
		switch (command.type) {
			case "prompt": {
				if (!command.message) {
					this._send(this._error(command.id, "prompt", "Missing required field: message"));
					break;
				}
				// Fire-and-forget — don't await, events stream async
				this._session
					.prompt(command.message, command.images)
					.catch((e) =>
						this._send(
							this._error(command.id, "prompt", e instanceof Error ? e.message : String(e)),
						),
					);
				this._send(this._success(command.id, "prompt"));
				break;
			}

			case "steer": {
				if (!command.message) {
					this._send(this._error(command.id, "steer", "Missing required field: message"));
					break;
				}
				this._session.steer({
					role: "user",
					content: command.message,
					timestamp: Date.now(),
				} as Parameters<typeof this._session.steer>[0]);
				this._send(this._success(command.id, "steer"));
				break;
			}

			case "follow_up": {
				if (!command.message) {
					this._send(this._error(command.id, "follow_up", "Missing required field: message"));
					break;
				}
				this._session.followUp({
					role: "user",
					content: command.message,
					timestamp: Date.now(),
				} as Parameters<typeof this._session.followUp>[0]);
				this._send(this._success(command.id, "follow_up"));
				break;
			}

			case "abort": {
				this._session.abort();
				this._send(this._success(command.id, "abort"));
				break;
			}

			case "set_model": {
				if (!command.provider || !command.modelId) {
					this._send(
						this._error(command.id, "set_model", "Missing required fields: provider, modelId"),
					);
					break;
				}
				const model = this._session.modelRegistry.find(command.provider, command.modelId);
				if (!model) {
					this._send(
						this._error(
							command.id,
							"set_model",
							`Unknown model: ${command.provider}/${command.modelId}`,
						),
					);
					break;
				}
				const ok = await this._session.setModel(model);
				if (!ok) {
					this._send(this._error(command.id, "set_model", "No API key available for model"));
					break;
				}
				this._send(
					this._success(command.id, "set_model", {
						provider: command.provider,
						modelId: command.modelId,
					}),
				);
				break;
			}

			case "set_thinking_level": {
				if (!command.level) {
					this._send(
						this._error(command.id, "set_thinking_level", "Missing required field: level"),
					);
					break;
				}
				this._session.setThinkingLevel(command.level);
				this._send(this._success(command.id, "set_thinking_level"));
				break;
			}

			case "compact": {
				await this._session.compact(command.customInstructions);
				this._send(this._success(command.id, "compact"));
				break;
			}

			case "get_state": {
				this._send(this._success(command.id, "get_state", this._snapshotState()));
				break;
			}

			case "get_commands": {
				const commands = this._session.extensionRunner.getCommands();
				this._send(
					this._success(command.id, "get_commands", {
						commands: commands.map((c) => ({
							name: c.name,
							description: c.description,
						})),
					}),
				);
				break;
			}

			case "shutdown": {
				this.requestShutdown();
				// Wait for the graceful shutdown sequence to complete before responding.
				await this._shutdownPromise;
				this._send(this._success(command.id, "shutdown"));
				break;
			}

			default: {
				// Try extension command registry before returning error
				await this._tryExtensionCommand(command);
			}
		}

		this._checkShutdown();
	}

	/**
	 * Attempt to dispatch an unknown command type to the extension command registry.
	 * If no matching extension command is found, return an error response.
	 */
	private async _tryExtensionCommand(command: Record<string, unknown>): Promise<void> {
		const type = command.type as string;
		const id = command.id as string | undefined;
		const args = typeof command.args === "string" ? command.args : "";
		const handled = await this._session.extensionRunner.executeCommand(type, args);
		if (handled) {
			this._send(this._success(id, type));
		} else {
			this._send(this._error(id, type, `Unknown command type: ${type}`));
		}
	}

	// ─── Shutdown ────────────────────────────────────────────────────

	/** Request graceful shutdown (abort → idle → dispose → stop). */
	requestShutdown(): void {
		if (this._shutdownRequested) return;
		this._shutdownRequested = true;
		this._shutdownPromise = new Promise<void>((resolve) => {
			this._resolveShutdown = resolve;
		});
		this._shutdownTimer = setTimeout(() => this._onShutdownTimeout(), GRACEFUL_SHUTDOWN_TIMEOUT_MS);
		this._checkShutdown();
	}

	private _onShutdownTimeout(): void {
		// If shutdown is still in progress after the timeout, force cleanup.
		// This should not normally happen since _performGracefulShutdown has
		// its own per-step timeout, but serves as a last-resort safety net.
		if (this._shutdownInProgress) {
			this.stop();
			this._onShutdown?.();
			this._resolveShutdown?.();
		}
	}

	private _checkShutdown(): void {
		if (this._shutdownRequested && !this._shutdownInProgress) {
			this._shutdownInProgress = true;
			this._performGracefulShutdown().catch(() => {
				// If graceful shutdown fails (e.g., waitForIdle rejects),
				// force cleanup anyway.
				clearTimeout(this._waitForIdleTimer);
				clearTimeout(this._shutdownTimer);
				this.stop();
				this._onShutdown?.();
				this._resolveShutdown?.();
			});
		}
	}

	/**
	 * Perform the graceful shutdown sequence:
	 * 1. Abort any in-flight agent turn
	 * 2. Wait for the agent to settle (with timeout safety net)
	 * 3. Dispose the session (fires session_shutdown event for extensions)
	 * 4. Resolve the shutdown promise (unblocks awaiting command handler)
	 * 5. Clean up transport and reject pending UI (after response is sent)
	 * 6. Notify the caller (may trigger process.exit in CLI mode)
	 */
	private async _performGracefulShutdown(): Promise<void> {
		// 1. Abort any in-flight agent turn
		if (this._session.agent.state.isStreaming) {
			this._session.abort();
		}

		// 2. Wait for the agent to settle (with timeout safety net)
		const idlePromise = this._session.waitForIdle().then(
			() => {
				clearTimeout(this._waitForIdleTimer);
				this._waitForIdleTimer = undefined;
			},
			() => {
				clearTimeout(this._waitForIdleTimer);
				this._waitForIdleTimer = undefined;
			},
		);
		const timeoutPromise = new Promise<void>((_, reject) => {
			this._waitForIdleTimer = setTimeout(
				() => reject(new Error("Graceful shutdown timed out")),
				GRACEFUL_SHUTDOWN_TIMEOUT_MS,
			);
		});
		await Promise.race([idlePromise, timeoutPromise]).catch(() => {
			// Timeout or error — proceed with cleanup anyway
		});

		// 3. Dispose the session (fires session_shutdown event for extensions)
		await this._session.dispose();

		// 4. Clear timers and resolve the shutdown promise so the awaiting
		//    command handler can send its response.
		clearTimeout(this._shutdownTimer);
		this._shutdownTimer = undefined;
		clearTimeout(this._waitForIdleTimer);
		this._waitForIdleTimer = undefined;
		this._resolveShutdown?.();

		// 5. Wait a microtask tick so the command handler can send the
		//    shutdown response before we close the transport.
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// 6. Clean up transport and reject pending UI
		this.stop();

		// 7. Notify the caller (may trigger process.exit in CLI mode)
		this._onShutdown?.();
	}

	// ─── State Change Detection ─────────────────────────────────────

	private _snapshotState(): RpcSessionState {
		const model = this._session.agent.state.model;
		return {
			model: model ? { provider: model.provider, modelId: model.id } : undefined,
			thinkingLevel: this._session.agent.state.thinkingLevel,
			isStreaming: this._session.agent.state.isStreaming,
			messageCount: this._session.agent.state.messages.length,
			pendingMessageCount: this._session.agent.hasQueuedMessages() ? 1 : 0,
		};
	}

	private _checkStateChange(): void {
		const current = this._snapshotState();
		if (!this._lastState) {
			this._lastState = current;
			return;
		}
		if (
			current.isStreaming !== this._lastState.isStreaming ||
			current.thinkingLevel !== this._lastState.thinkingLevel ||
			current.model?.provider !== this._lastState.model?.provider ||
			current.model?.modelId !== this._lastState.model?.modelId ||
			current.messageCount !== this._lastState.messageCount
		) {
			this._lastState = current;
			this._transport.send({
				type: "event",
				event: "state_change",
				payload: current,
			});
		}
	}

	// ─── Helpers ─────────────────────────────────────────────────────

	private _send(message: RpcOutboundMessage): void {
		this._transport.send(message);
	}

	private _success(id: string | undefined, command: string, data?: unknown): RpcResponse {
		return { type: "response", id, command, success: true, data };
	}

	private _error(id: string | undefined, command: string, error: string): RpcResponse {
		return { type: "response", id, command, success: false, error };
	}
}
