import { parseArgs } from "node:util";

export type ParsedArgs =
	| { command: "run"; configPath: string; mode: string }
	| { command: "help" }
	| { command: "version" };

const HELP = `
Usage: otter <command> [options]

Commands:
  run --config <path> [mode]  Run the agent with a config file.
                               mode defaults to "rpc".
  help                        Show this help message.
  version                     Print the version and exit.

Options:
  --config <path>   Path to the config file (JSON or YAML). Required for "run".
  --help, -h        Show this help message.
  --version, -v     Print the version and exit.
`.trim();

export function printHelp(): void {
	console.log(HELP);
}

export function parseCliArgs(argv: string[]): ParsedArgs {
	// No args or help/version flags → handle immediately
	if (argv.length === 0) {
		printHelp();
		process.exit(0);
	}

	// Bare "help" or "version" as positional arg
	if (argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
		return { command: "help" };
	}
	if (argv[0] === "version" || argv[0] === "--version" || argv[0] === "-v") {
		return { command: "version" };
	}

	// "run" subcommand
	if (argv[0] === "run") {
		const rest = argv.slice(1);

		const { values, positionals } = parseArgs({
			args: rest,
			options: {
				config: { type: "string" },
			},
			strict: true,
			allowPositionals: true,
		});

		const configPath = values.config as string | undefined;
		if (!configPath) {
			console.error('Error: "run" requires --config <path>.');
			console.error("Usage: otter run --config <path> [mode]");
			process.exit(1);
		}

		const mode = positionals[0] ?? "rpc";
		if (mode !== "rpc") {
			console.error(`Error: unsupported mode "${mode}". Only "rpc" is supported.`);
			process.exit(1);
		}

		return { command: "run", configPath, mode };
	}

	// Unknown subcommand
	console.error(`Error: unknown command "${argv[0]}".`);
	console.error('Run "otter help" for usage information.');
	process.exit(1);
}
