# Phase 4: Quality and CI - Research

**Researched:** 2026-02-22
**Domain:** Testing (Vitest), Linting (ESLint 9 flat config + typescript-eslint + Prettier), CI (GitHub Actions)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test Scope & Coverage**
- Comprehensive coverage target (90%+), including edge cases and error paths
- Coverage enforced in CI — build fails if coverage drops below threshold
- Default to mocked Slack API calls; separate optional integration test suite that runs against real Slack API when tokens are available (skipped in CI)
- Specific required test case from roadmap: polling loop must verify that a thread containing only bot messages returns null (no false positive self-detection)
- Beyond the roadmap requirement, Claude determines what's needed to hit 90%+ coverage

**Test Framework & Style**
- Vitest as test runner (ESM-native, TypeScript-friendly, built-in coverage)
- Colocated test files: `src/slack/client.test.ts` next to `src/slack/client.ts`
- `vi.mock` module mocks for Slack API calls
- `expect()` assertion style (Vitest built-in)

**CI Pipeline Design**
- GitHub Actions workflow
- Node version matrix: all currently available LTS versions (18, 20, 22)
- Triggers on PRs targeting main AND direct pushes to main
- Parallel jobs: lint, typecheck, build, and test run as separate jobs simultaneously
- Build verification included as its own job (catches tsup config issues)

**Linting & Formatting**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PKG-06 | Test suite with good coverage (MCP tool, hook handler, Slack client, polling logic) | Vitest with v8 coverage, vi.mock for Slack API, colocated test files per locked decision |
| PKG-07 | GitHub Actions CI pipeline (lint, typecheck, test on PR) | GitHub Actions workflow with matrix [18, 20, 22], parallel jobs, npm cache, coverage threshold enforcement |
</phase_requirements>

---

## Summary

Phase 4 spans three distinct domains that must be coordinated: (1) setting up a Vitest test suite with mocked Slack API calls and enforced coverage thresholds, (2) configuring ESLint 9 flat config with typescript-eslint and a custom no-console-log rule, and (3) authoring a GitHub Actions CI workflow with a Node LTS matrix and parallel lint/typecheck/build/test jobs.

The project already has `vitest` and `typescript` in devDependencies and `npm test` maps to `vitest run`. This means the Vitest runner is installed but not yet configured (`vitest.config.ts` does not exist). The coverage provider (`@vitest/coverage-v8`) and linting tools (ESLint, typescript-eslint, Prettier) are also not yet installed. ESLint 9 with flat config (`eslint.config.js`) is now the stable default; the legacy `.eslintrc` format should not be used.

The codebase has one key architectural constraint that directly affects how tests are written: the project is ESM-only (`"type": "module"` in package.json, `"module": "Node16"` in tsconfig). Vitest is fully ESM-native and handles this correctly without extra configuration. The `vi.mock()` factory pattern (not `__mocks__` directories) is the right approach because it works reliably in ESM with explicit hoisting semantics.

**Primary recommendation:** Install `@vitest/coverage-v8`, ESLint 9 + typescript-eslint + eslint-config-prettier + Prettier in a single pass; write `vitest.config.ts` with coverage thresholds; write `eslint.config.js` with the custom no-console-log rule; write the GitHub Actions workflow file; then write tests module by module starting with the pure functions (messages, config) before tackling the async Slack-dependent modules (poller, client, ask-human).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^2.0.0 (already installed) | Test runner + assertion + mocking | ESM-native, TypeScript-first, Jest-compatible API, built-in coverage |
| @vitest/coverage-v8 | latest (match vitest version) | Code coverage via V8 | No pre-transpile step, Node.js native, faster than Istanbul |
| eslint | ^9.0.0 | Code quality linting | Industry standard; v9 introduced flat config as the stable default |
| typescript-eslint | ^8.0.0 | TypeScript rules for ESLint | Official monorepo for TypeScript ESLint support |
| eslint-config-prettier | ^10.0.0 | Disables ESLint formatting rules | Prevents ESLint/Prettier conflicts; maintained by Prettier org |
| prettier | ^3.0.0 | Code formatting | De facto standard; no configuration required to get good output |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @eslint/js | bundled with eslint | ESLint recommended JS rules | Always used as the base in flat config |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @vitest/coverage-v8 | @vitest/coverage-istanbul | Istanbul supports any JS runtime but slower; v8 is correct for Node.js |
| eslint flat config (eslint.config.js) | Legacy .eslintrc | Legacy format deprecated in ESLint 9, removed in ESLint 10; use flat config |
| typescript-eslint | @typescript-eslint/eslint-plugin separately | typescript-eslint is the official unified package that replaces the split packages |

