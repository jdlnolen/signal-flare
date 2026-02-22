# Architecture Research

**Domain:** Claude Code MCP server + hooks-based Slack notification bridge
**Researched:** 2026-02-22
**Confidence:** HIGH (Claude Code hooks docs verified against live docs; MCP SDK verified; Slack API verified; hook limitations verified against open GitHub issues)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Claude Code Process                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Agentic Loop                                                │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │   │
│  │  │ AskUserQ    │  │ Tool calls   │  │ Stop / session    │  │   │
│  │  │ (elicits    │  │ (Bash, Edit, │  │ events            │  │   │
│  │  │  user input)│  │  Write, etc) │  │                   │  │   │
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │   │
│  └─────────┼────────────────┼────────────────────┼─────────────┘   │
│            │                │                    │                   │
│       PermissionRequest  PreToolUse          Stop /                 │
│       hook fires         hook fires          Notification           │
│            │                │                hook fires             │
│            └────────────────┼────────────────────┘                  │
│                             │                                        │
│                        Hook System                                   │
│                   (JSON payload via stdin)                           │
│                             │                                        │
│              ┌──────────────▼──────────────┐                        │
│              │  Hook Handler Script/Binary  │                        │
│              │  ~/.claude/settings.json or  │                        │
│              │  .claude/settings.json       │                        │
│              └──────────────┬──────────────┘                        │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Signal Flare Hook │
                    │  Handler           │
                    │  (Node.js script,  │
                    │   called by Claude │
                    │   Code via shell)  │
                    └─────────┬──────────┘
                              │  HTTP request to MCP server
                              │  (or direct Slack API call)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Signal Flare MCP Server                           │
│                    (stdio process, spawned by Claude Code)           │
│                                                                      │
│  ┌──────────────────┐   ┌────────────────┐   ┌──────────────────┐  │
│  │ ask_human_via_   │   │ Idle Timer     │   │ Poll Manager     │  │
│  │ slack tool       │   │ (detects user  │   │ (conversations.  │  │
│  │ (receives        │   │  absence)      │   │  replies poll    │  │
│  │  questions from  │   │                │   │  loop)           │  │
│  │  Claude via MCP) │   └────────────────┘   └──────────────────┘  │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │  @slack/web-api                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Slack Client (chat.postMessage, conversations.replies)       │   │
│  └──────────────────────────────────┬───────────────────────────┘   │
└─────────────────────────────────────┼─────────────────────────────- ┘
                                      │  HTTPS/REST
                                      ▼
                             ┌────────────────┐
                             │  Slack API     │
                             │  Workspace     │
                             └────────────────┘
                                      │
                                      │  Push notification
                                      ▼
                             ┌────────────────┐
                             │  User's Phone  │
                             │  / Other       │
                             │  Device        │
                             └────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Claude Code Hook Config | Declares which hook events trigger which scripts | JSON in `~/.claude/settings.json` or `.claude/settings.json` |
| Hook Handler Script | Receives hook JSON payload via stdin, decides whether to notify, calls MCP or Slack directly | Node.js script invoked as shell command |
| Idle Timer | Tracks time since last user terminal interaction; triggers Slack escalation after threshold | `setTimeout`/`Date.now()` comparison in MCP server or hook handler |
| MCP Server (`ask_human_via_slack`) | Exposes tool for Claude to explicitly request human input; manages thread lifecycle | TypeScript, `@modelcontextprotocol/sdk`, StdioServerTransport |
| Slack Client | Sends Block Kit messages, posts to channel, polls for replies | `@slack/web-api` WebClient |
| Poll Manager | Polls `conversations.replies` on a thread until a reply appears | `setInterval` loop with exponential backoff |

## Recommended Project Structure

