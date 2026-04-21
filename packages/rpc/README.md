# @otter-agent/rpc

RPC protocol and CLI entry point for OtterAgent.

Provides the `otter` binary and all infrastructure needed to run an OtterAgent session over stdio using the JSONL-based RPC protocol.

## Usage

Install the package and run the CLI:

```bash
npx @otter-agent/rpc --provider openai --model gpt-4 --api-key sk-... \
  --session-manager-config path/to/session.json \
  --agent-environment-config path/to/environment.json
```

## Exports

- **`RpcHandler`** — Dispatches RPC commands to an `AgentSession`
- **`createRpcSession`** — Factory that wires up session, handler, and UI provider
- **`RpcUIProvider`** / **`createRpcUIProvider`** — Bridges extension UI calls to the RPC transport
- **Protocol types** — `RpcCommand`, `RpcResponse`, `RpcTransport`, etc.
