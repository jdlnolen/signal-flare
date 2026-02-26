# Phase 2: Hook Integration - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatic Slack notifications for three Claude Code hook events — PermissionRequest (all permission prompts including AskUserQuestion), Stop (task completion), and PostToolUseFailure (errors). Hooks fire immediately, never block Claude Code, and reuse Phase 1's Slack client and Block Kit builder. The MCP tool, packaging, and setup wizard are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Notification Content & Tone
- Task completion (Stop hook): one-line summary sentence of what Claude accomplished, extracted from last assistant message
- Error notifications (PostToolUseFailure): include tool name, error text, AND file path / command context
- All notification types use a unified Block Kit layout (same structure as Phase 1 messages) with a text label ("COMPLETED", "ERROR", "QUESTION", "PERMISSION") to differentiate — not distinct color bars per type
- Reuse Phase 1's Block Kit builder for rich formatting across all notification types — consistent look for all Signal Flare messages

### Idle Timeout & Cancellation
- All notifications fire to Slack immediately — no delay before sending
- One global configurable timeout (env var, default 90s) — applies as the "resolved in terminal" detection window for questions/permission prompts
- If user answers a question in terminal within the 90s window, post a "resolved in terminal" reply in the Slack thread
- Errors and completions have no cancellation window (fire-and-forget, no terminal response expected)

### Hook Handler Execution Model
- Hook handler is a separate entry point: `dist/hook-handler.js` (not the MCP server, not a CLI subcommand)
- Hook config in Claude Code settings points to `node /path/to/signal-flare/dist/hook-handler.js`
- Shares configuration via same environment variables as MCP server (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_USER_ID)
- Hook handler exits immediately after sending the Slack notification (non-blocking)
- For the 90s "resolved in terminal" watcher: hook spawns a detached background process, then exits — background process handles the thread update if terminal response detected

### Question Detection & Extraction
- PermissionRequest hook fires for ALL permission prompts, not just AskUserQuestion — every file write, bash command, etc. triggers a Slack notification
- Every permission prompt gets its own individual Slack notification — no batching or throttling
- For AskUserQuestion: show full question text and numbered options in Slack (same format as Phase 1 MCP tool) — user can reply with a number
- For non-AskUserQuestion permission prompts: show tool name + the specific action being requested (e.g., "Claude wants to run: Bash: npm install")

### Claude's Discretion
- Whether to use one handler script that routes internally or separate scripts per event type
- How to detect "resolved in terminal" (file watcher, process polling, or Claude Code API)
- Exact stdin JSON parsing approach for each hook event type
- Error message wording and formatting details

</decisions>

<specifics>
## Specific Ideas

- The "resolved in terminal" thread update should be a clean closure — like the "Response received" notice from Phase 1, not a noisy second alert
- Since all permissions fire individually, the Slack channel will be a real-time activity log of Claude Code sessions — user explicitly wants full visibility over spam reduction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-hook-integration*
*Context gathered: 2026-02-22*