```
signal-flare/
├── src/
│   ├── server.ts             # MCP server entry point — McpServer + StdioServerTransport
│   ├── tools/
│   │   └── ask-human.ts      # ask_human_via_slack tool implementation
│   ├── slack/
│   │   ├── client.ts         # Slack WebClient wrapper
│   │   ├── messages.ts       # Block Kit message builders
│   │   └── poller.ts         # Thread reply polling logic
│   ├── hooks/
│   │   └── notify.ts         # Hook handler script (compiled to dist/hooks/notify.js)
│   └── config.ts             # Env var validation (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)
├── dist/                     # Compiled JS output
├── scripts/
│   └── install-hooks.sh      # Helper to write .claude/settings.json hook entries
├── package.json              # "bin": { "signal-flare": "dist/server.js" }
└── README.md
```

### Structure Rationale

- **`src/server.ts`:** Thin entry point — creates McpServer, registers tools, connects stdio transport. Stays small so the binary stays focused.
- **`src/tools/`:** Each MCP tool is its own module; easy to add more tools without touching the server entry.
- **`src/slack/`:** Isolates Slack concerns. `client.ts` wraps WebClient and handles rate limiting; `poller.ts` owns the reply-wait loop.
- **`src/hooks/`:** The hook handler is a separate compiled entry point (`dist/hooks/notify.js`) invoked by Claude Code as a shell command — it should not import the full MCP server.
- **`scripts/`:** One-shot setup helper that writes the hook configuration into `~/.claude/settings.json` so users don't have to do it manually.

## Architectural Patterns

### Pattern 1: Stdio Transport for MCP Server

**What:** The MCP server runs as a subprocess of Claude Code. Claude Code spawns it via `command` in settings, communicates via newline-delimited JSON-RPC 2.0 over stdin/stdout.

**When to use:** Always for Claude Code MCP servers. HTTP/SSE transports are available but Claude Code defaults to stdio for local servers.

**Trade-offs:** Simple process model; no HTTP port needed; but stderr MUST NOT be used for logging (it will appear in Claude Code UI). Use a file logger or suppress logs in production.

**Example:**
```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAskHumanTool } from "./tools/ask-human.js";

const server = new McpServer(
  { name: "signal-flare", version: "1.0.0" },
  { capabilities: {} }
);

registerAskHumanTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// CRITICAL: never use console.log() — it writes to stdout and corrupts JSON-RPC
```

```json
// MCP server registration in ~/.claude.json or .mcp.json
{
  "mcpServers": {
    "signal-flare": {
      "type": "stdio",
      "command": "node",
      "args": ["/usr/local/lib/node_modules/signal-flare/dist/server.js"]
    }
  }
}
```

### Pattern 2: Hook Handler as Separate Binary

**What:** The hook handler (`dist/hooks/notify.js`) is a standalone script invoked by Claude Code via shell command. It reads JSON from stdin, decides whether to send a Slack notification, and exits. It does NOT run the MCP server.

**When to use:** For all hook-triggered notifications (idle detection, question interception, task completion).

**Trade-offs:** Keeps the hook handler fast and stateless; avoids starting the full MCP server on every hook fire. The MCP server and hook handler share the `src/slack/` module for Slack API calls.

**Example:**
```typescript
// src/hooks/notify.ts
import { createReadStream } from "fs";
const input = JSON.parse(await readStdin());

if (input.hook_event_name === "Notification" && input.notification_type === "idle_prompt") {
  // User has been away for 60+ seconds — send Slack notification
  await sendSlackNotification(input.message);
}
process.exit(0); // Always exit 0 unless blocking
```

```json
// .claude/settings.json hook config
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "node /usr/local/lib/node_modules/signal-flare/dist/hooks/notify.js"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "node /usr/local/lib/node_modules/signal-flare/dist/hooks/notify.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /usr/local/lib/node_modules/signal-flare/dist/hooks/notify.js"
          }
        ]
      }
    ]
  }
}
```

### Pattern 3: Thread-Based Reply Polling for First-Response-Wins

**What:** When a Slack notification is sent, the MCP server posts to a thread. The tool call blocks, polling `conversations.replies` until a reply arrives OR the terminal question is answered (whichever is first). A shared in-memory state tracks which question is "live."

