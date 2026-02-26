# Signal Flare

## What This Is

Signal Flare is an npm package that bridges Claude Code and Slack for hands-off coding sessions. It uses Claude Code hooks to detect when Claude needs human input, hits an error, or finishes a long task — then sends rich Slack notifications so you can respond from your phone or another screen. When you're at the terminal, it stays out of the way. When you're not, it fires a flare.

## Core Value

When Claude Code needs you and you're not watching the terminal, Signal Flare gets the message to you in Slack and brings your response back — so Claude keeps working instead of sitting idle.

## Requirements

### Validated

- ✓ MCP server with `ask_human_via_slack` tool for bidirectional Slack communication — v1.0
- ✓ Claude Code hook that intercepts `AskUserQuestion` and routes to Slack after idle timeout — v1.0
- ✓ Rich Block Kit messages in Slack with urgency levels, context, and numbered options — v1.0
- ✓ Error notifications: alert in Slack when Claude Code hits errors — v1.0
- ✓ Task completion notifications: ping in Slack when long-running tasks finish — v1.0
- ✓ Configurable idle timeout before escalating to Slack (default 90s) — v1.0
- ✓ npm package installable via `npm install -g signal-flare` — v1.0
- ✓ Slack app setup with bot token scopes (chat:write, channels:history, groups:history) — v1.0
- ✓ Environment-based configuration (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID) — v1.0
- ✓ Test suite with 158 tests at 90.73% coverage — v1.0
- ✓ GitHub Actions CI pipeline (lint, typecheck, test) — v1.0
- ✓ Polished README with setup guide and troubleshooting — v1.0

### Active

- [ ] First-response-wins: question shows in terminal AND Slack, whichever gets answered first is used
- [ ] Published to npm registry
- [ ] Demo GIF for README

### Out of Scope

- Slack Socket Mode / Events API — polling is simpler and sufficient for v1
- Intercepting tool calls other than AskUserQuestion — keep hook scope narrow
- Multi-channel or multi-user support — single channel, single user for v1
- OAuth flow for Slack setup — manual bot token configuration is fine
- Mobile app or desktop notifications beyond Slack — Slack handles that
- Conversation history / audit log — Claude Code's transcript system handles this

## Context

Shipped v1.0 with 4,649 LOC TypeScript across 81 files.
Tech stack: Node.js, TypeScript, @modelcontextprotocol/sdk, @slack/web-api, Zod, tsup, Vitest.
158 tests, 90.73% statement coverage, GitHub Actions CI.

Known technical consideration: Slack `conversations.replies` rate limits changing March 3, 2026 — mitigated by exponential backoff and per-user Slack app architecture (internal apps exempt at 50+ req/min).

`PermissionRequest.hookSpecificOutput.updatedInput.answers` answer-injection mechanism is unverified — first-response-wins deferred to v2.

## Constraints

- **Runtime**: Node.js — MCP servers run as stdio processes
- **Slack API**: REST API with polling (not Socket Mode) for v1 simplicity
- **Claude Code hooks**: Must conform to Claude Code's hook system for intercepting AskUserQuestion
- **Package size**: Keep dependencies minimal — @modelcontextprotocol/sdk, @slack/web-api, zod

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Polling over Socket Mode | Simpler architecture, no persistent WebSocket needed, sufficient for low-frequency questions | ✓ Good — works reliably |
| Hook-based interception with idle fallback | Automatic UX without requiring Claude to explicitly call a tool; idle timer prevents spamming Slack when user is active in terminal | ✓ Good — 90s default feels right |
| Notification-only hooks (not first-response-wins) | answer-injection mechanism unverified; MCP tool as primary bidirectional path | ✓ Good — simpler, deferred FRW to v2 |
| Single npm package (MCP server + hooks) | One install, one config — reduces setup friction | ✓ Good — wizard handles all config |
| ESM module format with Node16 resolution | Required by MCP SDK and @slack/web-api | ✓ Good |
| auth.test() at startup for token validation + bot ID | One API call validates token AND resolves bot user ID | ✓ Good |
| Attachment wrapper for Slack color bars | Top-level blocks don't support color; attachment wrapper is the correct pattern | ✓ Good |
| createSlackClientDirect for hooks (no auth.test) | Hook handlers are fire-and-forget; don't need bot ID for polling | ✓ Good |
| 85% coverage threshold | Conservative starting point; actual coverage exceeds at 90.73% | ✓ Good |

---
*Last updated: 2026-02-26 after v1.0 milestone*
