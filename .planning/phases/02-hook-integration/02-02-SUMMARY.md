---
phase: 02-hook-integration
plan: "02"
subsystem: hooks
tags: [claude-code-hooks, stdin, zod, slack-notifications, background-process, jsonl]

# Dependency graph
requires:
  - phase: 02-01
    provides: HookInputSchema discriminated union, createSlackClientDirect, buildHookMessage, HOOK_IDLE_TIMEOUT_MS config
  - phase: 01-slack-infrastructure-and-mcp-tool
    provides: SlackClient interface, WebClient wrapper, buildResolvedInTerminalMessage

provides:
  - src/hook-handler.ts — entry point that reads stdin JSON, validates, routes, exits 0
  - src/hooks/router.ts — dispatch by hook_event_name
  - src/hooks/stop.ts — COMPLETED notification with one-line summary extraction
  - src/hooks/post-tool-failure.ts — ERROR notification with tool context extraction
  - src/hooks/permission.ts — QUESTION/PERMISSION notification with detached watcher spawn
  - src/hooks/watcher.ts — standalone background process polling JSONL transcript for terminal response

affects: [phase-03-configuration-and-packaging, phase-04-end-to-end-testing]

# Tech tracking
tech-stack:
  added: [node:child_process spawn, node:fs readFileSync/appendFileSync, node:url fileURLToPath, node:os homedir]
  patterns:
    - Fire-and-forget Slack posting — all handlers catch errors and never throw (never blocks Claude Code)
    - Detached child process pattern — child.unref() after spawn so parent exits independently
    - JSONL polling — read transcript file, diff line counts, parse new lines for role field
    - Debug log to file (~/.claude/signal-flare-watcher.log) for detached process observability

key-files:
  created:
    - src/hook-handler.ts
    - src/hooks/router.ts
    - src/hooks/stop.ts
    - src/hooks/post-tool-failure.ts
    - src/hooks/permission.ts
    - src/hooks/watcher.ts
  modified: []

key-decisions:
  - "extractSummary uses first sentence (split on [.!?] + whitespace) truncated to 200 chars — matches locked decision for one-line summary"
  - "stop_hook_active guard in handleStop prevents infinite hook loop — belt-and-suspenders per research pitfall 5"
  - "isAskHuman uses .includes('ask_human_via_slack') not exact match — handles mcp__signal-flare__ask_human_via_slack naming"
  - "spawnWatcher resolves watcher.js path via fileURLToPath(new URL('./watcher.js', import.meta.url)) — correct ESM path resolution"
  - "Watcher logs to ~/.claude/signal-flare-watcher.log for debuggability — detached stdio:ignore makes stderr invisible"
  - "Watcher exits 0 on timeout with no reply — Slack notification stands as-is, no extra thread message needed"
  - "tool_input typed as Record<string,unknown> in handlers — matches Zod z.record(z.unknown()) schema from types.ts"

patterns-established:
  - "Hook handler entry points: readStdin() -> JSON.parse -> schema.safeParse -> loadConfig -> createSlackClientDirect -> routeHookEvent -> exit 0"
  - "All hook handlers: fire-and-forget try/catch, log to stderr, never throw, never exit non-zero"
  - "Watcher process: CLI args from process.argv.slice(2), loadConfig() for inherited env vars, poll JSONL by line diff"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 2 Plan 02: Hook Handler Implementation Summary

**Six-file hook pipeline: stdin JSON validation, event routing, three event handlers (Stop/PostToolUseFailure/PermissionRequest), and detached 90s transcript watcher — producing dist/hook-handler.js and dist/hooks/watcher.js**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T18:26:41Z
- **Completed:** 2026-02-22T18:28:45Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments

- Hook entry point reads stdin, validates with HookInputSchema discriminated union, routes to correct handler, exits 0 (never exit 2 which blocks Claude Code)
- Stop handler extracts first-sentence summary (≤200 chars) from last_assistant_message, guards stop_hook_active flag to prevent infinite loops, posts COMPLETED notification
- PostToolUseFailure handler extracts tool-specific context (Bash command / file path / MCP keys), posts ERROR notification with tool name, error text, and context block
- PermissionRequest handler detects AskUserQuestion via `.includes("ask_human_via_slack")`, posts QUESTION with numbered options or PERMISSION with action description, spawns detached watcher
- Watcher runs as independent process up to 90s, polls JSONL transcript for new human/user role entries, posts "resolved in terminal" thread reply if detected, logs to `~/.claude/signal-flare-watcher.log`

## Task Commits

Each task was committed atomically:

1. **Task 1: Hook entry point, router, Stop handler, PostToolUseFailure handler** - `3cedd31` (feat)
2. **Task 2: PermissionRequest handler and detached background watcher** - `8d17a84` (feat)

**Plan metadata:** (docs commit — created after summary)

## Files Created/Modified

- `src/hook-handler.ts` - Main entry point: readStdin, schema validation, createSlackClientDirect, routeHookEvent, exit 0
- `src/hooks/router.ts` - Dispatches by hook_event_name to handleStop/handlePostToolUseFailure/handlePermissionRequest
- `src/hooks/stop.ts` - extractSummary(), handleStop() with stop_hook_active guard, COMPLETED notification
- `src/hooks/post-tool-failure.ts` - extractToolContext() by tool type, handlePostToolUseFailure(), ERROR notification
- `src/hooks/permission.ts` - extractActionDescription(), handlePermissionRequest(), spawnWatcher() with detached child process
- `src/hooks/watcher.ts` - Standalone background process: JSONL polling, human message detection, thread reply, watcher log file

## Decisions Made

- `extractSummary` uses first sentence split on `[.!?]` followed by whitespace — matches locked "one-line summary" decision from plan context
- `stop_hook_active` guard added to `handleStop` as belt-and-suspenders against infinite hook loops
- AskUserQuestion detection via `.includes("ask_human_via_slack")` handles both direct MCP calls and `mcp__signal-flare__ask_human_via_slack` naming
- Watcher resolves `watcher.js` path with `fileURLToPath(new URL("./watcher.js", import.meta.url))` — required for correct ESM path resolution at runtime
- Watcher appends critical errors to `~/.claude/signal-flare-watcher.log` because detached `stdio: "ignore"` makes stderr invisible

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript check passed on first run after all six files were created. Build produced both `dist/hook-handler.js` and `dist/hooks/watcher.js` as expected.

## User Setup Required

None — no external service configuration required. Users must add hook entries to `~/.claude/settings.json` pointing at `dist/hook-handler.js`, but that is covered in Phase 3 (Configuration and Packaging).

## Self-Check: PASSED

All 6 created files verified on disk. Commits 3cedd31 and 8d17a84 verified in git log.

## Next Phase Readiness

- Full hook pipeline complete: stdin JSON → validation → routing → handler → Slack notification → optional watcher
- `dist/hook-handler.js` is ready to register in Claude Code `~/.claude/settings.json`
- `dist/hooks/watcher.js` runs independently as detached background process
- Phase 3 (Configuration and Packaging) can proceed: needs to document `~/.claude/settings.json` hook registration and environment variable setup

---
*Phase: 02-hook-integration*
*Completed: 2026-02-22*
