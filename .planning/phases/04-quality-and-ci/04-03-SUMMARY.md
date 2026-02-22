---
phase: 04-quality-and-ci
plan: 03
subsystem: testing
tags: [vitest, slack-client, poller, ask-human, github-actions, ci, coverage, typescript]

# Dependency graph
requires:
  - phase: 04-quality-and-ci
    plan: 01
    provides: ESLint/Prettier/Vitest tooling baseline
  - phase: 04-quality-and-ci
    plan: 02
    provides: config/messages/hooks test baseline (implicitly depended on for coverage)

provides:
  - src/slack/client.test.ts — Slack client auth resolution and createSlackClientDirect tests
  - src/slack/poller.test.ts — Polling loop tests including roadmap-required bot-only-thread case
  - src/tools/ask-human.test.ts — Full MCP tool lifecycle tests with mocked Slack API
  - .github/workflows/ci.yml — GitHub Actions CI with parallel lint/typecheck/build/test jobs
  - All 158 tests passing with 90.73% statement coverage (above 85% threshold)

affects:
  - CI pipeline enforces quality on every PR and push to main
  - Coverage thresholds enforced via vitest.config.ts

# Tech tracking
tech-stack:
  added:
    - "GitHub Actions workflows — parallel job pattern with Node version matrix"
  patterns:
    - "vi.hoisted() for mock references needed before import (ESM hoisting requirement)"
    - "vi.mock('module.js') with .js extension for Node16 ESM resolution in test files"
    - "SlackCallArgs / AnyBlock helper types for accessing Slack Block Kit fields without strict union constraints"
    - "captureToolHandler() pattern to extract and directly test registered MCP tool handler functions"
    - "(vi.mocked(X) as any).mockImplementation() to bypass strict constructor mock type checking"

key-files:
  created:
    - src/slack/client.test.ts
    - src/slack/poller.test.ts
    - src/tools/ask-human.test.ts
    - .github/workflows/ci.yml
  modified:
    - src/slack/client.test.ts (typecheck fix: WebClient mock cast)
    - src/slack/messages.test.ts (typecheck fix: AnyBlock helper type, non-null assertions)
    - src/hooks/stop.test.ts (typecheck fix: SlackCallArgs helper type and getCallArgs helper)
    - src/hooks/post-tool-failure.test.ts (typecheck fix: SlackCallArgs helper type and getCallArgs helper)
    - src/hooks/permission.test.ts (typecheck fix: SlackCallArgs helper, non-null assertions)
    - src/slack/poller.test.ts (bugfix: { emptyThread } → { messages: emptyThread })

key-decisions:
  - "captureToolHandler() pattern chosen over module-level export testing — registerAskHumanTool wraps handler in server.registerTool(), capturing is cleaner than restructuring production code"
  - "SlackCallArgs / AnyBlock helper types added to all hook/slack test files — Slack's @slack/types Block union requires casting to access subtype-specific properties like .text"
  - "(vi.mocked(WebClient) as any).mockImplementation() used for constructor mock — TypeScript NormalizedPrecedure type is incompatible with simple function signatures; test-file any cast is acceptable with no-explicit-any rule disabled for tests"
  - "coverage/directory added to .gitignore implicitly via ESLint ignores — kept out of commits"
  - "Uncommitted 04-02 test files (router.test.ts, stop.test.ts, permission.test.ts, post-tool-failure.test.ts) committed here as they were blocking coverage threshold compliance"

patterns-established:
  - "Test helper types defined per-file (SlackCallArgs, AnyBlock) — avoid cross-file test dependencies"
  - "getCallArgs() helper function pattern extracts typed mock call args cleanly in hook tests"

requirements-completed: [PKG-06, PKG-07]

# Metrics
duration: 10min
completed: 2026-02-22
---

# Phase 4 Plan 03: Slack Client/Poller/Ask-Human Tests and GitHub Actions CI Summary

**Tests for Slack client auth resolution, polling loop (with roadmap-required bot-only-thread case), and ask-human tool lifecycle; GitHub Actions CI pipeline with parallel lint/typecheck/build/test jobs; 158 tests passing at 90.73% coverage**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-22T19:49:59Z
- **Completed:** 2026-02-22T20:00:00Z
- **Tasks:** 2
- **Files created/modified:** 11

## Accomplishments

- Wrote `src/slack/client.test.ts` — 12 tests covering auth.test() resolution, botUserId, error propagation, and createSlackClientDirect (no auth.test() called, botUserId="")
- Wrote `src/slack/poller.test.ts` — 15 tests covering the ROADMAP-REQUIRED bot-only-thread test (`found:false` when only bot messages), human reply detection, self-message filtering, emoji filtering, allowlist acknowledgments, multi-call polling loop, and API error resilience
- Wrote `src/tools/ask-human.test.ts` — 16 tests covering the full question-post-poll-respond lifecycle using `captureToolHandler()` pattern, urgency levels, options selection (numeric reply to option), timeout flow (first+second poll windows), Slack API error handling, and SEND_DELAY_MS
- Created `.github/workflows/ci.yml` — parallel lint/typecheck/build/test jobs, test uses Node matrix [18, 20, 22], `npm run coverage` enforces thresholds
- Fixed TypeScript strict type errors across all test files (pre-existing from 04-02): added `SlackCallArgs`, `AnyBlock` helper types, `getCallArgs()` helper function, non-null assertions, WebClient constructor mock cast
- Committed previously-uncommitted 04-02 test files (router, stop, permission, post-tool-failure) to bring coverage above threshold

## Task Commits

1. **Task 1: Write tests for Slack client, poller, and ask-human tool** - `817a0b3` (test)
2. **Task 2: Create GitHub Actions CI workflow and finalize coverage thresholds** - `9090108` (feat)

