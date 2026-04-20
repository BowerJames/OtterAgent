// RPC protocol types
export type {
	AbortCommand,
	CompactCommand,
	ExtensionUIConfirmRequest,
	ExtensionUIDialogRequest,
	ExtensionUIInputRequest,
	ExtensionUINotifyRequest,
	ExtensionUIRequest,
	ExtensionUIResponse,
	ExtensionUISelectRequest,
	FollowUpCommand,
	GetCommandsCommand,
	GetStateCommand,
	PromptCommand,
	RpcAgentEvent,
	RpcAgentEventName,
	RpcCommand,
	RpcCommandInfo,
	RpcCommandType,
	RpcErrorResponse,
	RpcExtensionEventName,
	RpcGetCommandsData,
	RpcInboundMessage,
	RpcOutboundMessage,
	RpcResponse,
	RpcResponseDataFor,
	RpcSessionState,
	RpcSetModelData,
	RpcSuccessResponse,
	RpcTransport,
	SetModelCommand,
	SetThinkingLevelCommand,
	ShutdownCommand,
	SteerCommand,
} from "./types.js";

// RPC handler and factory
export { RpcHandler } from "./rpc-handler.js";
export type { RpcHandlerOptions } from "./rpc-handler.js";

export { createRpcSession } from "./create-rpc-session.js";
export type {
	CreateRpcSessionOptions,
	CreateRpcSessionResult,
} from "./create-rpc-session.js";

// RPC UI provider
export { RpcUIProvider, createRpcUIProvider } from "./rpc-ui-provider.js";
