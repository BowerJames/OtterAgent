# @otter-agent/core

An extensible AI agent framework for building conversational agents with pluggable environments, session management, and extensions.

Built on top of [`@mariozechner/pi-agent-core`](https://github.com/mariozechner/pi-coding-agent) and [`@mariozechner/pi-ai`](https://github.com/mariozechner/pi-coding-agent).

## Installation

### npm (from registry)

Requires an npm account with access to the `@otter-agent` scope.

```bash
npm install @otter-agent/core
```

### GitHub dependency (works without an npm account)

```bash
npm install github:BowerJames/OtterAgent#packages/core
```

### Local / monorepo workspace

In your `package.json`:

```json
{
  "dependencies": {
    "@otter-agent/core": "*"
  }
}
```

> **Note:** When `@otter-agent/core` is published to npm, replace `"*"` with a proper semver range (e.g. `"^0.0.1"`).

## Quick Start

```typescript
import {
  createInMemorySessionManager,
  createInMemoryAuthStorage,
  AgentEnvironment,
  createAgentSession,
} from "@otter-agent/core";

// 1. Create pluggable components
const sessionManager = createInMemorySessionManager();
const authStorage = createInMemoryAuthStorage({
  anthropic: process.env.ANTHROPIC_API_KEY!,
});
const environment = AgentEnvironment.justBash({ cwd: "/workspace" });

// 2. Create an agent session
const { session } = await createAgentSession({
  sessionManager,
  authStorage,
  environment,
  systemPrompt: "You are a helpful assistant.",
});

// 3. Subscribe to events
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// 4. Send a prompt
await session.prompt("Hello! What can you do?");
```

## Core Concepts

### Pluggable Components

Everything is an interface — swap implementations to match your use case:

| Interface | Built-in implementations | Purpose |
|---|---|---|
| `SessionManager` | `InMemorySessionManager`, `SqliteSessionManager` | Persists conversation history |
| `AuthStorage` | `InMemoryAuthStorage`, `SqliteAuthStorage` | Retrieves API keys |
| `AgentEnvironment` | `JustBashAgentEnvironment` | Provides tools and environment context |
| `UIProvider` | `NoOpUIProvider`, `RpcUIProvider` | Extension-to-user interaction |

Each built-in has a `ComponentTemplate` for config-driven instantiation.

### Extensions

Extensions hook into the agent lifecycle via events, register tools and commands, and communicate with each other:

```typescript
import type { Extension } from "@otter-agent/core";

const myExtension: Extension = (api) => {
  api.on("session_start", () => {
    console.log("Agent session started!");
  });

  api.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Does something useful.",
    parameters: { type: "object", properties: {} },
    execute: async (id, params, signal, onUpdate) => ({
      content: [{ type: "text", text: "Result!" }],
    }),
  });
};
```

### RPC Mode

Run the agent as a headless service over JSON-RPC:

```typescript
import { createRpcSession, RpcTransport } from "@otter-agent/core";

// Implement RpcTransport to connect to your frontend (TUI, web UI, etc.)
const transport: RpcTransport = {
  send(message) { /* send to client */ },
  onMessage(handler) { /* listen for client messages */ },
};

const { handler } = await createRpcSession({
  transport,
  sessionManager,
  authStorage,
  environment,
  model,
  systemPrompt: "You are a helpful assistant.",
});

handler.start();
```

Or use the bundled CLI:

```bash
otter \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --session-manager in-memory \
  --agent-environment just-bash
```

## License

MIT
