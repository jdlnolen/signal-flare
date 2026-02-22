# Project Research Summary

**Project:** Signal Flare
**Domain:** Claude Code MCP server + Claude Code hook integration + Slack notification bridge (npm package)
**Researched:** 2026-02-22
**Confidence:** HIGH for core stack and architecture; MEDIUM for hook-based answer injection (one key mechanism is partially unverified)

## Executive Summary

Signal Flare is a category-defining tool: an npm package that bridges Claude Code's agentic loop to Slack for human-in-the-loop notifications and feedback. The core architecture has two independent but complementary channels — an MCP server exposing an `ask_human_via_slack` tool (explicit bidirectional Q&A) and a set of Claude Code hook scripts (automatic event-driven notifications). Every existing tool in this space requires Claude to explicitly call a tool; Signal Flare's hook-based idle and question detection is the primary competitive differentiator. No competitor has this.

The recommended build approach is to treat the MCP tool as the primary bidirectional path and the hooks as additive notification layers. Claude must be instructed (via CLAUDE.md or system prompt) to call `ask_human_via_slack` when it needs human input — this is the reliable, fully-understood path. The hook-based interception of `AskUserQuestion` via the `PermissionRequest` hook enables detection and Slack notification immediately, but the mechanism for injecting an answer back from Slack into Claude's terminal prompt is only partially verified (GitHub issue #12605 was closed as completed Dec 2025, but the `hookSpecificOutput.updatedInput.answers` implementation details require testing against the user's actual Claude Code version). Build the explicit MCP tool path to ship, then layer in hook-answer-injection after verification.

The dominant risk is the gap between what the hook system currently supports and what Signal Flare's "automatic interception" promises. If the answer-injection mechanism is not fully implemented in Claude Code, the hook path degrades to notification-only. This is acceptable for v1 — notification + explicit MCP tool call covers the primary use case — but must be clearly architected so the fallback is graceful and documented, not a broken promise. Secondary risks are MCP stdout pollution (catastrophic, easy to avoid), Slack rate limits on reply polling (avoidable by design), and NVM path resolution for global npm installs (avoidable with absolute paths in setup wizard).

## Key Findings

### Recommended Stack

Signal Flare is a TypeScript npm package built on `@modelcontextprotocol/sdk@^1.27.0` (MCP server), `@slack/web-api@^7.14.1` (Slack REST API), and `zod@^3.25.0` (runtime validation). The MCP server uses `StdioServerTransport` — no HTTP server needed; Claude Code spawns it as a subprocess and communicates via JSON-RPC over stdin/stdout. The hook handler is a separate compiled binary invoked by Claude Code as a shell command per event; it shares the Slack client utilities but must NOT import the full MCP server. Both are published from one npm package with multiple `bin` entries. Build tooling is `tsup` (CJS+ESM dual output, zero-config), `vitest` (tests), and `tsx` (dev execution).

The single most critical stack constraint: `console.log()` anywhere in the MCP server corrupts the JSON-RPC stream silently. Every log must use `console.error()` or a file logger from the first line of code. This is non-negotiable.

**Core technologies:**
- `@modelcontextprotocol/sdk@^1.27.0`: MCP server framework — the only viable option for TypeScript MCP servers; v1.x is stable, v2 is pre-alpha
- `@slack/web-api@^7.14.1`: Official Slack REST client — polling model avoids Socket Mode complexity; v7 adds strict TypeScript types
- `zod@^3.25.0`: Runtime schema validation — required SDK peer dep; use v3 to avoid Zod v4 migration friction
- `TypeScript@^5.7.0` + `Node.js@>=20`: Required by all dependencies; Node 20 is the safe LTS minimum
- `tsup@^8.x`: Dual CJS+ESM npm publish — handles the notoriously painful ESM/CJS interop automatically
- `vitest@^2.x`: Test framework — native TypeScript + ESM, no transform config needed

**What not to use:** `ts-node` (slow, ESM conflicts), `express`/`fastify` (MCP is stdio, not HTTP), `@slack/rtm-api` (deprecated), `@modelcontextprotocol/sdk@v2` (pre-alpha), Zod v4 (peer dep compatibility unsettled).

### Expected Features

Signal Flare's feature set is well-defined. The competitive landscape was fully mapped (4 comparable tools analyzed) and confirms that hook-based automatic interception is a true category gap — no existing tool has it. The MVP feature set is aggressive but achievable; the v1.x additions are clearly bounded.

