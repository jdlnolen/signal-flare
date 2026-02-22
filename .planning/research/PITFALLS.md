# Pitfalls Research

**Domain:** Claude Code MCP server + Slack integration (human-in-the-loop notifications)
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH (hook behavior from official docs; Slack rate limits from official changelog; first-response-wins from architecture analysis)

---

## Critical Pitfalls

### Pitfall 1: AskUserQuestion Cannot Be Intercepted to Provide Answers

**What goes wrong:**
Claude Code's hook system has `PreToolUse` hooks that fire for `AskUserQuestion` tool calls, allowing *detection* of when Claude is about to ask a question. But the hook cannot provide the answer back programmatically. Claude Code still blocks on stdin, waiting for the user to type a response at the terminal. The hook fires, can post to Slack, but Claude is still frozen waiting for terminal input. The user answers in Slack, but Claude never receives that answer.

**Why it happens:**
The hook system was designed to intercept and block/allow tool calls — not to substitute the result of interactive UI tools. `AskUserQuestion` is a UI primitive, not an external tool call. Even when a `PreToolUse` hook detects the question, there is no hook output format or stdin injection mechanism to feed an answer back into Claude Code's input stream. Multiple GitHub issues (#10168, #12605, #13024, #13830) have requested this capability; as of late 2025, it remains unimplemented.

**How to avoid:**
Signal Flare's architecture must use the `ask_human_via_slack` MCP tool as the *primary* mechanism — Claude must explicitly call this tool rather than `AskUserQuestion`. The hook-based interception (`PreToolUse` on `AskUserQuestion`) is only viable as a *notification* (tell the user that Claude is about to ask something) — not as a response channel. To make Claude prefer `ask_human_via_slack`, the CLAUDE.md instructions and tool description must clearly direct Claude to use it when human input is needed.

**Warning signs:**
- Integration appears to work in demos but Claude keeps waiting at terminal after Slack reply is submitted
- Test scenarios where a user answers in Slack and Claude never proceeds
- Hook fires (Slack message sent) but Claude's session is still frozen after the timeout period

**Phase to address:**
Phase 1 (Core MCP tool) — Architecture decision made before any hook work. Document explicitly that hook interception enables notification only, not answer injection.

---

### Pitfall 2: stdout Pollution Silently Corrupts the MCP Protocol Stream

**What goes wrong:**
The MCP stdio transport uses stdout exclusively for JSON-RPC messages. Any `console.log()`, debug statement, startup banner, or library that writes to stdout corrupts the JSON stream. The failure mode is silent and confusing: the MCP server appears to start but Claude Code cannot communicate with it, or the connection drops mid-session with cryptic parse errors (`-32000 Connection closed`).

**Why it happens:**
Node.js `console.log()` writes to stdout by default. Developers add debugging logs during development, forget them in production, or a transitive dependency (like a library that prints a startup message) writes to stdout. This is documented in the MCP specification: "The server MUST NOT write anything to its stdout that is not a valid MCP message."

**How to avoid:**
From the first line of code: redirect all logging to stderr. Use `console.error()` for all debug output, or configure a logger (like `winston` or `pino`) with a stderr transport. Never use `console.log()` anywhere in the MCP server codebase. Add a CI check or linting rule to catch `console.log` calls. Test with `claude --debug` which shows protocol traffic and makes stdout pollution visible.

**Warning signs:**
- MCP server process starts but tools never appear in Claude Code
- `Error -32000: Connection closed` after initialization
- Works in isolation but fails when connected to Claude Code
- Server works fine during `mcp inspect` testing but fails under Claude Code

**Phase to address:**
Phase 1 (Core MCP tool) — Establish the logging discipline before writing any server code. This is a foundation issue.

---

### Pitfall 3: Slack Rate Limits on conversations.replies Will Break Polling for Commercially Distributed Apps

**What goes wrong:**
Signal Flare is distributed as an npm package for individual developer use. If it is classified as a "commercially distributed app" outside the Slack Marketplace, it falls under new rate limits: `conversations.replies` is limited to 1 request per minute with a maximum of 15 messages per response (effective March 3, 2026 for existing apps). Polling every 3 seconds for a human reply will trigger HTTP 429 errors immediately.

