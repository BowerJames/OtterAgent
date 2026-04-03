# OtterAgent Development Guide

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

## Conventions

- **ESM-only** — all packages use `"type": "module"`
- **Strict TypeScript** — `strict: true` is enabled in all tsconfigs
- **Biome** — used for linting and formatting (tabs, double quotes, semicolons)
- Each package has its own `tsconfig.json` extending the root config
- Build output goes to `dist/` in each package
