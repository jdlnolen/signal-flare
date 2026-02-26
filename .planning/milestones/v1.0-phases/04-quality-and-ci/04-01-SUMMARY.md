---
phase: 04-quality-and-ci
plan: 01
subsystem: testing
tags: [vitest, eslint, prettier, coverage, v8, typescript-eslint, flat-config]

# Dependency graph
requires:
  - phase: 03-npm-packaging-and-setup-wizard
    provides: all source files (cli.ts, server.ts, hook-handler.ts, hooks, slack, tools, wizard, commands)

provides:
  - ESLint 9/10 flat config with no-console enforcement and CLI/wizard exemptions
  - Prettier config (singleQuote:false, semi:true, printWidth:100, trailingComma:es5)
  - Vitest config with v8 coverage, 85% thresholds, entry-point exclusions
  - All source files passing lint and format checks
  - lint, lint:fix, format, format:check, coverage scripts in package.json

affects:
  - 04-02 (test authoring depends on this clean baseline)
  - 04-03 (CI pipeline uses lint and coverage scripts added here)

# Tech tracking
tech-stack:
  added:
    - "@vitest/coverage-v8@2.1.9 — v8 coverage provider matching installed vitest@2.1.9"
    - "eslint@10.0.1 — flat config format (eslint.config.js)"
    - "@eslint/js@10.0.1 — base recommended rules for ESLint flat config"
    - "typescript-eslint@8.56.0 — TypeScript rules and flat config helper"
    - "eslint-config-prettier@10.1.8 — disables formatting rules that conflict with Prettier"
    - "prettier@3.8.1 — code formatter"
  patterns:
    - "ESLint flat config (eslint.config.js, not .eslintrc) — project uses type:module"
    - "no-console rule with { allow: ['error', 'warn'] } for MCP server code (PKG-03 enforcement)"
    - "CLI/wizard/commands directories exempt from no-console rule"
    - "Entry-point files excluded from coverage (cli.ts, server.ts, hook-handler.ts, watcher.ts, commands/, wizard/)"
    - "85% coverage threshold (adjustable after tests measure actual achievable coverage)"