**Why it happens:**
Slack tightened rate limits in May 2025 for non-Marketplace apps that are "commercially distributed." The key question for Signal Flare is classification: "internal customer-built applications" are explicitly exempt (50+ requests/minute, 1,000 messages/request). An npm package that each user installs and configures with their own Slack workspace credentials may qualify as internal use, but this is not guaranteed.

**How to avoid:**
1. Design the Slack bot setup so each user creates their own Slack app in their own workspace — this makes it an internal app, which is exempt from the new limits.
2. Never direct users to a shared/centralized Signal Flare Slack app.
3. Implement adaptive polling: start at 3-5 second intervals, back off on 429 responses, cap at 30 second intervals.
4. Add explicit 429 error handling with retry-after header support.
5. Document in README that users must create their own Slack app (not install a shared bot) — this is architecturally correct and preserves the higher rate limits.

**Warning signs:**
- HTTP 429 errors from `conversations.replies` during testing with a shared app token
- Polling loop that doesn't implement exponential backoff
- README that points users to a centralized bot token rather than "create your own Slack app"

**Phase to address:**
Phase 1 (Core MCP tool) — The Slack app setup model (internal vs. distributed) must be decided before writing the polling loop. Phase 3 (Packaging/README) — Document the internal app setup explicitly.

---

### Pitfall 4: The First-Response-Wins Pattern Has a Dual-Answer Problem

**What goes wrong:**
Signal Flare's design surfaces the question in two places simultaneously: the terminal (Claude's `AskUserQuestion` prompt or the MCP tool's blocking call) and Slack. The intent is that whichever channel gets answered first wins. The pitfall: when the user answers in Slack, the terminal-side question is still waiting. The user must *also* dismiss the terminal prompt. If they don't, Claude Code's session is stuck even after the MCP tool receives the Slack answer and returns it to Claude.

**Why it happens:**
There is no mechanism in Claude Code to programmatically dismiss or answer a terminal input prompt from another process. The two input channels are fully independent. The `ask_human_via_slack` MCP tool can return the Slack answer to Claude, but if the user also sees the terminal question and does nothing, there's no conflict — Claude got its answer. The friction is UX, not technical: users see a hanging terminal prompt after they've already answered in Slack and feel the system is broken.

**How to avoid:**
Make the terminal-side behavior clear in the tool's response message and documentation. When the MCP tool returns a Slack answer, include a message like "Human answered via Slack: [answer]. If you see a separate terminal prompt, press Enter to dismiss it." Consider whether the hook-based approach (using `PreToolUse` on `AskUserQuestion` to fire the notification) creates this dual-prompt scenario — it does, because AskUserQuestion blocks on terminal. The cleaner design is to have Claude call `ask_human_via_slack` *instead of* `AskUserQuestion`, not in addition to it.

**Warning signs:**
- User testing shows people answering in Slack but then confused about what to do at the terminal
- Demo flows where the session appears frozen after a Slack reply
- The hook and MCP tool both active, creating two simultaneous prompts

**Phase to address:**
Phase 2 (Hook integration) — The hook and MCP tool interaction model must be specified precisely before implementation.

---

### Pitfall 5: MCP Tool Calls Have Hard Timeout Limits (60 Seconds Default)

**What goes wrong:**
Claude Code and most MCP clients apply a timeout to tool calls — typically 60 seconds. `ask_human_via_slack` is a blocking call: it sends the Slack message and polls for a reply. If the user takes 3 minutes to see and answer the Slack message, the MCP tool call times out. Claude receives a timeout error, not the user's answer, and the session state is unclear.

**Why it happens:**
The MCP specification's synchronous request/response model assumes tools complete quickly. Human-in-the-loop tools violate this assumption. The default `timeout` for command hooks is 600 seconds (10 minutes), but for MCP tool calls within Claude Code, the timeout behavior depends on the client configuration.