Additionally committed during execution:
- `9f37b97` — test(04-02): router and stop tests (uncommitted from 04-02)
- `44c1cce` — test(04-02): permission and post-tool-failure tests (uncommitted from 04-02)

## Files Created/Modified

**Created:**
- `src/slack/client.test.ts` — 12 tests for Slack client factory functions
- `src/slack/poller.test.ts` — 15 tests including roadmap-required bot-only-thread test
- `src/tools/ask-human.test.ts` — 16 tests for MCP tool lifecycle
- `.github/workflows/ci.yml` — GitHub Actions CI with 4 parallel jobs and Node matrix

**Modified:**
- `src/slack/client.test.ts` — TypeScript fix: WebClient constructor mock cast
- `src/slack/messages.test.ts` — TypeScript fix: AnyBlock helper type and non-null assertions
- `src/hooks/stop.test.ts` — TypeScript fix: SlackCallArgs helper type and getCallArgs()
- `src/hooks/post-tool-failure.test.ts` — TypeScript fix: SlackCallArgs helper type and getCallArgs()
- `src/hooks/permission.test.ts` — TypeScript fix: SlackCallArgs helper type and non-null assertions
- `src/slack/poller.test.ts` — Bugfix: `{ emptyThread }` → `{ messages: emptyThread }`

## Decisions Made

- Used `captureToolHandler()` pattern to test the MCP tool handler — server.registerTool() receives the handler as a callback argument; capturing it allows direct testing without restructuring production code
- Added `SlackCallArgs` and `AnyBlock` helper types in test files — Slack's @slack/types Block union type requires explicit casting to access subtype-specific properties (`.text`, `.elements`, `.attachments`); this is the correct approach for test files
- Used `(vi.mocked(WebClient) as any).mockImplementation()` — TypeScript's `NormalizedPrecedure` type wrapping makes the constructor mock incompatible with simple function signatures; `no-explicit-any` is already disabled for test files in `eslint.config.js`
- 85% coverage threshold maintained (not raised to 90%) — actual coverage is 90.73% statements; no need to increase the threshold value since it already passes comfortably

## Coverage Report

```
All files          |   90.73 |    86.36 |      96 |   90.73
 src/slack
  client.ts        |     100 |      100 |     100 |     100
  messages.ts      |     100 |      100 |     100 |     100
  poller.ts        |   98.18 |    88.23 |     100 |   98.18
 src/tools
  ask-human.ts     |   96.55 |    76.92 |     100 |   96.55
 src/hooks
  router.ts        |     100 |      100 |     100 |     100
  stop.ts          |     100 |      100 |     100 |     100
  permission.ts    |   85.52 |    81.25 |     100 |   85.52
  post-tool-failure.ts | 100 |    91.3  |     100 |     100
```

All thresholds (85%) met.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong property name in poller test empty-thread mock**
- **Found during:** Task 1 verification (typecheck run)
- **Issue:** `createMockWebClient([{ emptyThread }])` used JS shorthand for `{ emptyThread: emptyThread }` but the expected type is `{ messages?: object[] }` — TypeScript caught this as an unknown property
- **Fix:** Changed to `{ messages: emptyThread }`
- **Files modified:** `src/slack/poller.test.ts`
- **Committed in:** `9090108` (Task 2 commit)

**2. [Rule 1 - Bug] TypeScript strict type errors in all test files**
- **Found during:** Task 2 verification (npm run typecheck)
- **Issue:** Pre-existing TypeScript errors in 04-02 test files: `Property 'attachments' does not exist on type 'ChatPostMessageArguments'`, `Property 'text' does not exist on type 'Block | HeaderBlock'`, `Property 'elements' is possibly undefined`. These errors were introduced in plan 04-02 but not caught (typecheck was not run during that plan).
- **Fix:** Added `SlackCallArgs` type helper and `getCallArgs()` function in each hook test file; added `AnyBlock` type helper in messages.test.ts; added non-null assertions (`!`) where appropriate; cast WebClient mock with `as any`
- **Files modified:** `src/slack/messages.test.ts`, `src/hooks/stop.test.ts`, `src/hooks/post-tool-failure.test.ts`, `src/hooks/permission.test.ts`, `src/slack/client.test.ts`
- **Committed in:** `9090108` (Task 2 commit)

**3. [Rule 3 - Blocking] Uncommitted 04-02 test files blocking coverage threshold**
- **Found during:** Task 2 (running npm run coverage after Task 1)
- **Issue:** `src/hooks/permission.test.ts` and `src/hooks/post-tool-failure.test.ts` existed as untracked files from plan 04-02 but were never committed. Without them, `permission.ts` and `post-tool-failure.ts` had 0% coverage, pulling overall coverage below the 85% threshold.
- **Fix:** Committed both files and also `router.test.ts` and `stop.test.ts` which were in the same state
- **Committed in:** `9f37b97` and `44c1cce`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 bug in pre-existing code, 1 blocking issue)
**Impact on plan:** All fixes required for CI pipeline to pass. No scope creep.

## Self-Check: PASSED

All claimed artifacts verified:
- FOUND: src/slack/client.test.ts
- FOUND: src/slack/poller.test.ts
- FOUND: src/tools/ask-human.test.ts
- FOUND: .github/workflows/ci.yml
- FOUND: .planning/phases/04-quality-and-ci/04-03-SUMMARY.md
- COMMIT FOUND: 817a0b3 (Task 1 - test files)
- COMMIT FOUND: 9090108 (Task 2 - CI workflow + typecheck fixes)
- All 158 tests pass: npm run coverage exits 0
- npm run lint: clean (0 errors)
- npm run typecheck: clean (0 errors)
- npm run build: success