**When to use:** For the bidirectional `ask_human_via_slack` flow — question goes out to Slack, answer comes back via thread reply.

**Trade-offs:** Polling is simple and reliable; no persistent WebSocket needed. Rate limit on `conversations.replies` for new apps as of May 2025 is 1 request/minute for some tiers — verify bot token tier before shipping. Use exponential backoff.

**Example:**
```typescript
// src/slack/poller.ts
export async function waitForThreadReply(
  client: WebClient,
  channelId: string,
  threadTs: string,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let delay = 3000; // start at 3s, back off to 15s max

  while (Date.now() < deadline) {
    await sleep(delay);
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      oldest: threadTs,
      limit: 10
    });
    const replies = result.messages?.slice(1); // skip original message
    if (replies?.length) {
      return replies[0].text ?? null;
    }
    delay = Math.min(delay * 1.5, 15000);
  }
  return null;
}
```

## Data Flow

### Question Interception Flow (AskUserQuestion via Hook)

```
Claude Code calls AskUserQuestion
        |
        v
PermissionRequest hook fires immediately
(hook payload: { tool_name: "AskUserQuestion", tool_input: { questions: [...] } })
        |
        v
Hook handler script reads stdin JSON
        |
        +-- User active in terminal? (idle timer < threshold) --> exit 0, no Slack
        |
        +-- User idle? -->
                |
                v
        Post Block Kit message to Slack (with question text)
                |
                v
        exit 0 (allow permission — terminal also shows question)
                |
                v
        First response wins:
        - Terminal answer: user types at terminal
        - Slack answer: poll thread, inject answer via PermissionRequest.updatedInput

NOTE: As of Feb 2026, the hook cannot directly pass an answer back to
AskUserQuestion. The PermissionRequest.hookSpecificOutput.updatedInput
approach is the proposed mechanism (GitHub #15872 closed as completed
Dec 2025, but implementation details need verification in actual Claude Code version).
```

### Task Completion / Error Notification Flow

```
Claude Code finishes task OR encounters error
        |
        v
Stop hook fires (on completion)
OR
PostToolUseFailure hook fires (on error)
        |
        v
Hook handler reads last_assistant_message / error fields
        |
        v
Post concise Slack notification (no reply needed, no polling)
        |
        v
exit 0
```

### Explicit MCP Tool Flow (ask_human_via_slack tool)

```
Claude decides to call ask_human_via_slack tool
        |
        v
MCP server receives tool call via stdin (JSON-RPC)
        |
        v
Server posts Block Kit message to Slack channel
        |
        v
Server starts polling conversations.replies loop
        |
        +-- Poll returns reply --> return reply text to Claude via MCP response
        |
        +-- Timeout --> return timeout message to Claude
```

### Key Data Flows

1. **Hook payload ingress:** Claude Code serializes event context as JSON and pipes it to the hook handler's stdin. The handler reads all of stdin before processing.
2. **Slack message egress:** Hook handler or MCP server calls `chat.postMessage` with Block Kit blocks. The `ts` (timestamp) of the posted message is saved as the thread root for polling.
3. **Reply poll loop:** `conversations.replies` is called with `oldest: threadTs` to fetch only replies after the original message. Loop exits on first reply or timeout.
4. **Answer injection:** For `PermissionRequest` hooks, the `hookSpecificOutput.updatedInput.answers` dict can pre-fill AskUserQuestion responses (verification needed against Claude Code version — see Gaps section).

## Scaling Considerations

This is a single-developer CLI tool, not a multi-tenant service. Scaling concerns are minimal and different in character:

| Concern | Single User (expected) | Multiple Users | Notes |
|---------|----------------------|----------------|-------|
| Slack API rate limits | Non-issue at 1 req/few-minutes | Could hit limits if >1 user shares same bot token | Each user should have their own Slack app/bot token |
| Concurrent sessions | Rare | Possible with tmux/multiple terminals | In-memory state in MCP server is per-process; each Claude Code session spawns its own MCP server instance |
| Poll loop resource use | Negligible | Negligible | Only polls during active question wait windows |
| Hook handler startup | ~50-100ms Node.js startup per hook fire | Same | Acceptable; hooks are low-frequency |

