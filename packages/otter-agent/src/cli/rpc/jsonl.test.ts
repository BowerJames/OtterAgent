import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.js";

describe("serializeJsonLine", () => {
	test("serializes a simple object with a trailing newline", () => {
		const result = serializeJsonLine({ type: "ping" });
		expect(result).toBe('{"type":"ping"}\n');
	});

	test("serializes strings, numbers, and arrays", () => {
		expect(serializeJsonLine("hello")).toBe('"hello"\n');
		expect(serializeJsonLine(42)).toBe("42\n");
		expect(serializeJsonLine([1, 2])).toBe("[1,2]\n");
	});

	test("preserves Unicode separators inside strings", () => {
		// U+2028 (line separator) and U+2029 (paragraph separator) are valid JSON string chars
		// and must NOT be used as line boundaries.
		const value = { text: "line\u2028separator" };
		const line = serializeJsonLine(value);
		expect(line.endsWith("\n")).toBe(true);
		expect(JSON.parse(line.trimEnd())).toEqual(value);
	});
});

describe("attachJsonlLineReader", () => {
	function makeStream(chunks: string[]): NodeJS.ReadableStream {
		const emitter = new EventEmitter() as NodeJS.ReadableStream;
		// Emit asynchronously so listeners are attached first.
		setTimeout(() => {
			for (const chunk of chunks) {
				(emitter as EventEmitter).emit("data", Buffer.from(chunk));
			}
			(emitter as EventEmitter).emit("end");
		}, 0);
		return emitter;
	}

	test("emits one line per JSONL record", async () => {
		const lines: string[] = [];
		const stream = makeStream(['{"a":1}\n{"b":2}\n']);
		await new Promise<void>((resolve) => {
			attachJsonlLineReader(stream, (line) => {
				lines.push(line);
				if (lines.length === 2) resolve();
			});
		});
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});

	test("handles records split across multiple chunks", async () => {
		const lines: string[] = [];
		const stream = makeStream(['{"ty', 'pe":"ping"}\n']);
		await new Promise<void>((resolve) => {
			attachJsonlLineReader(stream, (line) => {
				lines.push(line);
				resolve();
			});
		});
		expect(lines).toEqual(['{"type":"ping"}']);
	});

	test("strips trailing \\r from CRLF input", async () => {
		const lines: string[] = [];
		const stream = makeStream(['{"type":"ping"}\r\n']);
		await new Promise<void>((resolve) => {
			attachJsonlLineReader(stream, (line) => {
				lines.push(line);
				resolve();
			});
		});
		expect(lines).toEqual(['{"type":"ping"}']);
	});

	test("does not split on Unicode line separators (U+2028)", async () => {
		const lines: string[] = [];
		const payload = JSON.stringify({ text: "line\u2028sep" });
		const stream = makeStream([`${payload}\n`]);
		await new Promise<void>((resolve) => {
			attachJsonlLineReader(stream, (line) => {
				lines.push(line);
				resolve();
			});
		});
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0])).toEqual({ text: "line\u2028sep" });
	});

	test("returns a cleanup function that stops further processing", async () => {
		const lines: string[] = [];
		const emitter = new EventEmitter() as NodeJS.ReadableStream;
		const detach = attachJsonlLineReader(emitter as NodeJS.ReadableStream, (line) => {
			lines.push(line);
		});
		detach();
		(emitter as EventEmitter).emit("data", Buffer.from('{"type":"ignored"}\n'));
		// Give any async callbacks a chance to fire.
		await new Promise((r) => setTimeout(r, 10));
		expect(lines).toHaveLength(0);
	});
});
