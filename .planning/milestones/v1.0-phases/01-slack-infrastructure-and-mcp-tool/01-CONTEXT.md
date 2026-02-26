# Phase 1: Slack Infrastructure and MCP Tool - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Working `ask_human_via_slack` MCP tool that sends rich Block Kit questions to Slack, polls for threaded replies with exponential backoff, and returns structured responses to Claude Code. Covers all SLCK-01 through SLCK-06 requirements. Hook integration, packaging, and setup wizard are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Message Design
- Rich context in every message: question text + code snippets + file paths + session info — include everything available
- Options rendered as numbered list ("Reply '1', '2', or '3' — or type a full response")
- High urgency: red color badge + bold question text + siren emoji + explicit @mention call-out
- Normal urgency: yellow badge, standard formatting
- Low urgency: green badge, minimal visual weight
- "Timed out" and "Response received" notices are full standalone messages in the thread (visible at a glance from thread list), not subtle context blocks
- @mention configured user (SLACK_USER_ID) in every message for push notifications

### Polling Behavior
- Exponential backoff: start at 3s, back off to 15s cap
- On 10-minute timeout: auto-retry once — post a "still waiting" bump message in the thread, reset timer for another 10 minutes, then error if still no reply
- Filter short replies: single emoji or single word (like "ok") don't count as real answers — require at least a few words; Claude gets the full text of substantive replies
- Bot's own messages never count as human replies (filter by bot_id and user_id)

### Tool Interface
- Tool name: `ask_human_via_slack`
- Parameters: question (required), context (optional), options (optional string[]), urgency (optional, default "normal"), session_id (optional — links Slack threads to Claude sessions)
- Tool description: broad — "Use when you need human input" so Claude calls it for any question
- MCP tool has an optional delay-before-sending (configurable, like prototype's 1-min delay) — separate from hook idle timeout in Phase 2
- Return format: structured — include who replied, response time, which numbered option was selected (if applicable), plus raw reply text

### Code Structure
- Split into separate modules: Slack client, Block Kit builder, poll manager, MCP server entry point — each independently testable
- Strict TypeScript types — no `as any` casts; define proper interfaces for all Block Kit structures including rich_text
- Zod validation everywhere: tool params (via MCP SDK), env vars at startup, Slack API response shapes — fail fast with clear errors
- Pin zod to ^3.25.0 — let MCP SDK's compatibility shim handle its internal v4 usage
- All logging via `console.error()` — zero `console.log()` (corrupts MCP stdio transport)

### Claude's Discretion
- Exact exponential backoff curve (starting interval, multiplier, jitter)
- How to detect "short replies" (character count, word count, or pattern matching)
- Internal module boundaries beyond the 4 named modules
- Error message wording for timeout, missing env vars, Slack API failures

</decisions>

<specifics>
## Specific Ideas

- Prior prototype (from user's earlier Claude chat) is the starting point — same `@modelcontextprotocol/sdk` + `@slack/web-api` stack, same Block Kit structure, but refactored into modules with strict types
- "Still waiting" bump message on first timeout should feel like a gentle nudge, not a second urgent alert
- Session ID param enables future thread continuation (Phase 2+ feature) without breaking the tool interface later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-slack-infrastructure-and-mcp-tool*
*Context gathered: 2026-02-22*
