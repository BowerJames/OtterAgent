# OtterAgent Development Guide

This project is heavily inspired by [`@mariozechner/pi-coding-agent`](https://github.com/mariozechner/pi-coding-agent), which is included as a dev dependency. Its source code and documentation should be explored whenever planning new features or edits to understand patterns, architecture, and best practices.

## Additional Development CLI Tools

- `gh` - GitHub CLI. Used for GitHub operations (creating PRs, viewing issues, etc.).
- `tmux` - tmux is a terminal multiplexer: it enables a number of terminals to be created, accessed, and controlled from a single screen. tmux may be detached from a screen and continue running in the background, then later reattached. 

## Repository Structure

This is a Bun monorepo using workspaces. Packages live under `packages/`.

## Setup

```bash
bun install
```

## Build

Build all packages:

```bash
bun run build
```

Build a specific package:

```bash
cd packages/otter-agent
bun run build
```

## Test

Run all tests:

```bash
bun run test
```

Run tests for a specific package:

```bash
cd packages/otter-agent
bun test
```

## Lint

Check for lint and formatting issues:

```bash
bun run lint
```

Auto-fix lint and formatting issues:

```bash
bun run lint:fix
```

## Format

Format all files:

```bash
bun run format
```

## Code Review
To launch an independent code review run:

```bash
mypi --profile reviewer "/review <issue_number> <target_branch>"
```

Where <issue_number> is the number of the issue being reviewed and <target_branch> is the name of the branch the work has been done on.

The code review can take a long time so provide a timeout of 1000 seconds.

## Conventions

- **ESM-only** — all packages use `"type": "module"`
- **Strict TypeScript** — `strict: true` is enabled in all tsconfigs
- **Biome** — used for linting and formatting (tabs, double quotes, semicolons)
- Each package has its own `tsconfig.json` extending the root config
- Build output goes to `dist/` in each package
