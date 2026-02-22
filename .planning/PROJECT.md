# Signal Flare

## What This Is

Signal Flare is an npm package that bridges Claude Code and Slack for hands-off coding sessions. It uses Claude Code hooks to detect when Claude needs human input, hits an error, or finishes a long task — then sends rich Slack notifications so you can respond from your phone or another screen. When you're at the terminal, it stays out of the way. When you're not, it fires a flare.

## Core Value

When Claude Code needs you and you're not watching the terminal, Signal Flare gets the message to you in Slack and brings your response back — so Claude keeps working instead of sitting idle.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server with `ask_human_via_slack` tool for bidirectional Slack communication
- [ ] Claude Code hook that intercepts `AskUserQuestion` and routes to Slack after idle timeout (1-2 minutes)
- [ ] First-response-wins: question shows in terminal AND Slack, whichever gets answered first is used
- [ ] Rich Block Kit messages in Slack with urgency levels, context, and numbered options
- [ ] Error notifications: alert in Slack when Claude Code hits errors or gets stuck
- [ ] Task completion notifications: ping in Slack when long-running tasks finish
- [ ] Configurable idle timeout before escalating to Slack
- [ ] npm package installable via `npm install -g signal-flare`
- [ ] Slack app setup with bot token scopes (chat:write, channels:history, groups:history)
- [ ] Environment-based configuration (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)
- [ ] Test suite with good coverage
- [ ] GitHub Actions CI pipeline
- [ ] Polished README with logo, demo GIF, setup guide, and troubleshooting
- [ ] Published to npm registry

### Out of Scope

- Slack Socket Mode / Events API — polling is simpler and sufficient for v1
- Intercepting tool calls other than AskUserQuestion — keep hook scope narrow
- Multi-channel or multi-user support — single channel, single user for v1
- OAuth flow for Slack setup — manual bot token configuration is fine
- Mobile app or desktop notifications beyond Slack — Slack handles that

## Context

A prior prototype exists as a TypeScript MCP server using `@modelcontextprotocol/sdk` and `@slack/web-api`. It implements the core `ask_human_via_slack` tool with Block Kit messages, thread polling, and urgency-based delays. Signal Flare builds on this foundation by adding Claude Code hook integration for automatic question interception, error/completion notifications, and proper npm packaging.

Existing alternatives:
- **AskOnSlackMCP** (github.com/trtd56/AskOnSlackMCP) — Similar concept but designed for Claude Desktop, 60s timeout, no hook integration
- **claude-code-slack-bot** (github.com/mpociot/claude-code-slack-bot) — Opposite direction (user → Claude from Slack)
- **Official Claude Code in Slack** (Anthropic beta) — For delegating tasks from Slack, not for mid-session notifications

Signal Flare's differentiator: automatic hook-based interception with idle detection, not just an explicit tool Claude must choose to call.

## Constraints

- **Runtime**: Node.js — MCP servers run as stdio processes
- **Slack API**: REST API with polling (not Socket Mode) for v1 simplicity
- **Claude Code hooks**: Must conform to Claude Code's hook system for intercepting AskUserQuestion
- **Package size**: Keep dependencies minimal — @modelcontextprotocol/sdk, @slack/web-api, zod

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Polling over Socket Mode | Simpler architecture, no persistent WebSocket needed, sufficient for low-frequency questions | — Pending |
| Hook-based interception with idle fallback | Automatic UX without requiring Claude to explicitly call a tool; idle timer prevents spamming Slack when user is active in terminal | — Pending |
| First-response-wins (terminal + Slack) | User isn't locked into one interface; flexibility to answer wherever convenient | — Pending |
| Single npm package (MCP server + hooks) | One install, one config — reduces setup friction | — Pending |

---
*Last updated: 2026-02-22 after initialization*
