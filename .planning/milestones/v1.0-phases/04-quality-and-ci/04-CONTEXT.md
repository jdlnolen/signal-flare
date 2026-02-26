# Phase 4: Quality and CI - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Test suite with comprehensive coverage for all core components (MCP tool, hook handler, Slack client, polling logic, config, message builders) plus a GitHub Actions CI pipeline running lint, typecheck, build, and tests on every PR and push to main. Covers PKG-06 and PKG-07.

</domain>

<decisions>
## Implementation Decisions

### Test Scope & Coverage
- Comprehensive coverage target (90%+), including edge cases and error paths
- Coverage enforced in CI — build fails if coverage drops below threshold
- Default to mocked Slack API calls; separate optional integration test suite that runs against real Slack API when tokens are available (skipped in CI)
- Specific required test case from roadmap: polling loop must verify that a thread containing only bot messages returns null (no false positive self-detection)
- Beyond the roadmap requirement, Claude determines what's needed to hit 90%+ coverage

### Test Framework & Style
- Vitest as test runner (ESM-native, TypeScript-friendly, built-in coverage)
- Colocated test files: `src/slack/client.test.ts` next to `src/slack/client.ts`
- `vi.mock` module mocks for Slack API calls
- `expect()` assertion style (Vitest built-in)

### CI Pipeline Design
- GitHub Actions workflow
- Node version matrix: all currently available LTS versions (18, 20, 22)
- Triggers on PRs targeting main AND direct pushes to main
- Parallel jobs: lint, typecheck, build, and test run as separate jobs simultaneously
- Build verification included as its own job (catches tsup config issues)

### Linting & Formatting
- ESLint + Prettier (ESLint for code quality, Prettier for formatting)
- Flat config format (eslint.config.js) — ESLint 9+ style
- Custom ESLint rule enforcing no `console.log` in src/ except src/cli.ts and src/commands/ — catches PKG-03 violations at lint time
- Fix all existing code to pass lint as the first task, before writing any tests — clean baseline

### Claude's Discretion
- Exact coverage threshold number (90% suggested but Claude can adjust if practical)
- Vitest configuration details (coverage provider, reporter format)
- ESLint plugin choices (typescript-eslint, eslint-config-prettier, etc.)
- Prettier configuration options (printWidth, singleQuote, etc.)
- How optional integration tests detect available tokens and skip gracefully

</decisions>

<specifics>
## Specific Ideas

- Lint fix pass should be a separate commit from test code, so existing code changes are cleanly separated from new test files
- The no-console-log ESLint rule is a project-specific safety net — MCP server stdout is sacred (JSON-RPC), and this catches violations automatically rather than relying on review

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-quality-and-ci*
*Context gathered: 2026-02-22*