**Must have (table stakes):**
- `ask_human_via_slack` MCP tool: send question to Slack, poll for reply, return answer — core value prop
- Thread-based reply polling with configurable timeout and exponential backoff
- Block Kit rich messages with urgency levels (red/yellow/green)
- Stop hook for task completion notifications — fire-and-forget, low complexity, high perceived value
- PostToolUseFailure hook for error notifications — same as above
- Environment-variable configuration (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`)
- npm global package with setup wizard (`signal-flare init`) that writes hook config and MCP config
- Polished README with Slack app setup walkthrough, required scopes, demo GIF

**Should have (competitive differentiators):**
- PermissionRequest hook for AskUserQuestion detection — automatic Slack notification when Claude asks questions (notification path confirmed; answer injection path needs verification)
- Configurable idle timeout (default 90s) before Slack escalation — prevents notification spam if user is at terminal
- Context-rich messages — include question text, current file, session ID in every Slack message
- `SLACK_USER_ID` for @mentions — push notifications on mobile
- Thread continuation — route follow-up questions in same session to same Slack thread

**Defer (v2+):**
- First-response-wins coordination (terminal + Slack simultaneously) — highest complexity; add after v1 validates both paths independently
- Multi-channel routing (errors → #alerts, questions → #dev)
- Digest mode for batch notifications
- Plugin format if Anthropic's plugin system matures

**Anti-features to avoid:**
- Slack Socket Mode (doubles auth friction, unnecessary for human response timescales)
- OAuth flow for Slack setup (requires web server, production app approval)
- Interactive Slack buttons (requires Slack Interactivity endpoint — incompatible with polling-only CLI tool)
- Notification on every tool call (spam; scope narrowly to question/error/completion events)

### Architecture Approach

Signal Flare has two compiled entry points in one npm package: `dist/server.js` (long-running MCP server, spawned by Claude Code via stdio, handles `ask_human_via_slack` tool calls) and `dist/hooks/notify.js` (short-lived hook handler script, spawned by Claude Code per event, sends notifications and exits immediately). Both share `src/slack/` utilities for the Slack client, message builders, and poller. This separation is architecturally critical — running the full MCP server per hook fire wastes 200-500ms on startup and is architecturally wrong. The suggested build order follows dependency hierarchy: Slack client → poll manager → MCP tool → hook handler → hook installer → npm packaging.

**Major components:**
1. **MCP Server** (`src/server.ts` + `src/tools/ask-human.ts`) — registers `ask_human_via_slack` tool, manages stdio JSON-RPC transport, never uses `console.log()`
2. **Slack Client Layer** (`src/slack/client.ts`, `messages.ts`, `poller.ts`) — wraps WebClient, builds Block Kit messages, manages `conversations.replies` polling with exponential backoff
3. **Hook Handler** (`src/hooks/notify.ts`, compiled to `dist/hooks/notify.js`) — reads stdin JSON payload, determines event type, calls Slack client, exits 0; never blocks
4. **Hook Installer** (`scripts/install-hooks.sh` or programmatic) — writes hook config to `~/.claude/settings.json`; generates absolute paths to avoid NVM issues
5. **Config module** (`src/config.ts`) — validates env vars (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`) at startup; fails fast with helpful error messages

### Critical Pitfalls

1. **AskUserQuestion answer injection is unverified** — The hook can detect when Claude calls `AskUserQuestion` (via `PermissionRequest` hook) and send a Slack notification, but injecting the Slack reply back as Claude's answer via `hookSpecificOutput.updatedInput.answers` was closed as completed in Dec 2025 but needs verification against the actual Claude Code version. Build the explicit `ask_human_via_slack` MCP tool as the primary path; treat hook-answer-injection as an enhancement, not the foundation. If the mechanism doesn't work, the architecture must not collapse — notification-only hooks + explicit MCP tool calls are the correct fallback.

2. **stdout pollution silently breaks the MCP protocol stream** — Any `console.log()` call anywhere in the MCP server corrupts the JSON-RPC channel. The failure is silent and confusing (`-32000 Connection closed`). Enforce `console.error()` only from the first line; add a CI lint rule that fails on `console.log` in `src/`.

