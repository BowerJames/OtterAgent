---
name: add-implementation
description: Add a built-in implementation of an interface in OtterAgent. Use when implementing a new built-in for an existing interface (e.g. a new SessionManager, AuthStorage, or UIProvider).
---

Follow this pattern exactly when adding a built-in implementation of an OtterAgent interface.

## Folder Structure

Implementations of a given interface live together in a dedicated folder:

```
src/
  <interface-name-plural>/         e.g. session-managers/, auth-storages/
    <impl-name>.ts                 e.g. in-memory-session-manager.ts
    <impl-name>.test.ts            e.g. in-memory-session-manager.test.ts
    index.ts                       namespace + re-exports for the whole folder
```

If the folder already exists (other implementations are present), add the new `.ts` and `.test.ts` files alongside them and add the new factory to the existing `index.ts` namespace.

## 1. Implementation File (`<impl-name>.ts`)

- Define the implementation as a **class that is NOT exported**.
- Export only a `createXxx(): InterfaceType` factory function.
- The class must explicitly `implements` the interface so TypeScript enforces completeness.

```typescript
// src/session-managers/in-memory-session-manager.ts

import type { SessionManager } from "../interfaces/session-manager.js";

class InMemorySessionManager implements SessionManager {
  // ... implementation
}

/**
 * Creates an in-memory {@link SessionManager} with no filesystem persistence.
 */
export function createInMemorySessionManager(): SessionManager {
  return new InMemorySessionManager();
}
```

## 2. Namespace / Index File (`index.ts`)

This file does two things:
1. Re-exports the factory function(s) from implementation files.
2. Declares a **namespace** whose name matches the interface, merged with an empty interface extension. This makes the interface name serve as both a **type** and a **value** (the namespace) from a single import.

```typescript
// src/session-managers/index.ts

import type { SessionManager as ISessionManager } from "../interfaces/session-manager.js";
import { createInMemorySessionManager } from "./in-memory-session-manager.js";

export { createInMemorySessionManager } from "./in-memory-session-manager.js";

// Empty interface extension enables TypeScript declaration merging with the
// namespace below. Consumers get SessionManager as both a type and a value.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionManager extends ISessionManager {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SessionManager {
  export function inMemory(): ISessionManager {
    return createInMemorySessionManager();
  }

  // Add new built-ins here as additional methods on the same namespace.
  // export function sqlite(path: string): ISessionManager { ... }
}
```

**Why the empty interface?** TypeScript does not allow merging a namespace with a plain type alias or an imported interface re-export. The empty `interface Xxx extends IXxx {}` declares a *local* interface that TypeScript can merge with the namespace in the same file.

## 3. Root Barrel (`src/index.ts`)

Export the namespace from the implementations index. A single `export { Xxx }` is enough — TypeScript carries both the type (via the merged interface) and the value (the namespace) through one export.

**Do NOT also add a separate `export type { Xxx }` for the same name** — this causes `TS2300: Duplicate identifier`.

```typescript
// src/index.ts

// Remove the interface from the plain type export block if it was there:
export type {
  AgentEnvironment,
  AuthStorage,
  // SessionManager,   ← moved to session-managers export below
  ToolDefinition,
  UIProvider,
} from "./interfaces/index.js";

// Add the namespace export — carries both the type and the factory value:
export { SessionManager } from "./session-managers/index.js";
```

If the interface was previously exported as `export type { Xxx }` from `interfaces/index.js`, remove it from that block and replace it with the single `export { Xxx }` from the implementations folder.

## 4. Consumer Usage

After wiring, consumers get a clean API with a single import:

```typescript
import { SessionManager } from "@otter-agent/core";

// As a type:
function accepts(sm: SessionManager) { ... }

// As a factory:
const sm = SessionManager.inMemory();
```

## 5. Tests

Place tests in `<impl-name>.test.ts` alongside the implementation. Tests should be comprehensive and cover:
- Every interface method: returns a unique `EntryId`, correct data stored/excluded
- `buildSessionContext()` (or equivalent read method): correct output for all scenarios
- Edge cases specific to the implementation
- The namespace factory method (e.g. `SessionManager.inMemory()`) produces a working, independent instance

## Reference Implementation

See `src/session-managers/` for the canonical worked example:
- `in-memory-session-manager.ts` — class + factory
- `index.ts` — namespace merging
- `in-memory-session-manager.test.ts` — 33 tests covering all interface methods and edge cases