## Anti-Patterns

### Anti-Pattern 1: Using console.log() in the MCP Server

**What people do:** Call `console.log()` for debugging inside the MCP server process.

**Why it's wrong:** StdioServerTransport uses stdout as the exclusive JSON-RPC communication channel. Any `console.log()` output corrupts the protocol stream and breaks the MCP connection entirely.

**Do this instead:** Use `console.error()` (goes to stderr, shown in Claude Code debug mode) or a file-based logger. In production, suppress all output.

### Anti-Pattern 2: Using a Single Binary for Both MCP Server and Hook Handler

**What people do:** Point the Claude Code hook config at the same binary as the MCP server, assuming the MCP server can handle hook payloads.

**Why it's wrong:** The MCP server is a long-running process communicating via JSON-RPC; a hook handler is a short-lived script that reads one JSON payload and exits. Running a full MCP server per hook fire wastes 200-500ms on startup and is architecturally wrong.

**Do this instead:** Compile two separate entry points: `dist/server.js` (MCP server) and `dist/hooks/notify.js` (hook handler). Both can share `src/slack/` utilities.

### Anti-Pattern 3: Relying on idle_prompt for Immediate Question Detection

**What people do:** Use `Notification` hook with `matcher: "idle_prompt"` to detect when Claude asks a question, expecting immediate notification.

**Why it's wrong:** `idle_prompt` fires after 60+ seconds of inactivity (hardcoded, not configurable as of Feb 2026 — issue #13922 open). This is too slow for the "heads-up" use case. Additionally, it fires for all idle states, not just AskUserQuestion.

**Do this instead:** Use `PermissionRequest` hook with `matcher: "AskUserQuestion"` for immediate question detection. Continue to use `idle_prompt` as a fallback for the configurable idle threshold behavior.

### Anti-Pattern 4: Blocking on Slack Reply Inside a Hook Handler

**What people do:** Call `waitForThreadReply()` inside a synchronous hook handler, blocking Claude Code for 30-120 seconds.

**Why it's wrong:** Hook handlers that don't exit promptly block the entire Claude Code agentic loop. Claude sits idle waiting for the hook to return.

**Do this instead:** In the hook handler, send the Slack notification and exit immediately (`exit 0`). The actual waiting-for-reply logic belongs in the MCP tool (`ask_human_via_slack`), which Claude explicitly calls and which can block for a reply without freezing the hook system.

### Anti-Pattern 5: Polling conversations.replies Without Rate Limit Awareness

**What people do:** Poll at a fixed 1-second interval indefinitely.

**Why it's wrong:** As of May 2025, `conversations.replies` rate limits for new apps can be as low as 1 request/minute for certain bot token tiers. Aggressive polling risks API errors and failed lookups.

**Do this instead:** Use exponential backoff (start at 3s, cap at 15s). Add jitter. Respect `Retry-After` headers on 429 responses.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Slack API | REST via `@slack/web-api` WebClient | Requires `chat:write`, `channels:history`, `groups:history` scopes. Bot token (xoxb-...) stored as env var. |
| Claude Code hooks | Shell command invocation; JSON via stdin; exit code + JSON stdout for control | Hook config written to `~/.claude/settings.json` or `.claude/settings.json` |
| Claude Code MCP | Stdio JSON-RPC via `@modelcontextprotocol/sdk` StdioServerTransport | Registered in `~/.claude.json` or `.mcp.json` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Hook handler -> Slack | Direct `@slack/web-api` call | No MCP hop needed for notification-only use cases |
| MCP tool -> Slack | Direct `@slack/web-api` call + poll loop | Tool call blocks waiting for reply |
| Hook handler -> MCP server | NOT needed for v1 | Hook handler and MCP server are separate processes; communicate via Slack channel state if needed |
| npm package -> Claude Code hooks | `scripts/install-hooks.sh` or programmatic write | Must write to `~/.claude/settings.json` on install; needs `$HOME` path |
| npm package -> MCP registration | `claude mcp add` CLI command or `.mcp.json` | Setup script should run `claude mcp add` or write `.mcp.json` |

