import type { RpcInboundMessage, RpcOutboundMessage, RpcTransport } from "@otter-agent/core";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.js";

/**
 * Concrete RpcTransport implementation over process.stdin / process.stdout.
 *
 * Inbound messages are read as strict JSONL from stdin.
 * Outbound messages are serialised as JSONL and written to stdout.
 *
 * Stdout is taken over at construction time: console.log and console.warn
 * are redirected to stderr so that stray log output cannot corrupt the
 * protocol stream.
 */
export class StdioTransport implements RpcTransport {
	private _detachReader: (() => void) | undefined;
	private _originalConsoleLog: typeof console.log;
	private _originalConsoleWarn: typeof console.warn;
	private _originalConsoleInfo: typeof console.info;

	constructor() {
		// Redirect console methods to stderr to protect the JSONL stream.
		this._originalConsoleLog = console.log;
		this._originalConsoleWarn = console.warn;
		this._originalConsoleInfo = console.info;
		console.log = (...args) => process.stderr.write(`[log] ${args.join(" ")}\n`);
		console.warn = (...args) => process.stderr.write(`[warn] ${args.join(" ")}\n`);
		console.info = (...args) => process.stderr.write(`[info] ${args.join(" ")}\n`);
	}

	onMessage(handler: (message: RpcInboundMessage) => void): void {
		this._detachReader = attachJsonlLineReader(process.stdin, (line) => {
			if (!line.trim()) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				// Silently discard malformed lines — callers can't recover from parse errors.
				return;
			}
			handler(parsed as RpcInboundMessage);
		});
	}

	send(message: RpcOutboundMessage): void {
		process.stdout.write(serializeJsonLine(message));
	}

	close(): void {
		this._detachReader?.();
		this._detachReader = undefined;

		// Restore console methods.
		console.log = this._originalConsoleLog;
		console.warn = this._originalConsoleWarn;
		console.info = this._originalConsoleInfo;
	}
}