3. **Slack rate limits on `conversations.replies`** — New rate limits (effective March 3, 2026) restrict non-Marketplace apps to 1 req/min for reply polling. Prevention: design setup so each user creates their own Slack app in their own workspace (internal apps are exempt at 50+ req/min); implement exponential backoff starting at 3s, capping at 30s; handle 429 with `Retry-After`.

4. **MCP tool call timeout** — Claude Code's default tool timeout is ~60 seconds; `ask_human_via_slack` blocks waiting for human response (minutes). Set explicit `timeout` in tool registration (600,000ms), send progress notifications during polling, test with 90-second simulated reply times before shipping.

5. **Polling loop detects bot's own messages as human replies** — `conversations.replies` returns the original message and any bot follow-ups. Without filtering by `bot_id` and `ts > questionTs`, the loop may immediately return the question text as the "answer." Filter: `ts > questionTs` AND `bot_id` not present. Include a unit test: polling loop given a thread with only bot messages returns null.

## Implications for Roadmap

Based on combined research, the dependency hierarchy and pitfall-to-phase mapping strongly suggest a 4-phase structure.

### Phase 1: Core Slack Infrastructure and MCP Tool

**Rationale:** The Slack client, reply poller, and `ask_human_via_slack` MCP tool form the foundational value prop. Everything else depends on them. These components have no Claude Code dependency and can be developed and tested in isolation. All critical Phase 1 pitfalls (stdout pollution, rate limits, bot message filtering, tool timeout) must be resolved here before any hook work begins.

**Delivers:** A working `ask_human_via_slack` MCP tool that a developer can manually add to their Claude Code MCP config, call explicitly in a session, and receive Slack-mediated answers. No automation yet — but the core mechanism is proven.