## Critical Architectural Constraint: AskUserQuestion Hook Interception

**This is the most important architectural decision in the project.**

As of February 2026, the mechanism for intercepting AskUserQuestion and routing its answer back to Claude is not fully resolved. The current state:

1. **Detection** (confirmed working): `PermissionRequest` hook fires immediately when `AskUserQuestion` is called. The hook receives the question text.

2. **Notification** (confirmed working): The hook handler can send a Slack notification and exit with `exit 0`, allowing the terminal question to continue showing normally.

3. **Answer injection** (unverified): GitHub issue #12605 was closed as "completed" in December 2025, suggesting `PermissionRequest.hookSpecificOutput.updatedInput.answers` can pre-fill AskUserQuestion responses. However, this requires verification against the actual Claude Code version installed by the user.

4. **First-response-wins implementation**: The cleanest v1 approach is:
   - Hook detects question, sends Slack notification, exits
   - Terminal also shows question normally (both paths active simultaneously)
   - If user answers at terminal: Claude proceeds
   - If user answers via Slack: a separate process or the MCP server intercepts the Slack reply and simulates the terminal answer — OR Claude eventually polls via `ask_human_via_slack` tool explicitly

**Recommended v1 implementation**: Lean on the `ask_human_via_slack` MCP tool as the primary bidirectional path. Claude must be instructed (via CLAUDE.md or system prompt) to call this tool when asking questions. The hook-based interception of `AskUserQuestion` is additive — it provides a Slack notification even when Claude doesn't explicitly use the MCP tool.

## Suggested Build Order

1. **Slack client + message builder** — No Claude Code dependency; fully testable in isolation with a real Slack workspace
2. **Poll manager** — Depends only on Slack client; testable standalone
3. **MCP server with `ask_human_via_slack` tool** — Depends on Slack client + poll manager; test with MCP Inspector
4. **Hook handler script** — Thin wrapper around Slack client; depends on nothing new; test by piping JSON manually
5. **Hook configuration installer** — Writes to `~/.claude/settings.json`; requires careful path handling
6. **npm package scaffolding** — `bin` entries, `postinstall` scripts, integration tests

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — HIGH confidence, official current docs (fetched 2026-02-22)
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) — HIGH confidence, official current docs (fetched 2026-02-22)
- [MCP TypeScript SDK — server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — HIGH confidence, official SDK docs
- [GitHub Issue #15872 — Hook support for AskUserQuestion](https://github.com/anthropics/claude-code/issues/15872) — HIGH confidence (live issue, Feb 2026)
- [GitHub Issue #12605 — AskUserQuestion Hook Support (CLOSED COMPLETED)](https://github.com/anthropics/claude-code/issues/12605) — MEDIUM confidence (closed Dec 2025, implementation details unverified)
- [GitHub Issue #13922 — Configurable idle_prompt timeout (OPEN)](https://github.com/anthropics/claude-code/issues/13922) — HIGH confidence (timeout is hardcoded at 60s)
- [GitHub Issue #13024 — Hook for waiting for user input](https://github.com/anthropics/claude-code/issues/13024) — HIGH confidence (PermissionRequest workaround confirmed by community)
- [Slack conversations.replies API](https://api.slack.com/methods/conversations.replies) — HIGH confidence, official Slack docs
- [@slack/web-api npm](https://www.npmjs.com/package/@slack/web-api) — HIGH confidence
- [GitHub Issue #23383 — Notification hook latency](https://github.com/anthropics/claude-code/issues/23383) — MEDIUM confidence (known latency issue in Notification events)

---
*Architecture research for: Claude Code MCP server + hooks-based Slack notification bridge (Signal Flare)*
*Researched: 2026-02-22*
