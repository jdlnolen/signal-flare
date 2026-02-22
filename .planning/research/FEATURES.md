# Feature Research

**Domain:** Claude Code → Slack notification/feedback bridge (MCP server + hook integration)
**Researched:** 2026-02-22
**Confidence:** HIGH (verified against official Claude Code docs, GitHub issues, and live competitor repos)

---

## Competitive Landscape

### Tools Analyzed

| Tool | Direction | Hook-Based | Bidirectional | Urgency Levels | npm Package |
|------|-----------|-----------|---------------|----------------|-------------|
| AskOnSlackMCP (trtd56) | Claude → Slack | No (explicit tool call only) | Yes (thread reply) | No | No (npx) |
| slack-notification-mcp (Zavdielx89) | Claude → Slack | No (explicit tool call only) | No (send only) | Yes (good/warning/danger) | No |
| Slack Notifier MCP (Strand-AI) | Claude → Slack | No (explicit tool call only) | Yes (ask_user + thread poll) | Yes (normal/important/critical) | No |
| claude-code-slack-bot (mpociot) | Slack → Claude | No | Yes | No | No |
| Official Claude Code in Slack (Anthropic) | Slack → Claude | No | Yes | No | N/A |
| **Signal Flare (this project)** | **Claude → Slack** | **Yes (hook interception)** | **Yes** | **Yes** | **Yes** |

### Key Gap Signal Flare Fills

Every existing tool requires Claude to explicitly call a tool. None intercept AskUserQuestion automatically. Signal Flare's hook-based idle detection is a category-defining differentiator — no existing tool does this.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Send a Slack message from Claude | Core purpose of every comparable tool | LOW | Uses `@slack/web-api` `chat.postMessage`; all competitors have this |
| Block Kit message formatting | Slack's native rich format — plain text looks amateur | MEDIUM | Competitors use attachments with color, title, body; full Block Kit (sections, buttons) is higher effort |
| Thread-based reply collection | Users reply in Slack threads; bot needs to read those replies | MEDIUM | Requires polling `conversations.history` or `conversations.replies`; AskOnSlackMCP and Strand-AI both do this |
| Bot token scopes documented | Users need to know exactly what scopes to grant | LOW | All tools require `chat:write` minimum; `channels:history` or `groups:history` needed for reply polling |
| Environment-variable configuration | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` — industry standard | LOW | Hard-coding tokens is a non-starter; all tools use env vars |
| Timeout with fallback | If no Slack reply arrives, execution must not block forever | MEDIUM | AskOnSlackMCP uses 60s hard timeout; Strand-AI defaults 5 min, max 30 min; Signal Flare needs configurable timeout that falls back gracefully |
| Polished README with setup guide | npm packages live or die by their README | LOW | All successful npm packages in this space have step-by-step Slack app setup, scopes list, MCP config snippet |
| Published to npm | Required for `npm install -g signal-flare` | LOW | Straightforward registry publish; needs `bin` entry in package.json |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required but valued — and in Signal Flare's case, the primary reason to exist.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hook-based automatic interception (idle detection) | Claude asks in terminal AND Slack — user doesn't need to be watching | HIGH | Requires `PermissionRequest` hook (confirmed fires for AskUserQuestion per issue #13024) + idle timer logic; no competitor does this |
| First-response-wins (terminal + Slack simultaneously) | User can answer from wherever is convenient without being locked to one interface | HIGH | Requires coordinating two I/O paths; the hook must inject Slack-provided answer back to Claude via hook output; complex but unique |
| Configurable idle timeout | "Don't spam Slack if I'm sitting at the terminal" — prevents notification fatigue | MEDIUM | 1-2 min default before escalating; configurable via env var or config file |
| Error/stuck notification via PostToolUseFailure hook | Get paged when Claude hits errors without watching the terminal | MEDIUM | `PostToolUseFailure` hook provides `error` and `tool_name`; no competitor monitors for errors |
| Task completion notification via Stop hook | Know when a long task finishes without polling | LOW | `Stop` hook with `last_assistant_message` field provides rich completion context; easy to implement |
| Urgency levels in Slack messages | Visual priority hierarchy — error (red), question (yellow), done (green) | LOW | Color-coded Block Kit messages; Strand-AI does urgency, others use webhook colors; straightforward |
| Single npm package (MCP server + hook installer) | One install, one config — competitors require manual hook setup and separate MCP registration | MEDIUM | Requires `bin` script that writes hook config to `~/.claude/settings.json`; meaningful reduction in setup friction |
| Context-rich Block Kit messages | Include file being edited, error text, question text, session ID — not just "Claude needs you" | MEDIUM | Hook stdin contains `transcript_path`, `tool_name`, `tool_input`; can extract meaningful context |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Slack Socket Mode / Events API | "More real-time than polling" | Requires persistent WebSocket process, additional Slack app config (app-level token), more complex setup; polling at 2-3s intervals is imperceptible for human response times | REST API polling — simple, stateless, works with bot tokens only |
| Multi-channel / multi-user routing | "Route errors to one channel, questions to another" | Doubles configuration surface; complicates setup; v1 users likely solo developers | Single-channel v1; add routing in v1.x if users request it |
| OAuth flow for Slack setup | "Make it easier to auth" | OAuth requires a web server, redirect URLs, production Slack app approval; manual bot token is faster for developer tools | Manual bot token — documented clearly; takes 5 minutes |
| Webhook-only mode (outbound only) | "Simpler than full bot" | Webhooks can't read replies — bidirectional is the core value prop; send-only is just slack-notification-mcp | Bot token with polling; webhooks are a dead end for this use case |
| Intercepting tool calls beyond AskUserQuestion | "Notify on every file edit" | Creates notification spam; destroys focus; the hook fires potentially hundreds of times per session | Scope hooks narrowly: PermissionRequest (for questions), Stop (completion), PostToolUseFailure (errors) only |
| Storing conversation history / audit log | "Keep a record of all Claude sessions" | Scope creep; security concern (transcript contains code); not Signal Flare's job | Let Claude Code's transcript system handle this |
| Desktop notifications as primary UX | "Add macOS notifications too" | Signal Flare's value is Slack-first for when you're NOT at the machine; desktop notifications work only if you're at the machine | Out of scope; desktop notification hooks already exist as community scripts (alexop.dev pattern) |
| Interactive Slack buttons for multi-select responses | "Let me click buttons instead of typing" | Requires Slack Interactivity (a separate OAuth-linked endpoint), block action IDs, a persistent server to receive payloads; fundamentally incompatible with polling-only approach | Numbered text options in message ("Reply 1, 2, or 3") — simple, works with any Slack client including mobile |

---

## Feature Dependencies

```
[Slack message send]
    └──required by──> [Thread reply polling]
                          └──required by──> [Bidirectional Q&A (ask_human_via_slack tool)]
                          └──required by──> [First-response-wins coordination]