**Installation:**
```bash
npm install -D @vitest/coverage-v8 eslint typescript-eslint eslint-config-prettier prettier
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── slack/
│   ├── client.ts
│   ├── client.test.ts        # colocated — locked decision
│   ├── messages.ts
│   ├── messages.test.ts
│   ├── poller.ts
│   └── poller.test.ts
├── tools/
│   ├── ask-human.ts
│   └── ask-human.test.ts
├── hooks/
│   ├── router.ts
│   ├── router.test.ts
│   ├── permission.ts
│   ├── permission.test.ts
│   ├── stop.ts
│   ├── stop.test.ts
│   ├── post-tool-failure.ts
│   └── post-tool-failure.test.ts
├── config.ts
├── config.test.ts
└── types.ts                  # types only — no behavior to test
.github/
└── workflows/
    └── ci.yml
vitest.config.ts
eslint.config.js
.prettierrc
```

### Pattern 1: Vitest Configuration with Coverage

**What:** `vitest.config.ts` at project root configures the test runner, coverage provider, thresholds, and reporter.
**When to use:** Required for coverage to be collected; without it Vitest uses defaults (no coverage, no thresholds).

```typescript
// vitest.config.ts
// Source: https://vitest.dev/guide/coverage
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts',          // CLI entry — harder to unit test
        'src/server.ts',       // MCP server entry — integration territory
        'src/hook-handler.ts', // stdin process entry — integration territory
        'src/hooks/watcher.ts',// spawned child process — integration territory
        'src/commands/**',     // CLI commands — exempt from no-console rule too
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      reporter: ['text', 'json', 'html'],
    },
    reporters: process.env.GITHUB_ACTIONS ? ['dot', 'github-actions'] : ['default'],
  },
})
```

**Note on thresholds:** The locked decision says 90%+ is the target. The actual achievable threshold depends on what modules are included in coverage — entry-point files (server.ts, hook-handler.ts, cli.ts, watcher.ts) that are process-level scripts are excluded above because they require integration-style testing. With those excluded and the pure business logic included, 90% is achievable.

### Pattern 2: ESLint Flat Config with typescript-eslint and Custom Rule

**What:** `eslint.config.js` in ESLint 9 flat config format. The key requirement is a custom no-console-log rule covering all `src/` except `src/cli.ts` and `src/commands/`.
**When to use:** ESLint 9 flat config is now the stable, non-deprecated format.

```javascript
// eslint.config.js
// Source: https://context7.com/typescript-eslint/typescript-eslint
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Base recommended rules for all files
  eslint.configs.recommended,
  tseslint.configs.recommended,

  // Prettier must come last — disables formatting rules
  prettierConfig,

  // Custom: enforce no console.log in MCP server code
  // Apply to all src/ files first
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  // Carve out exceptions for CLI and commands (console.log is fine there)
  {
    files: ['src/cli.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Test files: relax some rules
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
```

**Key insight on the no-console rule:** The `no-console` rule with `{ allow: ["error", "warn"] }` blocks `console.log` while permitting `console.error` — which is exactly PKG-03's requirement. All existing source files already use `console.error()` exclusively, so the existing code should pass this rule as-is (or with minimal fixes).

### Pattern 3: vi.mock for Slack WebClient

**What:** Module-level mock of `@slack/web-api` using vi.mock factory function. The factory is hoisted before imports by Vitest.
**When to use:** Any test file that imports modules that ultimately call `new WebClient()`.

