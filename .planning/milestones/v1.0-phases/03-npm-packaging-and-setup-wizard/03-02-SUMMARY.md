---
phase: 03-npm-packaging-and-setup-wizard
plan: 02
subsystem: cli
tags: [cli, setup-wizard, inquirer, slack-validation, config-writer, hooks, mcp]

# Dependency graph
requires:
  - phase: 03-npm-packaging-and-setup-wizard
    provides: CLI binary with commander, dotenv loading, four-entry tsup build
provides:
  - Interactive setup wizard (src/commands/setup.ts) writing .env, hooks, MCP config
  - Wizard utilities: prompts.ts (5 prompt functions + TTY guard), validator.ts (auth.test + conversations.info), config-writer.ts (safe JSON merge, 0o600 .env perms)
  - Test command (src/commands/test.ts) sending Block Kit notification to Slack
  - Status command (src/commands/status.ts) showing full config state with masked tokens
affects: [03-03-readme, npm-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "readJsonSafe() for safe JSON file merge — returns {} on missing or malformed files"
    - "writeEnvFile() uses mode 0o600 for owner-only read/write permissions"
    - "Idempotent hooks: scan for existing signal-flare entries before adding, update in place"
    - "resolvePackagePaths() uses import.meta.url to derive package-root-relative dist paths"

key-files:
  created:
    - src/wizard/prompts.ts
    - src/wizard/validator.ts
    - src/wizard/config-writer.ts
    - src/commands/setup.ts
    - src/commands/test.ts
    - src/commands/status.ts
  modified:
    - src/cli.ts

key-decisions:
  - "PermissionRequest hook uses matcher '.*' and PreToolUse key — fires on all permission requests, handler filters for AskUserQuestion internally"
  - "hookCommand uses inline env var: SIGNAL_FLARE_ENV_FILE=<path> <handler> — no shell env inheritance needed"
  - "promptForToken returns existing token if user presses Enter — allows re-running setup without re-entering unchanged token"
  - "status command checks both global and project paths for hooks and MCP — shows full picture"

patterns-established:
  - "Wizard files (src/wizard/*) may use console.log — they are CLI utilities, not MCP servers"
  - "Commands (src/commands/*) may use console.log — they are user-facing terminal processes"

requirements-completed: [PKG-02]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 3 Plan 02: Setup Wizard and CLI Commands Summary

**Interactive setup wizard with Slack API validation, safe JSON merge for Claude Code hooks and MCP config, plus test and status commands for day-one debugging**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-22T19:06:41Z
- **Completed:** 2026-02-22T19:09:22Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Complete setup wizard: prompts for token, channel, user ID, scope, env path — validates via Slack API before writing any config
- Config-writer with safe JSON merge (reads existing settings.json/.claude.json without overwriting other tools), idempotent Signal Flare entry updates, 0o600 .env permissions
- Test command sends real Block Kit Slack notification to confirm end-to-end connectivity
- Status command shows env vars (masked token), convention config file state, hooks and MCP config state for both global and project scopes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create wizard utilities (prompts, validator, config-writer)** - `6a5bc00` (feat)
2. **Task 2: Implement setup, test, and status commands and wire into CLI** - `1671356` (feat)

**Plan metadata:** `(pending docs commit)`

## Files Created/Modified

- `src/wizard/prompts.ts` - 5 prompt functions (token, channelId, userId, scope, envPath) + TTY guard using @inquirer/prompts
- `src/wizard/validator.ts` - validateSlackCredentials() calling auth.test() + conversations.info()
- `src/wizard/config-writer.ts` - writeEnvFile (0o600), writeConfigJson, writeHooksConfig, writeMcpConfig with safe merge
- `src/commands/setup.ts` - Setup wizard orchestration: prompt → validate → write all config files
- `src/commands/test.ts` - Sends Block Kit test notification to confirm connectivity
- `src/commands/status.ts` - Shows env vars (masked), config file paths, hooks/MCP config state
- `src/cli.ts` - Wired all three commands to real implementations (replaced placeholders)

## Decisions Made

- `PermissionRequest` hook is written to the `PreToolUse` key in settings.json with matcher `".*"` — the hook handler internally filters for AskUserQuestion events.
- Hook command uses inline env var syntax (`SIGNAL_FLARE_ENV_FILE=<path> <handler>`) so the hook handler can locate the .env without requiring shell environment inheritance.
- `promptForToken()` returns the existing token when user presses Enter on an empty password field — allows re-running setup to update only the channel or scope without re-typing the token.
- Status command checks both global (`~/.claude/settings.json`, `~/.claude.json`) and project (`.claude/settings.json`, `.mcp.json`) paths simultaneously, showing complete picture.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- All three CLI commands work: `signal-flare setup`, `signal-flare test`, `signal-flare status`
- `npm run build` and `npm run typecheck` pass cleanly
- Setup wizard writes complete config for both global and project scopes
- No blockers for Plan 03 (README and npm publish preparation)

## Self-Check: PASSED

- src/wizard/prompts.ts: FOUND
- src/wizard/validator.ts: FOUND
- src/wizard/config-writer.ts: FOUND
- src/commands/setup.ts: FOUND
- src/commands/test.ts: FOUND
- src/commands/status.ts: FOUND
- src/cli.ts: FOUND (updated)
- Commit 6a5bc00: FOUND (feat(03-02): add wizard utilities)
- Commit 1671356: FOUND (feat(03-02): implement setup, test, and status commands)

---
*Phase: 03-npm-packaging-and-setup-wizard*
*Completed: 2026-02-22*