[PermissionRequest hook detection]
    └──required by──> [Idle timeout logic]
                          └──required by──> [Automatic hook-based interception]
                          └──required by──> [First-response-wins coordination]

[Slack message send] ──required by──> [Error notifications]
[Slack message send] ──required by──> [Task completion notifications]

[Stop hook] ──required by──> [Task completion notifications]
[PostToolUseFailure hook] ──required by──> [Error notifications]

[npm package setup] ──required by──> [Hook auto-installer]
[Hook auto-installer] ──enhances──> [Automatic hook-based interception]

[First-response-wins coordination] ──conflicts with──> [Webhook-only mode]
[Thread reply polling] ──conflicts with──> [Slack Socket Mode] (redundant, adds complexity)
```

### Dependency Notes

- **Thread reply polling requires Slack message send:** You must post a message (and capture its `ts` timestamp) before you can poll the thread for replies. The `ts` from `chat.postMessage` seeds the `conversations.replies` call.
- **PermissionRequest hook required for idle timeout:** The idle clock needs a start event. `PermissionRequest` fires before Claude blocks on AskUserQuestion (confirmed in issue #13024 discussion). Without this event, there is no trigger point for the idle timer.
- **First-response-wins requires both hooks and polling:** Terminal answer path (hook exit with injected answer) and Slack answer path (polling loop) must run concurrently and cancel each other. This is the most complex dependency chain.
- **Hook auto-installer enhances automatic interception:** Users could configure hooks manually, but the npm package is meaningless without hooks. The installer reduces setup to a single command.
- **Interactive Slack buttons conflict with polling:** Slack Interactivity delivers payloads via POST to a registered URL — incompatible with a CLI tool that has no persistent server. Use numbered text responses instead.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] `ask_human_via_slack` MCP tool — send a question to Slack with Block Kit formatting, poll for reply, return answer to Claude. This is the core value prop.
- [ ] Urgency levels (high/medium/low) — color-coded Block Kit messages (red/yellow/green). Minimal effort, meaningful UX.
- [ ] PermissionRequest hook for AskUserQuestion detection — fires automatically when Claude asks a question. Start the idle timer here.
- [ ] Idle timeout (configurable, default 90s) — only escalate to Slack if user hasn't responded in the terminal within the timeout. Prevents spam.
- [ ] Stop hook for task completion notifications — fire-and-forget Slack ping when Claude finishes a long task. Low complexity, high perceived value.
- [ ] PostToolUseFailure hook for error notifications — alert when Claude hits a tool error. Low complexity.
- [ ] Context extraction — include question text, current file (from `cwd`), session ID in every Slack message. No extra effort since hook stdin provides all this.
- [ ] Environment-variable configuration (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID) — industry standard; no setup friction.
- [ ] npm global package (`npm install -g signal-flare`) with setup wizard that writes hook config and MCP config.
- [ ] Polished README with Slack app setup walkthrough, required scopes, and demo GIF.

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] First-response-wins — add after v1 validates hook + Slack path independently. Requires coordinating two I/O paths; high complexity, adds the "magic" UX but is hard to build correctly.
- [ ] Configurable per-project settings (beyond env vars) — add when users report needing different timeouts per project.
- [ ] `SLACK_USER_ID` for @mentions — like AskOnSlackMCP, mention the user in Slack so they get a push notification. Small addition, high impact on mobile UX.
- [ ] Thread continuation — route follow-up questions in the same session to the same Slack thread for context continuity.
- [ ] Test suite with good coverage — add alongside or after v1 feature set is stable.
- [ ] GitHub Actions CI — add after first passing test suite.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Multi-channel routing (errors → #alerts, questions → #dev) — defer until users request it; adds config complexity.
- [ ] Plugin format (`.claude/plugins/signal-flare/`) — if Anthropic's plugin system matures, repackage as plugin instead of global hooks.
- [ ] Agent team / TeammateIdle hook support — useful if users run multi-agent Claude Code sessions; defer until common.
- [ ] Digest mode — batch multiple notifications over 5 minutes into one Slack message to reduce noise during intensive sessions.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| ask_human_via_slack MCP tool | HIGH | MEDIUM | P1 |
| PermissionRequest hook (AskUserQuestion detection) | HIGH | MEDIUM | P1 |
| Idle timeout before Slack escalation | HIGH | MEDIUM | P1 |
| Stop hook (task completion notification) | HIGH | LOW | P1 |
| PostToolUseFailure hook (error notification) | HIGH | LOW | P1 |
| Block Kit rich messages with urgency | MEDIUM | LOW | P1 |
| npm global package + setup wizard | HIGH | MEDIUM | P1 |
| Thread reply polling | HIGH | MEDIUM | P1 |
| Polished README + demo GIF | HIGH | LOW | P1 |
| @mention in Slack messages (SLACK_USER_ID) | MEDIUM | LOW | P2 |
| First-response-wins coordination | HIGH | HIGH | P2 |
| Thread continuation (same thread per session) | MEDIUM | MEDIUM | P2 |
| Test suite | MEDIUM | MEDIUM | P2 |
| GitHub Actions CI | LOW | LOW | P2 |
| Multi-channel routing | LOW | MEDIUM | P3 |
| Digest mode (batch notifications) | LOW | HIGH | P3 |
| Interactive Slack buttons | MEDIUM | HIGH | P3 (anti-feature in v1) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | AskOnSlackMCP | Slack Notifier MCP (Strand-AI) | slack-notification-mcp | **Signal Flare** |
|---------|---------------|-------------------------------|------------------------|-----------------|
| Automatic hook interception | No — Claude must call tool explicitly | No | No | **Yes — PermissionRequest + idle timer** |
| Bidirectional (read replies) | Yes — thread polling | Yes — `ask_user` + `get_thread_replies` | No — send only | Yes |
| Urgency levels | No | Yes — normal/important/critical | Yes — good/warning/danger | Yes — high/medium/low |
| Block Kit messages | No — plain text with mention | Partial — basic formatting | No — webhook attachments | Yes — full Block Kit |
| Task completion notification | No | No | No | **Yes — Stop hook** |
| Error notification | No | No | No | **Yes — PostToolUseFailure hook** |
| Idle timeout (don't spam if at terminal) | No — always fires immediately | No | No | **Yes — configurable timeout** |
| npm package | No — npx only | No | No | **Yes — global install** |
| Socket Mode | Yes (required) | No — polling | No — webhook | **No — polling (simpler)** |
| Claude Code hooks integration | No | No | No | **Yes — first-class** |
| Setup wizard | No — manual config | No | No | **Yes — `signal-flare setup`** |
| Single token type (bot only) | No — requires BOTH bot + app token | Yes — bot token | No — webhook URL | **Yes — bot token only** |

### Where AskOnSlackMCP Wins
Socket Mode gives real-time event delivery (vs. polling at 2-3s). For human-response-time use cases (seconds to minutes), polling is imperceptibly slower. Socket Mode requires an `xapp-` token in addition to `xoxb-` token, which doubles the Slack app setup friction.

### Where Signal Flare Wins
Hook-based automatic interception is the defining feature — no other tool intercepts AskUserQuestion automatically. Combined with idle detection, this creates genuinely hands-off behavior that competitors cannot replicate without a redesign.

---

## Critical Technical Finding: AskUserQuestion Hook Status

**The PermissionRequest hook fires for AskUserQuestion.** This is confirmed in GitHub issue #13024 discussion by user `@shanraisshan`. The `PermissionRequest` hook runs before Claude's interactive input prompt, making it the correct interception point.

**Confirmed hook approach for Signal Flare:**
```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "signal-flare-hook" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "signal-flare-hook --event stop", "async": true }]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [{ "type": "command", "command": "signal-flare-hook --event error", "async": true }]
      }
    ]
  }
}
```

**Known resolved bug:** PreToolUse hooks caused AskUserQuestion to return empty responses. Fixed in Claude Code v2.0.76 (January 2026). Signal Flare uses `PermissionRequest` (not `PreToolUse`) so this bug is not a concern — but the minimum Claude Code version should be documented (v2.0.76+).

---

## Sources

- [AskOnSlackMCP (trtd56/AskOnSlackMCP)](https://github.com/trtd56/AskOnSlackMCP) — direct repo inspection
- [Slack Notifier MCP (Strand-AI) on Glama](https://glama.ai/mcp/servers/@Strand-AI/slack-notifier-mcp) — feature list verified
- [slack-notification-mcp on MCP Servers](https://mcpservers.org/servers/Zavdielx89/slack-notification-mcp) — feature list verified
- [claude-code-slack-bot (mpociot)](https://github.com/mpociot/claude-code-slack-bot) — opposite direction, not a direct competitor
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — HIGH confidence, official docs; confirmed all hook events, PermissionRequest matcher behavior
- [GitHub Issue #12605: AskUserQuestion Hook Support (CLOSED COMPLETED)](https://github.com/anthropics/claude-code/issues/12605) — confirmed `PermissionRequest` fires for AskUserQuestion; closed Dec 2025
- [GitHub Issue #13024: Hook for when Claude is waiting for user input (OPEN)](https://github.com/anthropics/claude-code/issues/13024) — confirmed `PermissionRequest` workaround; still open as of Jan 2026
- [GitHub Issue #13439: PreToolUse causes AskUserQuestion empty responses (FIXED v2.0.76)](https://github.com/anthropics/claude-code/issues/13439) — critical bug context; fixed Jan 2026
- [GitHub Issue #12031: PreToolUse strips AskUserQuestion result data (FIXED v2.0.76)](https://github.com/anthropics/claude-code/issues/12031) — duplicate of above, same fix
- [Claude Code Notification Hooks Setup (alexop.dev)](https://alexop.dev/posts/claude-code-notification-hooks/) — community pattern for Stop/Notification hooks
- [Claude Code Notifications (kane.mx)](https://kane.mx/posts/2025/claude-code-notification-hooks/) — Stop hook implementation pattern

---

*Feature research for: Claude Code → Slack notification/feedback bridge (MCP server + hook integration)*
*Researched: 2026-02-22*