```typescript
// src/slack/client.test.ts
// Source: https://vitest.dev/guide/mocking/modules
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSlackClient, createSlackClientDirect } from './client.js'

// vi.mock is hoisted before imports — factory runs first
vi.mock('@slack/web-api', () => {
  const mockAuthTest = vi.fn()
  const WebClient = vi.fn(() => ({
    auth: { test: mockAuthTest },
    chat: { postMessage: vi.fn() },
    conversations: { replies: vi.fn() },
  }))
  return { WebClient }
})

describe('createSlackClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves botUserId from auth.test()', async () => {
    const { WebClient } = await import('@slack/web-api')
    // Configure mock return value
    vi.mocked(WebClient).mockImplementationOnce(() => ({
      auth: {
        test: vi.fn().mockResolvedValue({ ok: true, user_id: 'U123ABC' }),
      },
    } as any))

    const config = {
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_CHANNEL_ID: 'C123',
      SLACK_USER_ID: undefined,
      SEND_DELAY_MS: 0,
      POLL_TIMEOUT_MS: 600000,
      HOOK_IDLE_TIMEOUT_MS: 90000,
    }
    const client = await createSlackClient(config)
    expect(client.botUserId).toBe('U123ABC')
  })

  it('throws if auth.test() fails', async () => {
    // ... configure WebClient to throw
    await expect(createSlackClient(config)).rejects.toThrow()
  })
})
```

### Pattern 4: Testing pollForReply (Critical — bot-only thread returns null)

**What:** `pollForReply` is async with a configurable timeout. Tests must control time (or use tiny timeouts) and provide mock `WebClient` instances.
**When to use:** Testing the polling loop logic in `src/slack/poller.ts`.

The critical test case from the roadmap (threads containing only bot messages must return `found: false`) maps directly to the existing filtering logic in `poller.ts`:
```typescript
if (msg.bot_id) { continue; }
if (msg.type === 'bot_message') { continue; }
if (msg.user === botUserId) { continue; }
```

Testing strategy: pass a mock `conversations.replies` that returns only bot messages (with `bot_id` set), with a tiny `timeoutMs` (e.g., 50ms) and tiny `initialDelayMs` (e.g., 5ms). The function should return `{ found: false }`.

```typescript
// src/slack/poller.test.ts
import { describe, it, expect, vi } from 'vitest'
import { pollForReply, sleep } from './poller.js'
import type { WebClient } from '@slack/web-api'

describe('pollForReply', () => {
  it('returns found:false when thread contains only bot messages', async () => {
    const mockClient = {
      conversations: {
        replies: vi.fn().mockResolvedValue({
          messages: [
            {
              ts: 'thread-ts',  // root message — skipped
              text: 'Original question',
            },
            {
              ts: 'bot-reply-ts',
              bot_id: 'B123',   // bot message — filtered out
              text: 'I am a bot reply',
            },
          ],
        }),
      },
    } as unknown as WebClient

    const result = await pollForReply(
      mockClient,
      'C123',
      'thread-ts',
      'U_BOT_SELF',
      50,  // tiny timeout — expires fast
      { initialDelayMs: 5, maxDelayMs: 10, multiplier: 1.1 }
    )

    expect(result.found).toBe(false)
  })

  it('returns found:true when a valid human reply exists', async () => {
    const mockClient = {
      conversations: {
        replies: vi.fn().mockResolvedValue({
          messages: [
            { ts: 'thread-ts', text: 'Original question' },
            { ts: 'reply-ts', user: 'U_HUMAN', text: 'This is my answer' },
          ],
        }),
      },
    } as unknown as WebClient

    const result = await pollForReply(
      mockClient,
      'C123',
      'thread-ts',
      'U_BOT_SELF',
      5000,
      { initialDelayMs: 5, maxDelayMs: 10 }
    )

    expect(result.found).toBe(true)
    expect(result.text).toBe('This is my answer')
  })
})
```

### Pattern 5: GitHub Actions Workflow with Parallel Jobs + Node Matrix

**What:** `.github/workflows/ci.yml` that triggers on PR and push-to-main, runs lint/typecheck/build/test as parallel jobs on a Node LTS matrix.
**When to use:** This is the entire PKG-07 deliverable.