key-files:
  created:
    - vitest.config.ts
    - eslint.config.js
    - .prettierrc
  modified:
    - package.json (added lint, lint:fix, format, format:check, coverage scripts; added 5 devDependencies)
    - src/hooks/permission.ts (removed unused config param from spawnWatcher)
    - src/tools/ask-human.ts (removed unused session_id destructuring)
    - src/cli.ts, src/commands/setup.ts, src/commands/status.ts, src/commands/test.ts (Prettier formatting)
    - src/config.ts, src/hook-handler.ts, src/hooks/*, src/server.ts (Prettier formatting)
    - src/slack/client.ts, src/slack/messages.ts, src/types.ts (Prettier formatting)
    - src/wizard/config-writer.ts, src/wizard/prompts.ts (Prettier formatting)

key-decisions:
  - "@vitest/coverage-v8 pinned to @2 to match vitest@2.1.9 — * would resolve to v4 which requires vitest v4"
  - "@eslint/js installed separately — ESLint v10 does not bundle it unlike earlier docs suggested"
  - "spawnWatcher config param removed (was unused) rather than using eslint-disable comment — cleaner API"
  - "session_id removed from ask-human destructuring (unused in body) rather than using eslint-disable"
  - "85% threshold chosen (not 90%) per plan guidance — adjust once tests measure actual achievable coverage"

patterns-established:
  - "Prettier runs before ESLint fix — Prettier handles formatting, ESLint handles code quality"
  - "All manual edits to source files must be re-formatted with prettier --write after editing"

requirements-completed: [PKG-06, PKG-07]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 4 Plan 01: Quality Tooling Setup Summary

**ESLint 10 flat config + Prettier + @vitest/coverage-v8 installed and configured; all 20 source files pass lint and format checks with PKG-03 no-console enforcement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T19:43:11Z
- **Completed:** 2026-02-22T19:46:35Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Installed all quality tooling (ESLint 10, @eslint/js, typescript-eslint, eslint-config-prettier, Prettier, @vitest/coverage-v8)
- Created vitest.config.ts with v8 coverage provider, 85% thresholds, entry-point exclusions, GitHub Actions reporter support
- Created eslint.config.js with flat config, no-console rule enforcing PKG-03 (console.log banned in MCP code), CLI/wizard exemptions
- Created .prettierrc (singleQuote:false, semi:true, printWidth:100, trailingComma:es5)
- Added 5 scripts to package.json: lint, lint:fix, format, format:check, coverage
- Fixed all 20 source files to pass ESLint and Prettier — zero errors, all formatted

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dev dependencies and create configuration files** - `8882369` (chore)
2. **Task 2: Fix all existing source files to pass lint and format** - `0179720` (fix)

**Plan metadata:** `(pending final commit)` (docs: complete plan)

## Files Created/Modified

**Created:**
- `vitest.config.ts` — Vitest config with v8 coverage, 85% thresholds, entry-point exclusions, dot/github-actions reporters
- `eslint.config.js` — ESLint 10 flat config with no-console enforcement and CLI/wizard exemptions
- `.prettierrc` — Prettier config with singleQuote:false, printWidth:100, trailingComma:es5

**Modified:**
- `package.json` — Added 5 new scripts and 6 new devDependencies
- `src/hooks/permission.ts` — Removed unused `config` parameter from `spawnWatcher()` (no behavior change)
- `src/tools/ask-human.ts` — Removed unused `session_id` from destructuring (no behavior change)
- `src/cli.ts`, `src/commands/setup.ts`, `src/commands/status.ts`, `src/commands/test.ts` — Prettier formatting
- `src/config.ts`, `src/server.ts`, `src/types.ts` — Prettier formatting
- `src/hooks/post-tool-failure.ts`, `src/hooks/stop.ts` — Prettier formatting
- `src/slack/client.ts`, `src/slack/messages.ts` — Prettier formatting
- `src/wizard/config-writer.ts`, `src/wizard/prompts.ts` — Prettier formatting

## Decisions Made
- Pinned `@vitest/coverage-v8` to `@2` — using `*` would resolve to v4 which requires vitest v4 (currently at v2.1.9); version must match exactly
- Installed `@eslint/js` separately — ESLint v10 does not bundle it as a transitive dependency
- Removed unused `config` param from `spawnWatcher()` rather than using `// eslint-disable` comment — cleaner API, no behavior change
- Removed unused `session_id` from `ask-human.ts` destructuring rather than using `// eslint-disable` comment — `session_id` is in the schema but not yet used in the implementation
- Started at 85% threshold per plan guidance — will raise to 90% after actual test coverage is measured in 04-02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @eslint/js not bundled with ESLint v10**
- **Found during:** Task 1 (Install dev dependencies and create configuration files)
- **Issue:** `eslint.config.js` imports `@eslint/js` but it was not installed — ESLint v10 does not include it as a bundled dependency unlike earlier documentation suggested
- **Fix:** Ran `npm install -D @eslint/js` separately after the main install
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm run lint` ran successfully after install
- **Committed in:** `8882369` (Task 1 commit)

**2. [Rule 3 - Blocking] @vitest/coverage-v8 version conflict**
- **Found during:** Task 1 (Install dev dependencies and create configuration files)
- **Issue:** `npm install -D @vitest/coverage-v8` resolved to v4.0.18 which requires vitest v4, but project has vitest v2.1.9; peer dependency conflict
- **Fix:** Pinned to `@vitest/coverage-v8@2` to match installed vitest version
- **Files modified:** package.json, package-lock.json
- **Verification:** Install succeeded; `npx vitest run --coverage` reports v8 coverage
- **Committed in:** `8882369` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both auto-fixes required for installation to succeed. No scope creep.

## Issues Encountered
- ESLint `@typescript-eslint/no-unused-vars` does not automatically ignore `_`-prefixed variables (unlike some configurations). Fixed by removing truly unused parameters/destructuring rather than adding eslint-disable comments or configuring the rule — results in cleaner code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Quality baseline fully established — zero lint errors, zero format warnings, build and typecheck pass
- Vitest ready to run tests with coverage collection (v8 provider configured)
- Test authoring plans (04-02, 04-03) can now proceed against this clean baseline
- Coverage thresholds set at 85% — review and raise to 90% once 04-02 measures actual achievable coverage

---
*Phase: 04-quality-and-ci*
*Completed: 2026-02-22*
