# Roadmap: Signal Flare

## Overview

Signal Flare ships in four phases that follow its natural dependency hierarchy. Phase 1 builds the Slack infrastructure and the core `ask_human_via_slack` MCP tool — the primary bidirectional path that everything else depends on. Phase 2 layers hook integration on top, adding automatic event-driven notifications (task completion, errors, question detection). Phase 3 wraps everything into a polished npm package with a setup wizard and README. Phase 4 delivers the test suite, CI pipeline, and quality hardening that make the package trustworthy for public release.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Slack Infrastructure and MCP Tool** - Working `ask_human_via_slack` MCP tool with Block Kit messages, exponential-backoff polling, and configurable timeouts
- [x] **Phase 2: Hook Integration** - Automatic Slack notifications via Stop, PostToolUseFailure, and PermissionRequest hooks with configurable idle timeout (completed 2026-02-22)
- [ ] **Phase 3: npm Packaging and Setup Wizard** - Global npm install, `signal-flare setup` wizard, environment-variable config, and polished README
- [ ] **Phase 4: Quality and CI** - Test suite with good coverage and GitHub Actions CI pipeline

## Phase Details

### Phase 1: Slack Infrastructure and MCP Tool
**Goal**: Developer can install the MCP server, call `ask_human_via_slack` explicitly in a Claude Code session, and receive Slack-mediated answers with rich formatting
**Depends on**: Nothing (first phase)
**Requirements**: SLCK-01, SLCK-02, SLCK-03, SLCK-04, SLCK-05, SLCK-06
**Success Criteria** (what must be TRUE):
  1. Developer manually adds the MCP server to their Claude Code config, starts a session, and Claude successfully calls `ask_human_via_slack` — a Block Kit message appears in Slack with urgency color coding and the question text
  2. Developer types a reply in the Slack thread and Claude Code receives it as the tool result within the configured polling window
  3. If no Slack reply arrives within the timeout, Claude receives a timeout error and a "timed out" notice appears in the Slack thread
  4. Messages @mention the configured user (SLACK_USER_ID), triggering push notifications on their phone
  5. Polling uses exponential backoff (3s initial, 15s cap) and never returns the bot's own question text as the human's answer
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold, config validation, Slack client, and Block Kit message builder
- [x] 01-02-PLAN.md — Poll manager, MCP server entry point, and ask_human_via_slack tool wiring

### Phase 2: Hook Integration
**Goal**: Signal Flare automatically notifies Slack for three Claude Code events — task completion, errors, and question detection — without requiring Claude to explicitly call a tool
**Depends on**: Phase 1
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. When a Claude Code session ends, a task completion notification appears in Slack with a summary of the last assistant message
  2. When Claude Code encounters a tool error, an error notification appears in Slack with the error text and tool name
  3. When Claude calls `AskUserQuestion`, a Slack notification fires after the configured idle timeout (default 90s) — but if the user responds in the terminal before the timeout, no Slack message is sent
  4. The hook handler exits immediately after sending its notification and never blocks Claude Code's execution
**Plans:** 2/2 plans complete
Plans:
- [x] 02-01-PLAN.md — Hook infrastructure: types, config, message builders, lightweight Slack client, build config
- [ ] 02-02-PLAN.md — Hook entry point, router, Stop/PostToolUseFailure/PermissionRequest handlers, and background watcher

### Phase 3: npm Packaging and Setup Wizard
**Goal**: Any developer can install Signal Flare globally with one command and configure it for their workspace with a guided setup wizard
**Depends on**: Phase 2
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04, PKG-05
**Success Criteria** (what must be TRUE):
  1. `npm install -g signal-flare` succeeds on macOS with NVM installed and makes the `signal-flare` command available globally
  2. `signal-flare setup` prompts for required tokens, then writes hook config to `~/.claude/settings.json` and MCP server config using absolute paths — no manual file editing required
  3. After setup, a fresh Claude Code session automatically has both the MCP tool available and hooks firing (confirmed by restarting Claude Code after wizard completes)
  4. Setting `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, and optionally `SLACK_USER_ID` environment variables is the only configuration required; the server fails fast with a helpful error if required vars are missing
  5. A developer following the README can create a Slack app, configure required scopes, install Signal Flare, and receive their first Slack notification without external help
**Plans**: TBD

### Phase 4: Quality and CI
**Goal**: Signal Flare's core components are covered by an automated test suite and every pull request runs lint, typecheck, and tests before merge
**Depends on**: Phase 3
**Requirements**: PKG-06, PKG-07
**Success Criteria** (what must be TRUE):
  1. Running `npm test` locally executes tests for the MCP tool, hook handler, Slack client, and polling logic — all pass on a clean install
  2. Opening a pull request on GitHub automatically triggers the CI pipeline; the pipeline fails if lint, typecheck, or any test fails
  3. The polling loop test explicitly verifies that a thread containing only bot messages returns null (no false positive self-detection)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Slack Infrastructure and MCP Tool | 2/2 | COMPLETE | 2026-02-22 |
| 2. Hook Integration | 2/2 | Complete   | 2026-02-22 |
| 3. npm Packaging and Setup Wizard | 0/TBD | Not started | - |
| 4. Quality and CI | 0/TBD | Not started | - |