```yaml
# .github/workflows/ci.yml
# Source: https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build

  test:
    name: Test (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run coverage
```

**Key design decisions:**
- `lint`, `typecheck`, and `build` run on a single fixed Node version (20) — they don't need to be matrix'd
- Only `test` uses the matrix because runtime compatibility across LTS versions is what matters for tests
- `npm run coverage` (not `npm test`) is used in CI so the coverage threshold enforcement runs — the `test` script just runs `vitest run` without coverage
- `actions/setup-node@v4` with `cache: npm` handles dependency caching automatically

**Required package.json script additions:**
```json
{
  "scripts": {
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write src",
    "format:check": "prettier --check src",
    "coverage": "vitest run --coverage"
  }
}
```

### Anti-Patterns to Avoid

- **Using `--all` in coverage config (Vitest v4+):** The `all: true` option was removed in Vitest v4. Use `include` patterns instead to capture uncovered files.
- **Mocking with `__mocks__` directories instead of `vi.mock` factories:** The factory approach is explicit, colocated, and works correctly with ESM hoisting semantics. The `__mocks__` directory approach has subtle ESM gotchas.
- **Using `vi.spyOn` on a class's prototype for constructor mocks:** Use `vi.mock('@slack/web-api', factory)` to mock the entire module including the `WebClient` constructor.
- **Putting `timeoutMs` too large in tests:** The `pollForReply` function actually sleeps. Tests must use tiny `timeoutMs` (50-100ms) and tiny `initialDelayMs` (5-10ms) to keep test suite fast.
- **Testing hook-handler.ts directly (the process entry):** `hook-handler.ts` reads from `process.stdin` and calls `process.exit()`. This makes it an integration test boundary. Test the components it calls (`routeHookEvent`, individual handlers) instead.
- **Using `eslint.config.mjs` instead of `eslint.config.js`:** The project uses `"type": "module"` so `.js` files are already ESM. Use `eslint.config.js` (not `.mjs`) for consistency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Coverage collection | Manual instrumentation | `@vitest/coverage-v8` | V8 coverage is built into Node.js runtime; no instrumentation needed |
| Coverage threshold enforcement | CI exit code checks | `vitest.config.ts` thresholds | Vitest exits non-zero automatically when thresholds not met |
| TypeScript parsing in ESLint | Custom parser config | `typescript-eslint` (unified package) | Handles tsconfig integration, type-aware rules, flat config wiring |
| Formatting rules in ESLint | Manual rule list | `eslint-config-prettier` | Maintains the definitive list of conflicting rules across all ESLint plugins |
| Timer control in async tests | Real sleeps | Small `timeoutMs` + `initialDelayMs` params | `pollForReply` already accepts these — use them, don't need `vi.useFakeTimers` |

**Key insight:** The `pollForReply` function already has injectable timing parameters (`initialDelayMs`, `maxDelayMs`, `multiplier`). Tests don't need fake timers — just pass tiny values and let the real async flow run fast.

---

## Common Pitfalls

### Pitfall 1: ESM + vi.mock Hoisting

**What goes wrong:** `vi.mock('./module.js')` calls look like they should run after imports, but they are statically hoisted to the top of the file. If you reference variables defined after the mock call inside the mock factory, you get `undefined`.
**Why it happens:** Vitest transforms `vi.mock` calls to run before module evaluation, similar to Jest's `jest.mock` hoisting.
**How to avoid:** Use inline `vi.fn()` inside the mock factory, or use `vi.hoisted()` to pre-define values that the factory needs.
**Warning signs:** `mockFn is not a function`, `Cannot read properties of undefined` inside mock factories.

```typescript
// WRONG — myMock is defined after vi.mock is hoisted
const myMock = vi.fn()
vi.mock('./module.js', () => ({ fn: myMock })) // myMock is undefined here

// RIGHT — define the mock inline
vi.mock('./module.js', () => ({ fn: vi.fn() }))

// RIGHT — use vi.hoisted() for pre-definition
const myMock = vi.hoisted(() => vi.fn())
vi.mock('./module.js', () => ({ fn: myMock }))
```

