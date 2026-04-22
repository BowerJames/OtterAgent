// OtterAgent interfaces
export type {
	AgentEnvironment,
	AgentEnvironmentTemplate,
	AuthStorageTemplate,
	ComponentTemplate,
	Entry,
	EntryId,
	ReadonlySessionManager,
	ResourceLoader,
	SessionContext,
	SessionManager,
	SessionManagerTemplate,
	SkillDefinition,
	SkillSupportedAgentEnvironment,
	ToolDefinition,
	UIProvider,
} from "./interfaces/index.js";
export { isSkillSupportedAgentEnvironment } from "./interfaces/index.js";

// Default environment extension — wires any AgentEnvironment into the extension system.
export { createEnvironmentExtension } from "./environment/environment-extension.js";

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
