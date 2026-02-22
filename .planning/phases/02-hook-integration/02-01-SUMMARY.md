---
phase: 02-hook-integration
plan: "01"
subsystem: hook-infrastructure
tags: [hooks, zod, slack, types, build]
dependency_graph:
  requires: [01-slack-infrastructure-and-mcp-tool]
  provides: [hook-input-schemas, createSlackClientDirect, buildHookMessage, HOOK_IDLE_TIMEOUT_MS, multi-entry-build]
  affects: [02-02-hook-handlers]
tech_stack:
  added: []
  patterns: [zod-discriminated-union, fast-client-factory, unified-block-kit-builder]
key_files:
  created: []
  modified:
    - src/types.ts
    - src/config.ts
    - src/slack/client.ts
    - src/slack/messages.ts
    - tsup.config.ts
decisions:
  - "createSlackClientDirect sets botUserId to empty string — hook handlers never poll so bot filtering is not needed"
  - "HookInputSchema uses z.discriminatedUnion on hook_event_name for correct type narrowing per event type"
  - "buildHookMessage uses orange (#FFA500) for all hook notification types — locked decision from planning (not distinct colors per type)"
metrics:
  duration: "8 min"
  completed_date: "2026-02-22"
  tasks_completed: 2
  files_modified: 5
---

# Phase 02 Plan 01: Hook Infrastructure Foundation Summary

Zod schemas, fast Slack client factory, unified Block Kit hook message builder, and multi-entry tsup build config for Claude Code hook integration.

## What Was Built

### Task 1: Hook Input Zod Schemas, Config Extension, Lightweight Slack Client (56878d9)

**src/types.ts** — Added three Zod schemas matching Claude Code hook stdin JSON shapes:
- `StopHookInputSchema` — session end/task completion events
- `PostToolUseFailureInputSchema` — tool invocation failure events
- `PermissionRequestInputSchema` — permission approval request events
- `HookInputSchema` — discriminated union on `hook_event_name` for correct type narrowing
- `HookNotificationType` — `"COMPLETED" | "ERROR" | "QUESTION" | "PERMISSION"` literal union
- All inferred TypeScript types via `z.infer<>`

**src/config.ts** — Added `HOOK_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(90000)` to ConfigSchema. Updated error help text to document the new optional variable.

**src/slack/client.ts** — Added `createSlackClientDirect(config: Config): SlackClient` synchronous factory that creates a `WebClient` with `botUserId: ""` and skips `auth.test()`. Avoids 100-500ms round-trip overhead on every hook invocation.

### Task 2: Unified Hook Message Builder and Multi-Entry Build Config (e369c28)

**src/slack/messages.ts** — Added `buildHookMessage(opts: HookMessageOptions)` with unified Block Kit structure:
- Header block: emoji + label text mapped from `HookNotificationType`
- Section block: optional `@mention` + bold headline
- Rich text preformatted block (only if `context` provided)
- Body section block (only if `body` provided)
- Divider block
- Orange (#FFA500) color bar for all types — locked decision
- Also added `buildResolvedInTerminalMessage()` for watcher terminal-detection feedback

**tsup.config.ts** — Updated entry array to three entry points:
```typescript
entry: ["src/server.ts", "src/hook-handler.ts", "src/hooks/watcher.ts"]
```
Banner config unchanged (harmless on watcher.ts since it's spawned via `node` explicitly).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `createSlackClientDirect` sets `botUserId: ""` | Hook handlers never poll for replies, so bot-message filtering is not needed. Empty string satisfies the `SlackClient` interface. |
| `HookInputSchema` uses `z.discriminatedUnion` on `hook_event_name` | Correct type narrowing per event type — avoids runtime `if/instanceof` checks in hook handler switch statements. |
| Orange (#FFA500) for all `buildHookMessage` calls | Locked planning decision: "not distinct color bars per type" — consistent visual weight, type differentiated by header label only. |
| tsup banner kept unchanged | Adding shebang to `watcher.ts` is harmless since watcher is invoked via `node` explicitly. Simpler than removing banner and adding shebangs manually to source files. |

## Verification Results

- `npx tsc --noEmit`: zero errors (verified after each task)
- `src/types.ts`: exports all 3 schemas + discriminated union + `HookNotificationType` + all inferred types
- `src/config.ts`: `HOOK_IDLE_TIMEOUT_MS` with `default(90000)`
- `src/slack/client.ts`: exports both `createSlackClient` and `createSlackClientDirect`
- `src/slack/messages.ts`: exports `buildHookMessage` and `buildResolvedInTerminalMessage`
- `tsup.config.ts`: entry array contains `server.ts`, `hook-handler.ts`, `hooks/watcher.ts`
- No `console.log()` calls in any modified file

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: src/types.ts (StopHookInputSchema, HookInputSchema, HookNotificationType exports)
- FOUND: src/config.ts (HOOK_IDLE_TIMEOUT_MS with default 90000)
- FOUND: src/slack/client.ts (createSlackClientDirect export)
- FOUND: src/slack/messages.ts (buildHookMessage, buildResolvedInTerminalMessage exports)
- FOUND: tsup.config.ts (hook-handler.ts, hooks/watcher.ts entries)

Commits verified:
- FOUND: 56878d9 (feat(02-01): add hook input Zod schemas, config extension, and lightweight Slack client)
- FOUND: e369c28 (feat(02-01): add unified hook message builder and multi-entry build config)