**Addresses:**
- `ask_human_via_slack` MCP tool (P1 feature)
- Thread-based reply polling with exponential backoff
- Block Kit messages with urgency levels (red/yellow/green)
- Context extraction (question text, cwd, session ID)
- Config module (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`)

**Avoids:**
- stdout pollution (lint rule from day 1)
- Bot message self-detection in polling loop
- Slack rate limit errors (exponential backoff in poller from the start)
- MCP tool timeout (explicit timeout configuration in tool definition)

**Research flag:** Standard patterns — MCP SDK and Slack Web API are well-documented; skip `research-phase` for this phase.

---

### Phase 2: Hook Integration (Notification Path)

**Rationale:** With the Slack infrastructure proven in Phase 1, the hook handler is a thin wrapper that reuses the Slack client. Hooks provide the "automatic" experience that differentiates Signal Flare. This phase must carefully define the hook-vs-MCP-tool responsibility boundary to avoid the dual-answer UX problem. Start with the simpler notification-only hooks (Stop, PostToolUseFailure), then add the more complex PermissionRequest hook.

**Delivers:** Automatic Slack notifications when Claude completes a task (Stop hook), encounters an error (PostToolUseFailure hook), and asks a question (PermissionRequest hook — notification path only; answer injection deferred pending verification). Hook handler is a separate compiled binary that exits immediately without blocking.

**Addresses:**
- Stop hook for task completion notifications (P1 feature)
- PostToolUseFailure hook for error notifications (P1 feature)
- PermissionRequest hook for AskUserQuestion detection (P1 feature, notification path)
- Configurable idle timeout before Slack escalation

**Avoids:**
- Blocking hook handlers (hook sends notification and exits 0; reply-wait logic stays in MCP tool only)
- `idle_prompt` misuse as primary question escalation (use `PermissionRequest` for immediate detection; `Stop` for completion)
- Dual-answer UX confusion (document terminal prompt behavior in MCP tool response message)

**Research flag:** Needs `research-phase` during planning — the `PermissionRequest` answer-injection mechanism (`hookSpecificOutput.updatedInput.answers`) requires verification against the Claude Code version actually installed. Plan for two outcomes: (a) injection works → first-response-wins is achievable in v1.x; (b) injection unimplemented → notification-only hooks, explicit MCP tool as primary path.

---

### Phase 3: npm Packaging and Setup Wizard

**Rationale:** The npm package experience is a P1 feature — Signal Flare's competitive advantage includes being the only tool with a proper global install and setup wizard. This phase is a discrete, shippable unit that can be parallelized with Phase 2 refinement. It has no new feature development but significant infrastructure work (dual CJS+ESM build, `bin` entries, path resolution, hook config writing).

**Delivers:** `npm install -g signal-flare` works on macOS with NVM. `signal-flare init` writes both the MCP config (with absolute paths) and the hook config to `~/.claude/settings.json`. Setup wizard outputs a clear "restart Claude Code for hooks to take effect" instruction. README includes Slack app setup walkthrough and required scopes.

**Addresses:**
- npm global package with setup wizard (P1 feature)
- Polished README with demo GIF
- `SLACK_USER_ID` for @mentions (P2, low effort addition here)

**Avoids:**
- NVM path resolution failures (setup wizard generates absolute paths; tested on NVM machine)
- Hook snapshot at session start confusion (README setup sequence explicitly includes restart step)
- Shared Slack app token anti-pattern (README instructs each user to create their own Slack app)

**Research flag:** Standard patterns for tsup and npm publish — no `research-phase` needed. NVM path handling is a known pattern; solution is documented in PITFALLS.md.

---

### Phase 4: First-Response-Wins and v1.x Polish

**Rationale:** First-response-wins (terminal answer OR Slack answer, whichever arrives first, wins) is the highest-value differentiator but also the highest complexity. It requires both the MCP tool path and the hook path to be stable before attempting coordination. Add this phase after Phase 2's hook answer-injection mechanism is verified. Also consolidates test suite and CI work.

**Delivers:** First-response-wins coordination between terminal and Slack paths (if answer injection is verified working). Thread continuation (same Slack thread per session). Test suite with good coverage. GitHub Actions CI.

**Addresses:**
- First-response-wins coordination (P2 feature)
- Thread continuation (P2 feature)
- Test suite (P2 feature)
- GitHub Actions CI (P2 feature)

**Avoids:**
- First-response-wins dual-answer UX problem (terminal prompt behavior explicitly documented; MCP tool response includes dismissal instruction)

**Research flag:** Needs `research-phase` — the first-response-wins coordination mechanism depends on the answer-injection verification from Phase 2. If injection is not available, this phase's scope changes significantly.

---

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** The hook handler must reuse the Slack client; building it standalone first ensures it's tested before being wrapped. All Phase 2 pitfalls assume Phase 1's Slack infrastructure is correct.
- **Phase 2 before Phase 4:** First-response-wins requires both paths to be individually working before coordination. Building coordination before individual paths are stable is a common mistake.
- **Phase 3 can partially overlap Phase 2:** The tsup build system, `bin` entries, and basic install flow can be set up during Phase 2 development without blocking Phase 2 feature work. The setup wizard needs Phase 2's hook config to write, so completion of Phase 3 depends on Phase 2.
- **Answer injection is a gate:** The Phase 2 `research-phase` on `PermissionRequest` answer injection is a decision gate. If not working: Phase 4 scope narrows to polish, tests, and CI. If working: Phase 4 adds coordination logic.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2:** `PermissionRequest.hookSpecificOutput.updatedInput.answers` answer-injection mechanism — must verify against actual Claude Code version before designing hook-answer coordination. Test with `claude --debug` and a minimal hook that returns `updatedInput.answers` dict.
- **Phase 4:** First-response-wins coordination design depends on Phase 2 verification outcome. If answer injection is available, design the concurrent terminal + Slack race. If not, scope to test suite and polish only.

Phases with standard patterns (skip research-phase):
- **Phase 1:** MCP SDK and Slack Web API are well-documented with official examples. Build order is clear. Patterns for stdio transport, Block Kit, and polling are established.
- **Phase 3:** tsup build configuration and npm publish are well-documented. NVM path fix is a known pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official SDK docs verified; version compatibility confirmed; all "avoid" decisions backed by official changelogs or deprecation notices |
| Features | HIGH | Competitive landscape fully mapped (4 live tools inspected); feature prioritization matrix grounded in actual implementation effort; table stakes confirmed against multiple prior-art implementations |
| Architecture | HIGH | Claude Code hooks reference is official and current (verified 2026-02-22); MCP SDK architecture is official; Slack API is official. One MEDIUM gap: answer injection mechanism is officially closed as completed but not independently verified |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (stdout, rate limits, bot message filtering, timeout) are backed by official docs and multiple real-world reports. AskUserQuestion answer injection pitfall is well-characterized but the resolution is MEDIUM confidence |

**Overall confidence:** HIGH, with one MEDIUM-confidence architectural gate (answer injection mechanism).

### Gaps to Address

- **`PermissionRequest.hookSpecificOutput.updatedInput.answers`:** GitHub issue #12605 was closed as "completed" Dec 2025, suggesting answer injection into `AskUserQuestion` is possible. But the exact implementation — what the dict looks like, which Claude Code version enables it, whether it works reliably — is unverified. Address in Phase 2 `research-phase`: write a minimal test hook, fire it for `AskUserQuestion`, return a canned answer via `updatedInput.answers`, verify Claude Code uses it. This single test determines whether first-response-wins is achievable in v1.x or deferred.

- **`conversations.replies` rate limit classification:** Signal Flare instructs each user to create their own Slack app (internal app, exempt from new rate limits). This is the correct design. But whether Slack classifies a user's personal Slack app created from npm install instructions as "internal" or "commercially distributed" is technically unclear. Mitigation: implement exponential backoff regardless; document setup as "create your own app"; verify with a test that polls at high frequency to confirm no 429 on a user-created internal app.

- **Minimum Claude Code version requirement:** PreToolUse hook bug that stripped AskUserQuestion results was fixed in v2.0.76 (Jan 4, 2026). Signal Flare uses `PermissionRequest` (not `PreToolUse`), so this specific bug is not a concern — but minimum version should still be documented. Add `"claude_code": ">=2.0.76"` or equivalent to setup validation.

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — hook event schema, PermissionRequest matcher, Notification matchers, Stop hook fields
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) — MCP server registration, stdio transport config
- [MCP TypeScript SDK — server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — StdioServerTransport, McpServer API
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — version 1.27.0 confirmed
- [@slack/web-api npm](https://www.npmjs.com/package/@slack/web-api) — version 7.14.1 confirmed
- [Slack Rate Limit Changes changelog, May 29, 2025](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) — rate limit tiers for internal vs. distributed apps
- [Slack conversations.replies API](https://docs.slack.dev/reference/methods/conversations.replies/) — response format, oldest parameter, rate limits
- [MCP stdio transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — stdout restriction, protocol requirements

### Secondary (MEDIUM confidence)
- [GitHub Issue #12605: AskUserQuestion Hook Support (CLOSED COMPLETED Dec 2025)](https://github.com/anthropics/claude-code/issues/12605) — confirms PermissionRequest fires for AskUserQuestion; answer injection mechanism partially confirmed
- [GitHub Issue #13024: Hook for when Claude is waiting for user input (OPEN)](https://github.com/anthropics/claude-code/issues/13024) — PermissionRequest workaround confirmed by community
- [GitHub Issue #13439: PreToolUse causes AskUserQuestion empty responses (FIXED v2.0.76)](https://github.com/anthropics/claude-code/issues/13439) — minimum version context
- [GitHub Issue #13922: Configurable idle_prompt timeout (OPEN)](https://github.com/anthropics/claude-code/issues/13922) — idle_prompt 60s hardcoded, not configurable
- [GitHub Issue #15872: Hook support for AskUserQuestion](https://github.com/anthropics/claude-code/issues/15872) — current state of answer injection mechanism
- [Zod v4 compatibility issue #555](https://github.com/modelcontextprotocol/typescript-sdk/issues/555) — SDK compatibility with Zod v3/v4
- [NVM MCP server path issues](https://github.com/modelcontextprotocol/servers/issues/64) — PATH resolution failure pattern and fix
- [MCP server stdio stdout corruption — real-world report](https://github.com/ruvnet/claude-flow/issues/835) — consistent with spec

### Tertiary (LOW-MEDIUM confidence)
- [AskOnSlackMCP (trtd56)](https://github.com/trtd56/AskOnSlackMCP) — prior art; confirms polling approach and 60s timeout
- [Slack Notifier MCP (Strand-AI)](https://glama.ai/mcp/servers/@Strand-AI/slack-notifier-mcp) — urgency levels pattern
- [Claude Code Notification Hooks (alexop.dev)](https://alexop.dev/posts/claude-code-notification-hooks/) — community Stop/Notification hook pattern
- [Claude Code Notifications (kane.mx)](https://kane.mx/posts/2025/claude-code-notification-hooks/) — Stop hook implementation pattern

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
