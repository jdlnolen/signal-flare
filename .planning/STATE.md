# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** When Claude Code needs you and you're not watching the terminal, Signal Flare gets the message to you in Slack and brings your response back — so Claude keeps working instead of sitting idle.
**Current focus:** Phase 3 (npm Packaging and Setup Wizard) — Plans 01 and 02 complete, Plan 03 is next

## Current Position

Phase: 3 of 4 (npm Packaging and Setup Wizard) — IN PROGRESS
Plan: 2 of 3 in current phase — COMPLETE
Status: Phase 3 Plan 02 complete — Setup wizard, test command, and status command implemented with full Slack validation and safe config merging
Last activity: 2026-02-22 — Completed Plan 03-02 (setup wizard, test/status commands, wizard utilities)

Progress: [██████░░░░] 62%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 5 min
- Total execution time: 33 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-slack-infrastructure-and-mcp-tool | 2 | 18 min | 9 min |
| 02-hook-integration | 2 | 10 min | 5 min |
| 03-npm-packaging-and-setup-wizard | 2 | 5 min | 2.5 min |

**Recent Trend:**
- Last 5 plans: 4 min avg
- Trend: Accelerating

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Research]: Build `ask_human_via_slack` MCP tool as primary path; treat hook answer-injection as enhancement pending verification of `hookSpecificOutput.updatedInput.answers`
- [Research]: Polling over Socket Mode — simpler architecture, sufficient for human response timescales
- [Research]: Each user creates their own Slack app (internal app) to stay exempt from Slack rate limits on `conversations.replies`
- [Research]: stdout constraint is non-negotiable — `console.log()` corrupts MCP JSON-RPC stream; lint rule from day one
- [01-01]: ESM module format with Node16 resolution required by MCP SDK and @slack/web-api
- [01-01]: Attachment wrapper (not top-level blocks) for Slack color bars — researched API pattern
- [01-01]: auth.test() at startup validates token AND resolves bot user ID in one call, cached in SlackClient
- [01-01]: SLACK_USER_ID is optional in Zod config; buildQuestionMessage accepts userId as separate param
- [01-02]: Full jitter backoff (Math.random() * baseDelay) prevents thundering herd from multiple instances
- [01-02]: registerTool() (non-deprecated) over tool() overloads — cleaner config object with inputSchema
- [01-02]: MessageElement.subtype not in @slack/web-api type — used type field + bot_id for equivalent bot filtering
- [01-02]: Two-stage timeout: 10-min poll → still-waiting bump → 10-min poll → timeout notice → error return
- [02-01]: createSlackClientDirect sets botUserId to "" — hook handlers never poll so bot filtering is not needed
- [02-01]: HookInputSchema uses z.discriminatedUnion on hook_event_name for correct type narrowing per event type
- [02-01]: buildHookMessage uses orange (#FFA500) for all hook notification types — locked decision (not distinct colors per type)
- [02-01]: tsup banner kept unchanged — shebang on watcher.ts is harmless since it's invoked via node explicitly
- [Phase 02-02]: extractSummary uses first sentence (split on [.!?] + whitespace) truncated to 200 chars — matches locked one-line summary decision
- [Phase 02-02]: stop_hook_active guard in handleStop prevents infinite hook loop
- [Phase 02-02]: isAskHuman uses .includes('ask_human_via_slack') not exact match — handles MCP naming convention
- [Phase 02-02]: Watcher logs to ~/.claude/signal-flare-watcher.log — detached stdio:ignore makes stderr invisible
- [03-01]: CLI shebang handled by tsup banner only — literal shebang in src/cli.ts causes double-shebang breaking ESM loading
- [03-01]: dotenv.config({ quiet: true }) used to suppress dotenv v17 verbose output in MCP server context
- [03-01]: resolveEnvFilePath() is synchronous (readFileSync at startup); SIGNAL_FLARE_ENV_FILE > ~/.config/signal-flare/config.json fallback
- [03-02]: PermissionRequest hook uses PreToolUse key with matcher ".*" — handler internally filters for AskUserQuestion
- [03-02]: hookCommand uses inline env var syntax (SIGNAL_FLARE_ENV_FILE=<path> <handler>) — no shell env inheritance needed
- [03-02]: promptForToken returns existing token on empty Enter — allows re-running setup without re-entering unchanged values
- [03-02]: status command checks both global and project config paths simultaneously for complete picture

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 gate]: `PermissionRequest.hookSpecificOutput.updatedInput.answers` answer-injection mechanism is unverified against actual Claude Code version. Phase 2 planning should include a research-phase step to verify before designing hook-answer coordination. Two outcomes: (a) injection works → first-response-wins achievable later; (b) not implemented → notification-only hooks, MCP tool as primary path.
- [Phase 1 mitigated]: Slack `conversations.replies` rate limit — new limits effective March 3, 2026 restrict non-Marketplace apps to 1 req/min. Mitigation: exponential backoff implemented from day one; users must create their own Slack app (internal apps exempt at 50+ req/min).

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 03-02-PLAN.md — Setup wizard, test/status commands, wizard utilities done, ready for Phase 3 Plan 03
Resume file: None
