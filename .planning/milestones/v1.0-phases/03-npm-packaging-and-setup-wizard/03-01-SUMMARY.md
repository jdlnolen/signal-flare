---
phase: 03-npm-packaging-and-setup-wizard
plan: 01
subsystem: infra
tags: [cli, commander, dotenv, npm-packaging, esm]

# Dependency graph
requires:
  - phase: 02-hook-integration
    provides: hook-handler.ts and watcher.ts built and committed
provides:
  - CLI entry point (src/cli.ts) with commander setup/test/status subcommands
  - dotenv loading in config.ts via SIGNAL_FLARE_ENV_FILE or ~/.config/signal-flare/config.json
  - Correct package.json bin field pointing to dist/cli.js
  - Four-entry tsup build (cli + server + hook-handler + watcher)
affects: [03-02-setup-wizard, 03-03-readme, future npm publish]

# Tech tracking
tech-stack:
  added: [commander@14, "@inquirer/prompts@8", dotenv@17]
  patterns: [CLI entry point separate from MCP server, dotenv quiet mode for MCP context, convention config fallback for hook handlers]

key-files:
  created:
    - src/cli.ts
  modified:
    - src/config.ts
    - package.json
    - tsup.config.ts

key-decisions:
  - "CLI shebang is handled by tsup banner only — no literal shebang in src/cli.ts (tsup banner applies to all entries)"
  - "dotenv.config({ quiet: true }) used to suppress dotenv v17 default verbose output in MCP server context"
  - "resolveEnvFilePath() is synchronous — uses readFileSync at startup, no async needed"
  - "SIGNAL_FLARE_ENV_FILE takes priority over convention config file fallback"
  - "Config error message now includes 'Run signal-flare setup' guidance (PKG-04 requirement)"

patterns-established:
  - "CLI files (cli.ts, commands/*) may use console.log — they are user-facing terminal processes, not MCP servers"
  - "Convention config path: ~/.config/signal-flare/config.json with envFile field"

requirements-completed: [PKG-01, PKG-03, PKG-04]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 3 Plan 01: Package Infrastructure Summary

**CLI binary (signal-flare setup/test/status) with commander, dotenv loading from SIGNAL_FLARE_ENV_FILE or ~/.config/signal-flare/config.json, and package.json prepared for npm publish**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-22T19:01:45Z
- **Completed:** 2026-02-22T19:04:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- CLI binary (dist/cli.js) with setup, test, status subcommands via commander
- dotenv integration in config.ts: loads .env from custom path before Zod validation
- Convention config fallback: hook handlers can use ~/.config/signal-flare/config.json
- package.json updated: bin -> dist/cli.js, engines >= 18, files includes README/LICENSE, license MIT
- tsup now builds four entry points: cli, server, hook-handler, watcher

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CLI entry point and update build configuration** - `231b9c2` (feat)
2. **Task 2: Add dotenv integration to config loading with convention file fallback** - `1c72b7b` (feat)

**Plan metadata:** `(pending docs commit)`

## Files Created/Modified

- `src/cli.ts` - CLI entry point with commander, setup/test/status subcommands, default help action
- `src/config.ts` - Added dotenv, resolveEnvFilePath(), dotenv.config() call before Zod parse, "signal-flare setup" guidance in errors
- `package.json` - bin -> dist/cli.js, engines >= 18, files + README/LICENSE, license MIT, new deps
- `tsup.config.ts` - Added src/cli.ts to entry array

## Decisions Made

- CLI shebang is provided by tsup banner only — no literal `#!/usr/bin/env node` in src/cli.ts. Having it in both causes a "double shebang" that breaks ESM node loading.
- `dotenv.config({ quiet: true })` used to suppress dotenv v17's default verbose output, which would pollute stderr in MCP server context.
- `resolveEnvFilePath()` uses synchronous `readFileSync` — config loading runs at process startup, async not needed or appropriate.
- Config error messages include "Run `signal-flare setup` to configure" per PKG-04 requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal shebang from src/cli.ts**
- **Found during:** Task 1 verification (`node dist/cli.js --help`)
- **Issue:** Plan says "Add `#!/usr/bin/env node` shebang comment at top (tsup banner will add the real one)" — interpreted as a real shebang line. tsup banner also adds `#!/usr/bin/env node`, resulting in double shebang that breaks Node.js ESM loading with "SyntaxError: Invalid or unexpected token".
- **Fix:** Replaced literal `#!/usr/bin/env node` with a comment: `// CLI entry point for signal-flare — #!/usr/bin/env node shebang added by tsup banner`
- **Files modified:** src/cli.ts
- **Verification:** `node dist/cli.js --help` shows correct help output
- **Committed in:** 231b9c2 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added quiet: true to dotenv.config() call**
- **Found during:** Task 2 verification
- **Issue:** dotenv v17 outputs verbose injection logs by default (`[dotenv@17.3.1] injecting env (2) from ...`). In an MCP server context, any unexpected stderr output should be suppressed unless it's a genuine error.
- **Fix:** Added `quiet: true` option to `dotenv.config({ path: envFilePath, quiet: true })`
- **Files modified:** src/config.ts
- **Verification:** Rerun server test showed no dotenv output, only the expected Slack auth error
- **Committed in:** 1c72b7b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct operation. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- CLI binary builds correctly and shows help with setup/test/status subcommands
- dotenv integration ready for setup wizard (Plan 02) to write the .env file path into ~/.config/signal-flare/config.json
- package.json prepared for npm publish with correct bin, engines, files, license fields
- No blockers for Plan 02 (setup wizard implementation)

## Self-Check: PASSED

- src/cli.ts: FOUND
- src/config.ts: FOUND (modified)
- dist/cli.js: FOUND
- 03-01-SUMMARY.md: FOUND
- Commit 231b9c2: FOUND (feat(03-01): add CLI entry point and update build configuration)
- Commit 1c72b7b: FOUND (feat(03-01): add dotenv integration to config loading with convention fallback)

---
*Phase: 03-npm-packaging-and-setup-wizard*
*Completed: 2026-02-22*
