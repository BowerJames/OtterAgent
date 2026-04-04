// OtterAgent interfaces
export type {
	AgentEnvironment,
	AuthStorage,
	EntryId,
	ReadonlySessionManager,
	SessionManager,
	ToolDefinition,
	UIProvider,
} from "./interfaces/index.js";
export { noOpUIProvider } from "./interfaces/ui.js";

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
} from "./extensions/index.js";
export { createEventBus, ExtensionRunner } from "./extensions/index.js";

// AgentSession
export {
	AgentSession,
	buildSystemPrompt,
	buildToolSection,
	convertToLlm,
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
	CustomMessage,
} from "./session/index.js";

// Re-exports from pi-agent-core
export type {
	AgentContext,
	AgentEvent,
	AgentMessage,
	AgentState,
	AgentTool,
	AgentToolCall,
	AgentToolResult,
	AgentToolUpdateCallback,
	AfterToolCallContext,
	AfterToolCallResult,
	BeforeToolCallContext,
	BeforeToolCallResult,
	ThinkingLevel,
	ToolExecutionMode,
} from "@mariozechner/pi-agent-core";
