# Stack Research

**Domain:** MCP server + Claude Code hook integration + Slack notifications (npm package)
**Researched:** 2026-02-22
**Confidence:** HIGH for core stack; MEDIUM for hook interception strategy (open issues documented below)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `^1.27.0` | MCP server framework — exposes the `ask_human_via_slack` tool | Official Anthropic SDK, the only viable option for building MCP servers in TypeScript; v1.x is stable for production, v2 is pre-alpha as of Feb 2026 |
| `@slack/web-api` | `^7.14.1` | Slack REST API client — send Block Kit messages, poll threads | Official Slack SDK, v7 adds strict TypeScript types for all 130+ API methods; polling model avoids Socket Mode complexity |
| `zod` | `^3.25.0` | Runtime schema validation for tool inputs | Required peer dep of `@modelcontextprotocol/sdk`; SDK uses Zod v4 internally but is backwards-compatible with `>=3.25.0`. Use v3 to avoid Zod v4 migration friction until ecosystem catches up |
| TypeScript | `^5.7.0` | Language | Required by all dependencies; `@slack/web-api` v7 tests against TypeScript 5.3.x+; `@modelcontextprotocol/sdk` ships its own types |
| Node.js | `>=20.0.0` | Runtime — MCP servers run as stdio processes | `@slack/web-api` v7 minimum is Node.js 18; Node.js 20 is the current LTS and the safe minimum for all dependencies |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsup` | `^8.x` | TypeScript bundler for npm packaging | Building the published npm artifact; tsup uses esbuild under the hood, zero-config, supports CJS+ESM dual output — critical for a CLI npm package that must run with `node` directly |
| `@types/node` | `^20.x` | Node.js type definitions | Dev dependency; always needed for process.stdin, process.stdout, setTimeout, etc. |
| `vitest` | `^2.x` | Test framework | Faster than Jest, native TypeScript + ESM support without extra config, compatible with tsup builds |
| `tsx` | `^4.x` | Run TypeScript files directly during development | Preferred over `ts-node` for dev scripts and hook scripts; faster startup, ESM-compatible |
| `prettier` | `^3.x` | Code formatting | Consistent style; negligible setup cost |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsup` | Build TypeScript → CJS+ESM for npm publish | Config: `entry: ['src/index.ts', 'src/hooks/index.ts']`, `format: ['cjs', 'esm']`, `dts: true`. The hook scripts need to be separate entry points since they are invoked as standalone processes by Claude Code |
| `vitest` | Unit + integration tests | Mock `@slack/web-api` with `vi.mock`, test hook scripts by simulating stdin JSON payloads |
| TypeScript `strict: true` | Catch errors at compile time | Especially important since hook scripts handle arbitrary JSON from Claude Code's stdin |
| npm `bin` field | Expose hook script as a CLI command | Hook scripts are invoked by Claude Code as shell commands; the `bin` field in `package.json` makes `signal-flare-hook` available after `npm install -g` |

## Installation

