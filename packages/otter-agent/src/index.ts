// OtterAgent interfaces
export type {
	AgentEnvironmentTemplate,
	AuthStorageTemplate,
	ComponentTemplate,
	Entry,
	EntryId,
	ReadonlySessionManager,
	ResourceLoader,
	SessionContext,
	SessionManagerTemplate,
	SkillDefinition,
	SkillSupportedAgentEnvironment,
	ToolDefinition,
} from "./interfaces/index.js";
export { isSkillSupportedAgentEnvironment } from "./interfaces/index.js";

// Built-in AgentEnvironment implementations.
// AgentEnvironment is exported as both a type (the interface) and a value
// (namespace with factory methods) via declaration merging in environments/agent-environment.ts.
export {
	AgentEnvironment,
	isJustBashAgentEnvironment,
	JustBashAgentEnvironment,
	JustBashAgentEnvironmentOptionsSchema,
	JustBashAgentEnvironmentTemplate,
	type JustBashAgentEnvironmentOptions,
	type JustBashToolName,
} from "./environments/index.js";
// Built-in UIProvider implementations.
// UIProvider is exported as both a type (the interface) and a value
// (namespace with factory methods) via declaration merging in ui-providers/index.ts.
export {
	UIProvider,
	NoOpUIProvider,
	RpcUIProvider,
	createNoOpUIProvider,
} from "./ui-providers/index.js";

// Built-in AuthStorage implementations.
// AuthStorage is exported as both a type (the interface) and a value
// (namespace with factory methods) via declaration merging in auth-storages/index.ts.
export {
	AuthStorage,
	InMemoryAuthStorage,
	InMemoryAuthStorageOptionsSchema,
	InMemoryAuthStorageTemplate,
	SqliteAuthStorage,
	SqliteAuthStorageOptionsSchema,
	SqliteAuthStorageTemplate,
	createInMemoryAuthStorage,
	createSqliteAuthStorage,
	type SqliteAuthStorageOptions,
} from "./auth-storages/index.js";

// Built-in SessionManager implementations.
// SessionManager is exported as both a type (the interface) and a value
// (namespace with factory methods) via declaration merging in session-managers/index.ts.
export {
	InMemorySessionManager,
	InMemorySessionManagerOptionsSchema,
	InMemorySessionManagerTemplate,
	createInMemorySessionManager,
	createSqliteSessionManager,
	SessionManager,
	SqliteSessionManager,
	SqliteSessionManagerOptionsSchema,
	SqliteSessionManagerTemplate,
	type SqliteSessionManagerOptions,
} from "./session-managers/index.js";

// ExtensionsAPI
export type {
	AgentEndEvent,
	AgentStartEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	CommandInfo,
	CommandOptions,
	CompactOptions,
	ContextEvent,
	ContextEventResult,
	ContextUsage,
	EventBus,
	Extension,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionEvent,
	ExtensionEventName,
	ExtensionHandler,
	ExtensionRunnerActions,
	ExtensionsAPI,
	InputEvent,
	InputEventResult,
	InputSource,
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	ProviderConfig,
	ProviderModelConfig,
	SessionBeforeCompactEvent,
	SessionBeforeCompactResult,
	SessionCompactEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	ToolCallEvent,
	ToolCallEventResult,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolInfo,
	ToolResultEvent,
	ToolResultEventResult,
	TurnEndEvent,
	TurnStartEvent,
} from "./extension-core/index.js";
export { createEventBus, ExtensionRunner } from "./extension-core/index.js";
export {
	ComponentConfigValidationError,
	validateComponentConfig,
	validateComponentConfigOnly,
} from "./extension-core/index.js";

// AgentSession
export {
	AgentSession,
	buildSystemPrompt,
	buildToolSection,
	convertToLlm,
	createAgentSession,
	createAgentSessionFromResourceLoader,
	createCompactionSummaryMessage,
	createCustomMessage,
	ModelRegistry,
	wrapToolDefinition,
} from "./session/index.js";
export type {
	AgentSessionEvent,
	AgentSessionOptions,
	BuildSystemPromptOptions,
	CompactionSummaryMessage,
	CreateAgentSessionOptions,
	CreateAgentSessionResult,
	CustomMessage,
} from "./session/index.js";

// RPC handler and factory
export { RpcHandler, createRpcSession } from "./rpc/index.js";
export type {
	RpcHandlerOptions,
	CreateRpcSessionOptions,
	CreateRpcSessionResult,
} from "./rpc/index.js";

// RPC protocol
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
	SteerCommand,
} from "./rpc/index.js";