**How to avoid:**
1. Configure an explicit `timeout` on the MCP server tool registration that matches the expected human response window (e.g., 5-10 minutes).
2. Send progress notifications during the polling loop to signal the client the tool is still active (though TypeScript MCP clients may still apply hard limits regardless of progress updates).
3. Document the expected timeout in the tool description so Claude Code's client can configure it appropriately.
4. Test with longer timeouts explicitly: `"timeout": 600000` in the MCP server config.
5. Consider the async task pattern as a fallback: return a task ID immediately, poll separately (but this requires a more complex architecture than v1 needs).

**Warning signs:**
- Test scenarios where the simulated "human response" takes > 60 seconds return timeout errors
- `Error -32001: Request Timeout` in Claude Code's MCP logs
- Users report that Signal Flare "works for quick answers but fails if I take too long"

**Phase to address:**
Phase 1 (Core MCP tool) — Set `timeout` configuration in the tool definition before testing.

---

## Moderate Pitfalls

### Pitfall 6: NVM/Node Version Manager Breaks Global npm Install PATH Resolution

**What goes wrong:**
When installed globally (`npm install -g signal-flare`) by users running NVM or similar Node version managers, Claude Code may fail to launch the MCP server because it resolves `node` and the server script path using a different Node version than the user has active. The error is `ENOENT spawn npx` or a silent MCP server connection failure.

**Why it happens:**
Claude Code launches MCP servers as child processes. It uses the `PATH` from its own environment, which may not include NVM's shim directory. NVM installs Node versions in version-specific directories; the "global" npm bin path changes when the user switches Node versions.

**How to avoid:**
In setup documentation, explicitly tell users to use absolute paths for the MCP server command in their Claude Code config. For example: `"command": "/Users/username/.nvm/versions/node/v22.0.0/bin/node"` and `"args": ["/Users/username/.nvm/versions/node/v22.0.0/lib/node_modules/signal-flare/dist/index.js"]`. Better: provide a `signal-flare init` command that auto-detects the correct paths and writes the MCP config. Test the install experience on a machine using NVM before launch.

**Warning signs:**
- GitHub issues from users saying "signal-flare works in terminal but not in Claude Code"
- MCP server shows as "failed to connect" in Claude Code settings
- Works fine when run directly with `node` but fails via Claude Code

**Phase to address:**
Phase 3 (npm packaging) — The `signal-flare init` command must generate absolute paths, not rely on PATH resolution.

---

### Pitfall 7: Polling Loop Detects Its Own Bot Messages as Human Replies

**What goes wrong:**
When `conversations.replies` is polled to find a human reply to the question thread, the bot's own message (the question it posted) appears in the replies array. Without filtering by `bot_id` or `subtype`, the polling loop may detect the original bot message as the "first reply" and return the question text itself as the human's answer.

**Why it happens:**
The `conversations.replies` response includes all messages in the thread, including the parent message and any bot-posted messages. The loop needs to filter: skip messages where `bot_id` matches the bot's own app ID, skip messages with `subtype == "bot_message"` if the bot posts follow-up messages, and only accept messages from non-bot users posted *after* the question timestamp.

**How to avoid:**
Use the `oldest` parameter to only fetch messages after the question was sent. Additionally, filter out messages where `bot_id` is present or matches the bot token's app ID. Store the `ts` (timestamp) of the posted question and only accept replies with `ts` strictly greater than it. Include an integration test that posts a question and verifies the reply detection ignores the bot's own message.

**Warning signs:**
- During testing, `ask_human_via_slack` immediately returns the question text as the "answer" without waiting
- Polling loop exits after 0 seconds with a non-human response
- Replies returned contain `bot_id` field

**Phase to address:**
Phase 1 (Core MCP tool) — The reply detection logic must be correct from the start, before any UX polish.

---

### Pitfall 8: Hook Snapshot at Session Start Means Mid-Session Config Changes Don't Apply

**What goes wrong:**
Claude Code captures a snapshot of all hooks at session startup and uses that snapshot for the entire session. If a user installs Signal Flare's hooks, then starts a Claude Code session, the hooks are registered. But if Signal Flare is installed *while* a session is running, the new hooks won't be available until the user restarts Claude Code. Users who install Signal Flare and immediately try to use it in their existing session will see no Slack notifications.