```bash
# Core runtime dependencies
npm install @modelcontextprotocol/sdk @slack/web-api zod

# Dev dependencies
npm install -D typescript tsup vitest @types/node tsx prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@modelcontextprotocol/sdk` v1.x | v2 (pre-alpha) | Never for production; check back Q2 2026 when v2 stabilizes |
| `@slack/web-api` polling | Slack Socket Mode (`@slack/socket-mode`) | When you need real-time event subscriptions and can manage a persistent WebSocket; overkill for low-frequency question/answer flow |
| `tsup` | `tsc` + `esbuild` separately | When you need fine-grained build control; tsup handles the CJS+ESM dual publish problem automatically which is notoriously painful in 2025/2026 TypeScript |
| `vitest` | `jest` | Never for new TypeScript projects; Jest requires extra transform config for TypeScript + ESM; vitest works out of the box with tsup-built packages |
| `zod` v3 | `zod` v4 | Use v4 only if all your dependencies have migrated; v4 has breaking schema changes that affect `@modelcontextprotocol/sdk` peer dep resolution |
| Polling (`conversations.replies`) | Slack RTM API | RTM is deprecated; REST polling is the correct v1 approach |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@slack/rtm-api` | Deprecated by Slack; Socket Mode replaced RTM | `@slack/web-api` with polling or `@slack/socket-mode` |
| `ts-node` | Slow startup (~800ms), poor ESM support, conflicts with `"type": "module"` | `tsx` for dev execution; `tsup` for builds |
| `express` or `fastify` in the MCP server | MCP stdio transport does NOT use HTTP; adding a web server is unnecessary complexity for a CLI tool | Pure `@modelcontextprotocol/sdk` with `StdioServerTransport` |
| `console.log()` in hook scripts or MCP server | stdout is the JSON-RPC channel for MCP stdio transport; `console.log()` corrupts the protocol | `console.error()` for all logging (writes to stderr) |
| `@modelcontextprotocol/sdk` v2 | Pre-alpha as of Feb 2026, API not stable | v1.27.0 |
| Zod v4 today | `@modelcontextprotocol/sdk` peer dep compatibility is still settling; Zod v4 has breaking changes | Zod `^3.25.0` until SDK explicitly requires v4 |

## Stack Patterns by Variant

**The MCP server (invoked by Claude Code via stdio):**
- Entry: `src/server.ts` → `StdioServerTransport` from `@modelcontextprotocol/sdk`
- Tool: `ask_human_via_slack` — posts Block Kit message, polls thread, returns answer
- Log only to `stderr` (never `stdout`)
- Build target: compiled Node.js script in `dist/server.js`

**The Claude Code hook scripts (invoked as shell commands):**
- Entry: `src/hooks/*.ts` — separate entry points compiled by tsup
- Pattern: read JSON from `process.stdin`, extract event data, call Slack, exit 0/2
- These are short-lived processes spawned and killed by Claude Code per event
- Use the `Notification` hook with `matcher: "idle_prompt"` to detect when Claude is waiting for input
- Use the `Stop` hook to detect task completion
- Use `PostToolUseFailure` with `matcher: "*"` for error detection
- The hook scripts are NOT the MCP server; they are separate processes

**For the npm package:**
- Expose both the MCP server and the hook installer via `package.json` `bin` field
- `signal-flare` → launches the MCP server (users add to `claude_desktop_config.json` or `.claude/mcp.json`)
- `signal-flare-install-hooks` → writes hook config to `~/.claude/settings.json`

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@modelcontextprotocol/sdk@^1.27.0` | `zod@^3.25.0` | SDK uses Zod v4 internally via `zod/v4` compatibility shim; consumer can use v3 |
| `@slack/web-api@^7.x` | `typescript@^5.3` | v7 requires TypeScript 5.3+ for full strict mode type safety |
| `@slack/web-api@^7.x` | `node@>=18` | v7 dropped Node.js 14/16; use 20 as the minimum |
| `tsup@^8.x` | `typescript@^5.x` | tsup 8 uses esbuild 0.21+ and requires TypeScript 5 |
| `vitest@^2.x` | `node@>=18` | Vitest 2 dropped Node.js 16 support |

## Critical Constraint: AskUserQuestion Hook Gap

**This is the most important stack-level finding for Signal Flare.**

Claude Code does NOT have a hook that fires precisely when Claude calls `AskUserQuestion` and allows the hook to inject an answer programmatically. Multiple open GitHub issues request this (anthropics/claude-code #10168, #12605, #13830) but it is **unimplemented as of Feb 2026**.

**What is available instead:**

| Hook | Matcher | What It Detects | Can Inject Answer? |
|------|---------|-----------------|-------------------|
| `Notification` | `idle_prompt` | Fires ~1-2 seconds after Claude starts waiting for input (AskUserQuestion or permission dialogs) | No — notification only, no response injection |
| `PreToolUse` | `AskUserQuestion` | Fires before the AskUserQuestion call, receives the question text | No response injection; can only allow/deny the tool call; denying leaves Claude stuck |
| `Stop` | (no matcher) | Fires when Claude finishes a full response turn | Too late if Claude is waiting mid-response |

**Architecture implication:** Signal Flare's hook approach must be:
1. Hook fires (`Notification:idle_prompt`) → hook script posts question to Slack
2. User replies in Slack thread
3. MCP server (`ask_human_via_slack` tool) polls for that reply
4. But there is a **gap**: Claude must call `ask_human_via_slack` explicitly OR the hook must get the answer back to Claude's terminal somehow

The viable v1 architecture is: Claude calls `ask_human_via_slack` tool explicitly (via CLAUDE.md instructions or system prompt) + `Notification:idle_prompt` hook as a backup notification path. The "automatic interception with answer injection" feature requires an upstream Claude Code change.

## Sources

- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — version 1.27.0 confirmed
- [typescript-sdk GitHub releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) — v1.27.0 Feb 2025, v2 pre-alpha on main
- [@slack/web-api npm](https://www.npmjs.com/package/@slack/web-api) — version 7.14.1 confirmed
- [Slack web-api v7 migration guide](https://github.com/slackapi/node-slack-sdk/wiki/Migration-Guide-for-web%E2%80%90api-v7) — Node.js 18 minimum, TypeScript 5.3
- [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks) — full hook event schema, Notification matchers (`idle_prompt`, `elicitation_dialog`, `permission_prompt`, `auth_success`), `PreToolUse` for MCP tool interception (HIGH confidence — official Anthropic docs)
- [GitHub issue: AskUserQuestion hook support #12605](https://github.com/anthropics/claude-code/issues/12605) — closed as duplicate, feature unimplemented (MEDIUM confidence — issue tracker)
- [GitHub issue: UserInputRequired hook #10168](https://github.com/anthropics/claude-code/issues/10168) — open, confirms AskUserQuestion injection not possible (MEDIUM confidence)
- [GitHub issue: Notification hook delay #23383](https://github.com/anthropics/claude-code/issues/23383) — confirms `idle_prompt` fires for AskUserQuestion with 1-2s delay (MEDIUM confidence)
- [Zod v4 compatibility issue #555](https://github.com/modelcontextprotocol/typescript-sdk/issues/555) — confirms SDK compatibility with both Zod v3 and v4 (MEDIUM confidence)
- [MCP server TypeScript best practices — nearform.com](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — stdout/stderr constraint confirmed (MEDIUM confidence)

---
*Stack research for: Signal Flare — MCP server + Claude Code hook integration + Slack notifications*
*Researched: 2026-02-22*
