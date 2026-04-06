// Public API for programmatic use of the CLI package.
export { main } from "./main.js";
export { runRpcMode } from "./rpc/rpc-mode.js";
export { StdioTransport } from "./rpc/stdio-transport.js";
export { attachJsonlLineReader, serializeJsonLine } from "./rpc/jsonl.js";