**Why it happens:**
This is documented behavior in Claude Code: "Direct edits to hooks in settings files don't take effect immediately. Claude Code captures a snapshot of hooks at startup." This is a security feature, not a bug.

**How to avoid:**
The `signal-flare init` command should clearly instruct users to restart Claude Code after setup. The README setup section must include this step. The init command output should say "Claude Code session restart required for hooks to take effect."

**Warning signs:**
- Users report "I installed it but nothing happens" — they're in an existing session
- The hook file exists but is never fired in an active session

**Phase to address:**
Phase 3 (npm packaging, README) — User setup documentation must clearly sequence the steps including session restart.

---

### Pitfall 9: Notification Hook idle_prompt Has Hardcoded 60-Second Delay with Additional Latency

**What goes wrong:**
The `Notification` hook with matcher `idle_prompt` fires when Claude has been idle for 60 seconds. This is hardcoded, not configurable. Additionally, there is documented high latency (1-2 seconds) between when the idle event occurs and when the hook actually fires. For Signal Flare's use case (notifying a user who stepped away), 60 seconds of idle before notification may be acceptable — but the hook's stated purpose is "idle" not "waiting for question input."

**Why it happens:**
`idle_prompt` is a separate concept from Claude actively asking a question. It fires when Claude stops *producing output* for 60 seconds. If Claude asks a question via `AskUserQuestion`, it may fire, but if Claude asks via the `ask_human_via_slack` MCP tool (which is blocking), the session is not idle — it's blocked inside a tool call.

**How to avoid:**
For question notifications, do not rely on `idle_prompt`. The MCP tool itself is the notification mechanism. For task completion notifications, use the `Stop` hook instead of relying on `idle_prompt` — the `Stop` hook fires immediately when Claude finishes responding and has no artificial delay. Reserve `idle_prompt` only as a fallback "Claude seems stuck" notification, not as the primary question escalation path.