### Pitfall 2: Node16 Module Resolution Requires .js Extensions in Imports

**What goes wrong:** TypeScript source files use `.js` extensions in imports (e.g., `import { foo } from './foo.js'`). When mocking with `vi.mock('./foo.js')`, you must use the same `.js` extension.
**Why it happens:** The project uses `"moduleResolution": "Node16"` which requires explicit extensions. Vitest respects this.
**How to avoid:** Always use `.js` extension in `vi.mock()` paths to match the import style used in source files.
**Warning signs:** Module not found errors in tests, mock not applied.

### Pitfall 3: Coverage Threshold vs. Entry Point Files

**What goes wrong:** Entry point files (`server.ts`, `hook-handler.ts`, `cli.ts`, `hooks/watcher.ts`) call `process.exit()`, spawn child processes, and read stdin. Including them in coverage drops the percentage because they're hard to unit test.
**Why it happens:** These files are process-level scripts designed to be run directly.
**How to avoid:** Exclude them from `coverage.include` (or add to `coverage.exclude`). Test the functions they call instead.
**Warning signs:** Coverage threshold failures with no obvious cause; tests for entry points that call `process.exit()` crashing the test process.

### Pitfall 4: ESLint Flat Config File Name

**What goes wrong:** Using `eslint.config.mjs` when the project has `"type": "module"` in `package.json`.
**Why it happens:** The `.mjs` extension is for ESM when the package is CommonJS by default. When `"type": "module"`, `.js` files are already ESM.
**How to avoid:** Use `eslint.config.js` for this project.
**Warning signs:** ESLint cannot find config file, or double-ESM loading errors.

### Pitfall 5: Vitest Version Mismatch with Coverage Package

**What goes wrong:** `@vitest/coverage-v8` version must match the installed `vitest` version. Mismatch causes runtime errors.
**Why it happens:** These are sibling packages in the vitest monorepo; they must be at the same version.
**How to avoid:** Install both with the same version specifier: `npm install -D @vitest/coverage-v8@2` if vitest is `^2.0.0`.
**Warning signs:** `Error: The coverage provider "@vitest/coverage-v8" requires vitest@x.y.z but found vitest@a.b.c`.

### Pitfall 6: GitHub Actions `actions/checkout` Version

**What goes wrong:** Using `actions/checkout@v2` or `v3` which are deprecated and may fail on newer runners.
**Why it happens:** Stale documentation.
**How to avoid:** Use `actions/checkout@v4` (current stable) and `actions/setup-node@v4`.

---

## Code Examples

Verified patterns from official sources:

### Complete vitest.config.ts

```typescript
// Source: https://vitest.dev/guide/coverage + https://vitest.dev/guide/reporters
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts',
        'src/server.ts',
        'src/hook-handler.ts',
        'src/hooks/watcher.ts',
        'src/commands/**/*.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      reporter: ['text', 'json', 'html'],
    },
    reporters: process.env.GITHUB_ACTIONS
      ? ['dot', 'github-actions']
      : ['default'],
  },
})
```

### Complete eslint.config.js

```javascript
// Source: https://context7.com/typescript-eslint/typescript-eslint
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig,

  // No console.log in MCP server src/ (PKG-03 enforcement)
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  // CLI and commands directories: console.log is fine
  {
    files: ['src/cli.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Test files: loosen some rules
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
```

### Minimal .prettierrc

```json
{
  "singleQuote": false,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "es5"
}
```

### Config module test (no external mocks needed)

