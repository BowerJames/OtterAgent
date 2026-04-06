#!/usr/bin/env node
import { main } from "./main.js";

main(process.argv.slice(2)).catch((err) => {
	process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