**Warning signs:**
- Slack notifications arriving 60+ seconds after Claude asks a question (relying on idle_prompt instead of the MCP tool)
- Inconsistent timing of notifications
- Slack notifications never firing because Claude never goes idle (it's blocked on a tool call)

**Phase to address:**
Phase 2 (Hook integration) — Notification strategy must use `Stop` hook for completion and `ask_human_via_slack` MCP tool call for questions, not `idle_prompt`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded polling interval (e.g., always 3s) | Simpler code | 429 rate limit errors; wastes API quota when user is away | Never — implement configurable interval from the start |
| Shared Slack app token in docs/examples | Easier onboarding demo | Violates Slack TOS; exposed to rate limit changes; security risk | Never — each user must create their own app |
| `console.log()` for MCP server debugging | Fast development | Corrupts protocol stream in production | Development only, with a debug flag that writes to stderr |
| Not filtering `bot_id` in reply polling | Fewer lines of code | Bot detects own messages as human replies | Never — this is a functional correctness bug |
| Polling `conversations.history` instead of `conversations.replies` | Simpler — no need to track thread_ts | Picks up all channel messages, not just replies to the question thread | Never — creates false positive answers from unrelated messages |
| Registering hooks in project settings vs. global | Easier to ship in MVP | Hooks only active in specific projects, not cross-project Claude sessions | MVP only — global hook registration is the correct end state |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Slack `conversations.replies` | Polling too fast (< 5s intervals) on a commercially distributed app | Adaptive backoff; design as internal app to stay on Tier 3 limits |
| Slack `conversations.replies` | Not using `oldest` parameter to fetch only new replies | Pass `oldest: questionTs` to skip all messages at or before the question |
| Slack Block Kit | Sending over-complex Block Kit messages that break on mobile | Test message rendering on mobile Slack; keep numbered options simple |
| MCP stdio transport | Any `console.log()` call in the server | All logs via `console.error()` or a stderr-targeted logger |
| Claude Code MCP config | Using `npx signal-flare` as the command | Use absolute path to `node` and the server script to avoid PATH/NVM issues |
| Claude Code hooks | Relying on `PreToolUse` + `AskUserQuestion` to provide answers | Hook can *detect* the question but cannot inject an answer; use MCP tool instead |
| Slack bot token scopes | Requesting only `chat:write` | Also need `channels:history` (or `groups:history` for private channels) to poll replies |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling `conversations.replies` in a tight loop without backoff | 429 rate limit errors, questions never answered | Exponential backoff starting at 3-5s, cap at 30s | Immediately on commercially distributed apps; at high call volume on internal apps |
| Keeping question threads open indefinitely while polling | Memory leak in long-running sessions | Enforce a max polling duration (e.g., 10 minutes) matching the configured timeout | After 2-3 unanswered questions in a session |
| Not debouncing error notifications | Slack flooded with error messages for transient errors | Deduplicate: one notification per unique error type per session | After the first error in a session with fast retries |
| Sending full conversation transcript in Slack notification | Block Kit message too large, Slack API returns 400 | Truncate context to 500 characters; show file:line info not full text | When Claude's context is large (common in later phases of a session) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging `SLACK_BOT_TOKEN` to stderr | Token exposed in Claude Code debug logs, accessible to anyone who runs `claude --debug` | Never log tokens; redact in all error messages |
| Writing token to `~/.claude/settings.json` directly | Token readable by any process with filesystem access; committed to git by users | Use environment variables only (`SLACK_BOT_TOKEN`); document `.gitignore` requirement |
| Not validating that Slack reply came from the expected workspace | Replay attack if token shared | Verify team ID in API response matches configured workspace |
| MCP tool accepting arbitrary Slack channel IDs as input | Claude (or a prompt injection attack) redirects notifications to attacker-controlled channel | Hardcode channel from `SLACK_CHANNEL_ID` env var; tool should not accept channel as a parameter |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| User answers in Slack but terminal still shows prompt waiting | Confusion: "Did it work? Why is the terminal frozen?" | MCP tool response should include "If you see a terminal prompt, press Enter to dismiss it" |
| Slack notification with no context about what Claude was doing | User can't answer intelligently from phone | Include file being edited, last 2-3 tool calls, and the specific question in the Slack message |
| Error notifications fire for every retry of a transient error | Slack spammed during a flaky network or API blip | Deduplicate errors; only notify after N consecutive failures |
| No way to turn off notifications without uninstalling | User in active terminal session gets Slack pings they don't want | Honor an `idle_threshold` config; if set to 0, disable Slack escalation |
| Numbered options in Slack require exact number input | User types "yes" instead of "1", reply ignored | Accept both "1" and the option text as valid answers; normalize replies before matching |

---

## "Looks Done But Isn't" Checklist

- [ ] **Slack reply detection:** Often missing bot message filtering — verify replies with `bot_id` are excluded and `ts > questionTs` is enforced
- [ ] **Hook registration:** Often missing global vs. project scope decision — verify hooks are registered in `~/.claude/settings.json` (global) not just `.claude/settings.json` (project-local)
- [ ] **Timeout configuration:** Often missing explicit `timeout` in MCP server config — verify `ask_human_via_slack` has a timeout >= 5 minutes configured in the MCP tool definition
- [ ] **Path resolution:** Often missing absolute path in Claude Code MCP config — verify install works on a machine using NVM by checking the generated config
- [ ] **Rate limit handling:** Often missing 429 response handling — verify the polling loop handles `error: "ratelimited"` from Slack API and backs off
- [ ] **First-response-wins confirmation:** Often missing user confirmation flow — verify that a Slack reply resolves the tool call AND the terminal prompt behavior is documented
- [ ] **Completion notifications:** Often missing `Stop` hook fires correctly — verify `Stop` hook fires after `ask_human_via_slack` completes (tool call ends, Claude resumes, then finishes)
- [ ] **Channel scope:** Often missing `groups:history` scope for private channels — verify bot token scopes cover both public and private channel types

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| stdout pollution discovered after shipping | LOW | Release patch that replaces `console.log` with `console.error`; no architectural change needed |
| Rate limit 429s in production | MEDIUM | Ship polling backoff update; communicate to users that internally-created Slack apps avoid this |
| AskUserQuestion answer injection assumption built into architecture | HIGH | Requires rearchitecting the question interception flow; lose the "automatic hook-based interception" feature, fall back to explicit MCP tool calls |
| Slack token exposed in logs/settings | HIGH | Requires all users to rotate their Slack bot token; security advisory required |
| Global vs. project hook scope shipped incorrectly | LOW | Update init command and README; users re-run init |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| AskUserQuestion cannot inject answers | Phase 1 (architecture decision) | Documented explicitly in ARCHITECTURE.md and tool description; no hook-answer path in code |
| stdout pollution | Phase 1 (first code written) | `grep -r "console\.log" src/` returns 0 results; CI lint rule enforces it |
| Slack rate limits | Phase 1 (Slack polling implementation) | Polling loop has backoff; setup docs specify "create your own Slack app" |
| First-response-wins dual-answer UX | Phase 2 (hook + MCP tool integration) | User testing scenario: answer in Slack, verify terminal behavior is documented |
| MCP tool call timeout | Phase 1 (tool definition) | Integration test with 90-second simulated reply time; verify no timeout error |
| NVM path resolution | Phase 3 (npm packaging) | Test `npm install -g` on NVM machine; init command generates absolute paths |
| Bot message self-detection | Phase 1 (reply polling) | Unit test: polling loop given a thread with only bot messages returns "no reply yet" |
| Hook snapshot at session start | Phase 3 (README/docs) | Setup instructions include "restart Claude Code after running signal-flare init" |
| idle_prompt timing misuse | Phase 2 (hook integration) | No code uses idle_prompt as primary question escalation; Stop hook used for completions |
| Numbered option normalization | Phase 1 (reply parsing) | Unit test: "yes", "1", "option 1" all resolve to option index 0 |

---

## Sources

- [Claude Code Hooks Reference — official docs](https://code.claude.com/docs/en/hooks) — HIGH confidence (official)
- [GitHub Issue #12605: AskUserQuestion Hook Support](https://github.com/anthropics/claude-code/issues/12605) — HIGH confidence (closed as duplicate of #10168, Dec 2025)
- [GitHub Issue #12031: PreToolUse Hooks Strip AskUserQuestion Result](https://github.com/anthropics/claude-code/issues/12031) — HIGH confidence (RESOLVED in v2.0.76, Jan 4, 2026)
- [GitHub Issue #13922: Configurable idle_prompt timeout](https://github.com/anthropics/claude-code/issues/13922) — MEDIUM confidence (open feature request)
- [GitHub Issue #19627: High latency in Notification hook invocation](https://github.com/anthropics/claude-code/issues/19627) — MEDIUM confidence (open bug)
- [Slack Rate Limit Changes changelog, May 29, 2025](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) — HIGH confidence (official Slack changelog)
- [Slack conversations.replies method docs](https://docs.slack.dev/reference/methods/conversations.replies/) — HIGH confidence (official)
- [Slack Rate Limits docs](https://docs.slack.dev/apis/web-api/rate-limits/) — HIGH confidence (official)
- [MCP stdio transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — HIGH confidence (official MCP spec)
- [Fix MCP Error -32001: Request Timeout](https://mcpcat.io/guides/fixing-mcp-error-32001-request-timeout/) — MEDIUM confidence (community, verified against spec)
- [Build Timeout-Proof MCP Tools](https://www.arsturn.com/blog/no-more-timeouts-how-to-build-long-running-mcp-tools-that-actually-finish-the-job) — LOW-MEDIUM confidence (blog, patterns verified against official sources)
- [MCP server stdio stdout corruption — GitHub issue](https://github.com/ruvnet/claude-flow/issues/835) — MEDIUM confidence (real-world report, consistent with spec)
- [AskOnSlackMCP reference implementation](https://github.com/trtd56/AskOnSlackMCP) — MEDIUM confidence (prior art, shows 60s timeout approach)
- [NVM MCP server path issues](https://github.com/modelcontextprotocol/servers/issues/64) — MEDIUM confidence (open GitHub issue with multiple confirmations)

---
*Pitfalls research for: Signal Flare — Claude Code MCP server + Slack integration*
*Researched: 2026-02-22*