```typescript
// src/config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('validates required env vars', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-valid-token'
    process.env.SLACK_CHANNEL_ID = 'C123456'
    const { loadConfig } = await import('./config.js')
    const config = loadConfig()
    expect(config.SLACK_BOT_TOKEN).toBe('xoxb-valid-token')
    expect(config.POLL_TIMEOUT_MS).toBe(600000) // default
  })

  it('exits if SLACK_BOT_TOKEN missing', async () => {
    delete process.env.SLACK_BOT_TOKEN
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const { loadConfig } = await import('./config.js')
    expect(() => loadConfig()).toThrow('process.exit called')
    exitSpy.mockRestore()
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.eslintrc.js` / `.eslintrc.json` | `eslint.config.js` (flat config) | ESLint 9.0 (2024) | Flat config is now default; legacy format deprecated, removed in v10 |
| `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` separately | `typescript-eslint` unified package | 2023-2024 | One package replaces two; `tseslint.config()` is the new setup helper |
| `jest` for TypeScript projects | `vitest` | 2022+ | Vitest is ESM-native; no `ts-jest` or `babel-jest` transform needed |
| `coverage.all: true` in vitest | `coverage.include` pattern | Vitest v4 | `all` option removed; use explicit include |
| `actions/checkout@v2`, `setup-node@v3` | `actions/checkout@v4`, `setup-node@v4` | 2023-2024 | v4 is current stable for both |

**Deprecated/outdated:**
- `coverage.all`: Removed in Vitest v4; use `coverage.include` instead
- `.eslintrc.*` family: Deprecated in ESLint 9; will be removed in ESLint 10
- `@typescript-eslint/eslint-plugin` as a standalone package: Superseded by `typescript-eslint` unified

---

## Open Questions

1. **Achievable coverage threshold with entry-point exclusions**
   - What we know: Entry-point files (server.ts, hook-handler.ts, cli.ts, watcher.ts) are process scripts that are hard to unit test. With them excluded, the remaining src/ code should be testable.
   - What's unclear: Whether the wizard commands (`src/commands/setup.ts`, `src/wizard/`) and the `ask-human.ts` tool handler can actually reach 90% without requiring integration-level mocking of the full MCP server lifecycle.
   - Recommendation: Exclude `src/commands/**` and entry points from coverage. Start at 85% threshold; bump to 90% once actual coverage is measured. The CONTEXT.md says "Claude can adjust if practical."

2. **ESLint fix pass on existing code**
   - What we know: All existing source files use `console.error()` not `console.log()`, so the custom no-console rule should pass without changes. However, typescript-eslint recommended rules may flag other patterns.
   - What's unclear: Whether any existing code has `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-floating-promises`, or other patterns that will fail under recommended rules.
   - Recommendation: The first task of the phase (per CONTEXT.md) is the lint fix pass. Run `eslint src --fix` after setting up config, then manually address any remaining violations.

3. **Integration test suite for real Slack API**
   - What we know: Decision says optional integration tests should skip gracefully in CI when tokens are not available.
   - What's unclear: The exact mechanism — environment variable check, Vitest `test.skipIf`, or a separate test file glob.
   - Recommendation: Use `test.skipIf(!process.env.SLACK_BOT_TOKEN)` from Vitest's built-in API. Name integration test files `*.integration.test.ts` and exclude them from the default `npm test` glob (add them to a separate `npm run test:integration` script).

---

## Sources

### Primary (HIGH confidence)
- `/websites/vitest_dev` (Context7) — coverage configuration, provider setup, vi.mock patterns, GitHub Actions reporter, module mocking
- `/typescript-eslint/typescript-eslint` (Context7) — flat config setup, tseslint.config(), eslint-config-prettier integration
- `/eslint/eslint` (Context7) — no-console rule options, flat config glob patterns, file-scoped rule overrides
- https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs — GitHub Actions Node.js workflow, matrix strategy, setup-node@v4, npm cache
- https://vitest.dev/guide/coverage.html — coverage providers, thresholds, reporters, install commands

### Secondary (MEDIUM confidence)
- https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/using-a-matrix-for-your-jobs — matrix syntax `node-version: [18, 20, 22]`

### Tertiary (LOW confidence)
- None — all critical claims verified with Context7 or official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via Context7 and official docs; vitest already in devDependencies
- Architecture: HIGH — vitest.config.ts patterns verified from official docs; eslint flat config verified from typescript-eslint official docs; GHA workflow verified from GitHub docs
- Pitfalls: HIGH for ESM/hoisting pitfall (verified against Vitest docs); MEDIUM for coverage threshold practicality (depends on actual coverage run)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — these are stable tools)
