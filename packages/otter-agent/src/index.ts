// OtterAgent interfaces
export type {
	AgentEnvironment,
	AuthStorage,
	EntryId,
	SessionManager,
	ToolDefinition,
	UIProvider,
} from "./interfaces/index.js";

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
