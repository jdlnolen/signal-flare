# Requirements: Signal Flare

**Defined:** 2026-02-22
**Core Value:** When Claude Code needs you and you're not watching the terminal, Signal Flare gets the message to you in Slack and brings your response back — so Claude keeps working instead of sitting idle.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Slack Communication

- [ ] **SLCK-01**: User can send a question to Slack via `ask_human_via_slack` MCP tool and receive a threaded reply back in Claude Code
- [ ] **SLCK-02**: Slack messages use Block Kit formatting with header, context, divider, and urgency color coding (high=red, normal=yellow, low=green)
- [ ] **SLCK-03**: Messages include contextual information (current file path, error text, code snippets) extracted from hook stdin or tool parameters
- [ ] **SLCK-04**: Messages @mention the configured user (SLACK_USER_ID) for push notifications
- [ ] **SLCK-05**: Thread polling uses exponential backoff (3s initial, 15s cap) and configurable timeout (default 10 minutes)
- [ ] **SLCK-06**: Timeout posts a "timed out" notice in the Slack thread and returns an error to Claude

### Hook Integration

- [ ] **HOOK-01**: PermissionRequest hook detects when Claude calls AskUserQuestion and extracts question text and options
- [ ] **HOOK-02**: Idle timer (configurable, default 90s) delays Slack escalation — only posts to Slack if user hasn't responded in terminal
- [ ] **HOOK-03**: Stop hook sends task completion notification to Slack with last assistant message summary (async, non-blocking)
- [ ] **HOOK-04**: PostToolUseFailure hook sends error notification to Slack with error text and tool name (async, non-blocking)

### Packaging & Distribution

- [ ] **PKG-01**: Published as npm global package (`npm install -g signal-flare`)
- [ ] **PKG-02**: `signal-flare setup` wizard writes hook config to `~/.claude/settings.json` and MCP server config using absolute paths
- [ ] **PKG-03**: All logging uses `console.error()` — zero `console.log()` calls in MCP server code
- [ ] **PKG-04**: Configuration via environment variables: SLACK_BOT_TOKEN (required), SLACK_CHANNEL_ID (required), SLACK_USER_ID (optional)
- [ ] **PKG-05**: Polished README with Slack app creation guide, required scopes, setup instructions, troubleshooting, and demo GIF
- [ ] **PKG-06**: Test suite with good coverage (MCP tool, hook handler, Slack client, polling logic)
- [ ] **PKG-07**: GitHub Actions CI pipeline (lint, typecheck, test on PR)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced UX

- **UX-01**: First-response-wins — question shows in terminal AND Slack, whichever gets answered first is used
- **UX-02**: Thread continuation — route follow-up questions in the same session to the same Slack thread
- **UX-03**: Configurable per-project settings beyond environment variables

### Multi-User / Multi-Channel

- **MULTI-01**: Route different notification types to different Slack channels
- **MULTI-02**: Support multiple users with per-user @mention routing

### Platform

- **PLAT-01**: Plugin format (`.claude/plugins/signal-flare/`) if Anthropic's plugin system matures
- **PLAT-02**: Digest mode — batch multiple notifications into one Slack message during intensive sessions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Slack Socket Mode / Events API | Adds WebSocket complexity + app-level token; polling is imperceptible for human response times |
| OAuth flow for Slack setup | Requires web server + redirect URLs; manual bot token takes 5 minutes |
| Interactive Slack buttons | Requires Slack Interactivity endpoint; incompatible with polling-only architecture |
| Webhook-only mode | Can't read replies — bidirectional is the core value prop |
| Intercepting tool calls beyond AskUserQuestion | Creates notification spam; hundreds of hook fires per session |
| Conversation history / audit log | Scope creep + security concern; Claude Code's transcript system handles this |
| Desktop notifications | Signal Flare is Slack-first for when you're NOT at the machine |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SLCK-01 | — | Pending |
| SLCK-02 | — | Pending |
| SLCK-03 | — | Pending |
| SLCK-04 | — | Pending |
| SLCK-05 | — | Pending |
| SLCK-06 | — | Pending |
| HOOK-01 | — | Pending |
| HOOK-02 | — | Pending |
| HOOK-03 | — | Pending |
| HOOK-04 | — | Pending |
| PKG-01 | — | Pending |
| PKG-02 | — | Pending |
| PKG-03 | — | Pending |
| PKG-04 | — | Pending |
| PKG-05 | — | Pending |
| PKG-06 | — | Pending |
| PKG-07 | — | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
