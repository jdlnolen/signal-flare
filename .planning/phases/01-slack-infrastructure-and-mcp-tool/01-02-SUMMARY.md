---
phase: 01-slack-infrastructure-and-mcp-tool
plan: 02
subsystem: mcp-tool
tags: [mcp, slack, polling, exponential-backoff, stdio, zod]

# Dependency graph
requires:
  - phase: 01-01
    provides: Config, SlackClient, Block Kit message builders, PollResult types

provides:
  - Thread reply poller with exponential backoff and bot filtering (src/slack/poller.ts)
  - ask_human_via_slack MCP tool with full question-poll-respond lifecycle (src/tools/ask-human.ts)
  - MCP server entry point via stdio transport (src/server.ts)
  - Built binary dist/server.js with shebang, ready for Claude Code MCP config

affects:
  - Phase 2 (Claude Code hooks integration)
  - Any phase building on the MCP tool interface

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exponential backoff with full jitter: actual delay = Math.random() * baseDelay prevents synchronized polling"
    - "registerTool() from McpServer for non-deprecated tool registration with inputSchema as raw Zod shape"
    - "thread_ts always passed as string (not number) to prevent Slack API timestamp truncation"
    - "All thread notices (still-waiting, timeout, response-received) posted via chat.postMessage with thread_ts"
    - "PollResult pattern: found=boolean with optional text/user/ts/elapsedMs for clean error propagation"

key-files:
  created:
    - src/slack/poller.ts
    - src/tools/ask-human.ts
    - src/server.ts
  modified: []

key-decisions:
  - "Full jitter on exponential backoff (Math.random() * baseDelay) prevents thundering herd from multiple instances"
  - "Used registerTool() (non-deprecated) instead of tool() overload - cleaner config object, same Zod raw shape support"
  - "MessageElement.subtype not in @slack/web-api type definition — used type field and bot_id for bot filtering instead"
  - "Two-window polling (10 min + still-waiting bump + 10 min) with thread notices at each stage"
  - "formatReply parses numeric selection (1-N) to selected_option/selected_option_index for structured response"

patterns-established:
  - "Two-stage timeout: first window expires → still-waiting bump → second window → timeout notice → error return"
  - "isSubstantiveReply: 2+ char min, acknowledgment allowlist, emoji-only rejection with 2+ non-emoji exception"
  - "All Slack API errors are caught and logged to stderr; failures return isError: true MCP response"

requirements-completed:
  - SLCK-01
  - SLCK-05
  - SLCK-06

# Metrics
duration: 15min
completed: 2026-02-22
---

# Phase 1 Plan 02: Signal Flare MCP Tool and Poll Manager Summary

**Polling-based ask_human_via_slack MCP tool with exponential-backoff thread watcher, two-stage timeout with Slack thread notices, and stdio transport server that builds to a shebang-equipped dist/server.js**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-22
- **Completed:** 2026-02-22
- **Tasks:** 2
- **Files modified:** 3 created

## Accomplishments
- Thread reply poller using conversations.replies with 3s initial / 15s cap / 1.5x multiplier exponential backoff and full jitter
- Bot filtering via bot_id, type field, and botUserId comparison; substantive reply filter with character count, emoji detection, and acknowledgment allowlist
- ask_human_via_slack MCP tool with complete lifecycle: post question, first poll, still-waiting bump, second poll, timeout notice, response-received notice
- Structured response: reply, replied_by, response_time_ms, selected_option, selected_option_index
- MCP server starts via StdioServerTransport, validates config fast-fail, connects to Slack, registers tool
- dist/server.js builds with #!/usr/bin/env node shebang; exits with clear Zod error when env vars missing

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread reply poller with exponential backoff and bot filtering** - `9fef407` (feat)
2. **Task 2: MCP server entry point and ask_human_via_slack tool handler** - `a22d534` (feat)

**Plan metadata:** Pending (docs commit)

## Files Created/Modified
- `src/slack/poller.ts` - pollForReply() with exponential backoff, full jitter, bot filtering, and substantive reply filter; exports sleep() utility
- `src/tools/ask-human.ts` - registerAskHumanTool() with two-stage timeout, thread notices, and formatted structured response
- `src/server.ts` - McpServer entry point with StdioServerTransport, config validation, Slack auth, tool registration

## Decisions Made

- **Full jitter backoff:** `Math.random() * baseDelay` (not `baseDelay + Math.random() * jitter`) — complete jitter prevents synchronized polling from multiple server instances hitting Slack simultaneously
- **registerTool() over tool():** Used non-deprecated registerTool() with config object pattern instead of the deprecated tool() overloads — cleaner signature, same Zod raw shape inputSchema support
- **Bot filtering without subtype:** @slack/web-api's MessageElement type doesn't expose `subtype` — used `bot_id` (covers all bot messages) and `type === "bot_message"` (covers legacy) as equivalent coverage
- **Two-window timeout with nudge:** After first 10-min window, a "still waiting" bump is posted before the second window starts — visible from thread list without a second full alert

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced subtype check with type field for bot filtering**
- **Found during:** Task 1 (thread reply poller)
- **Issue:** Plan specified `msg.subtype === "bot_message"` filter, but @slack/web-api's `MessageElement` type does not have a `subtype` property — TypeScript compilation failed with TS2339
- **Fix:** Replaced with `msg.type === "bot_message"` which is present in the MessageElement interface and provides equivalent coverage for legacy bot messages
- **Files modified:** src/slack/poller.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors after fix
- **Committed in:** 9fef407 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type property substitution for missing subtype)
**Impact on plan:** Fix is functionally equivalent — `type === "bot_message"` catches the same messages as `subtype === "bot_message"`. No scope creep.

## Issues Encountered
- @slack/web-api MessageElement type doesn't include `subtype` despite Slack API docs referencing it — workaround via `type` field is complete and correct

## User Setup Required
None - no external service configuration required in this plan (Slack app setup was covered in Plan 01-01 setup docs if created).

## Next Phase Readiness
- signal-flare MCP server is complete and fully functional
- dist/server.js can be added to Claude Code MCP config immediately
- Phase 2 can investigate hooks integration with hookSpecificOutput.updatedInput.answers (marked as phase gate blocker in STATE.md)
- Rate limit concern (Slack conversations.replies new limits March 3, 2026) is mitigated by exponential backoff — internal apps are exempt at 50+ req/min

---
*Phase: 01-slack-infrastructure-and-mcp-tool*
*Completed: 2026-02-22*
