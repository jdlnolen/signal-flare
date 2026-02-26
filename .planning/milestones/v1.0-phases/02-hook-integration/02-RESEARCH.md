# Phase 2: Hook Integration - Research

**Researched:** 2026-02-22
**Domain:** Claude Code Hooks API, Node.js child_process, TypeScript ESM entry points
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Notification Content & Tone**
- Task completion (Stop hook): one-line summary sentence of what Claude accomplished, extracted from last assistant message
- Error notifications (PostToolUseFailure): include tool name, error text, AND file path / command context
- All notification types use a unified Block Kit layout (same structure as Phase 1 messages) with a text label ("COMPLETED", "ERROR", "QUESTION", "PERMISSION") to differentiate — not distinct color bars per type
- Reuse Phase 1's Block Kit builder for rich formatting across all notification types — consistent look for all Signal Flare messages

**Idle Timeout & Cancellation**
- All notifications fire to Slack immediately — no delay before sending
- One global configurable timeout (env var, default 90s) — applies as the "resolved in terminal" detection window for questions/permission prompts
- If user answers a question in terminal within the 90s window, post a "resolved in terminal" reply in the Slack thread
- Errors and completions have no cancellation window (fire-and-forget, no thread reply expected)

**Hook Handler Execution Model**
- Hook handler is a separate entry point: `dist/hook-handler.js` (not the MCP server, not a CLI subcommand)
- Hook config in Claude Code settings points to `node /path/to/signal-flare/dist/hook-handler.js`
- Shares configuration via same environment variables as MCP server (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_USER_ID)
- Hook handler exits immediately after sending the Slack notification (non-blocking)
- For the 90s "resolved in terminal" watcher: hook spawns a detached background process, then exits — background process handles the thread update if terminal response detected

**Question Detection & Extraction**
- PermissionRequest hook fires for ALL permission prompts, not just AskUserQuestion — every file write, bash command, etc. triggers a Slack notification
- Every permission prompt gets its own individual Slack notification — no batching or throttling
- For AskUserQuestion: show full question text and numbered options in Slack (same format as Phase 1 MCP tool) — user can reply with a number
- For non-AskUserQuestion permission prompts: show tool name + the specific action being requested (e.g., "Claude wants to run: Bash: npm install")

### Claude's Discretion
- Whether to use one handler script that routes internally or separate scripts per event type
- How to detect "resolved in terminal" (file watcher, process polling, or Claude Code API)
- Exact stdin JSON parsing approach for each hook event type
- Error message wording and formatting details

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOOK-01 | PermissionRequest hook detects when Claude calls AskUserQuestion and extracts question text and options | PermissionRequest input schema provides `tool_name` and `tool_input` fields; AskUserQuestion appears as an MCP tool call matching `mcp__signal-flare__ask_human_via_slack` or similar; `tool_input` contains question and options |
| HOOK-02 | Idle timer (configurable, default 90s) delays Slack escalation — only posts to Slack if user hasn't responded in terminal | Per locked decisions, interpretation is inverted: fire Slack immediately, then spawn 90s background watcher to detect terminal response and post "resolved in terminal" thread reply |
| HOOK-03 | Stop hook sends task completion notification to Slack with last assistant message summary (async, non-blocking) | Stop hook input includes `last_assistant_message` field directly — no transcript parsing needed; use `async: true` in hook config OR exit immediately after `fire-and-forget` post |
| HOOK-04 | PostToolUseFailure hook sends error notification to Slack with error text and tool name (async, non-blocking) | PostToolUseFailure input includes `tool_name`, `tool_input`, and `error` fields directly; fire-and-forget pattern, exit 0 immediately |
</phase_requirements>

## Summary

Phase 2 implements three Claude Code hooks (Stop, PostToolUseFailure, PermissionRequest) that fire Slack notifications automatically. The hook handler is a new TypeScript entry point (`src/hook-handler.ts` → `dist/hook-handler.js`) that reads JSON from stdin, routes by `hook_event_name`, posts to Slack using the Phase 1 `SlackClient` and Block Kit builder, then exits immediately.

The official Claude Code hooks API (verified from current docs at code.claude.com/docs/en/hooks) provides everything this phase needs without workarounds. Each hook type delivers exactly the fields required: `Stop` provides `last_assistant_message` directly (no transcript parsing needed), `PostToolUseFailure` provides `tool_name`, `tool_input`, and `error`, and `PermissionRequest` provides `tool_name` and `tool_input`. The `async: true` hook configuration flag exists but is NOT the right tool here — the locked decision calls for a separate entry point that exits immediately, which is simpler and more explicit.

For the 90s "resolved in terminal" watcher (HOOK-02), the hook handler sends Slack immediately, then spawns a detached child process using Node.js `child_process.spawn` with `detached: true` and `stdio: 'ignore'`, then calls `unref()` so the parent can exit. The background process monitors for terminal resolution via `transcript_path` polling (checking if new messages appeared after the hook fired), then posts a "resolved in terminal" thread reply.

**Primary recommendation:** Build `src/hook-handler.ts` as a single routing entry point; add `src/hooks/` directory for per-event handlers; add `src/hooks/watcher.ts` as the separate detached background process entry point. Update `tsup.config.ts` to build both entry points.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (existing) @slack/web-api | ^7.14.1 | Post Slack messages from hook handler | Already installed, Phase 1 SlackClient reused directly |
| (existing) zod | ^3.25.0 | Validate hook stdin JSON input | Already installed, consistent with Phase 1 config validation |
| (existing) tsup | ^8.0.0 | Build additional entry points | Already configured; just add hook-handler.ts to entry array |
| Node.js child_process | built-in | Spawn detached background watcher process | Built-in, no install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js readline | built-in | Read stdin from Claude Code hook system | Used for reading the hook JSON input from stdin |
| Node.js fs | built-in | Poll transcript file in background watcher | Used by watcher to detect terminal response |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single routing entry point | Separate scripts per event | Separate scripts means 3x the boilerplate and config entries in settings.json; single entry point with internal routing is simpler |
| Detached child_process for watcher | `async: true` hook flag | `async: true` makes the hook non-blocking but the hook process still runs inside Claude Code's lifecycle; detached child process exits completely independent of Claude Code — cleaner separation |
| Transcript file polling for terminal detection | Process-based detection | Transcript file is provided in every hook's stdin input (`transcript_path`); polling it is the most reliable approach available without extra infrastructure |

**Installation:** No new packages needed. All dependencies are already installed from Phase 1.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server.ts            # Existing MCP server entry point (unchanged)
├── hook-handler.ts      # NEW: Hook handler entry point (routes by event type)
├── config.ts            # Existing config (add HOOK_IDLE_TIMEOUT_MS)
├── types.ts             # Existing types (add hook input types)
├── slack/
│   ├── client.ts        # Existing (unchanged)
│   ├── messages.ts      # Existing (extend with buildHookMessages)
│   └── poller.ts        # Existing (unchanged)
├── hooks/
│   ├── router.ts        # NEW: Routes stdin input to correct handler
│   ├── stop.ts          # NEW: Stop hook handler (task completion)
│   ├── post-tool-failure.ts  # NEW: PostToolUseFailure handler (errors)
│   ├── permission.ts    # NEW: PermissionRequest handler (questions/permissions)
│   └── watcher.ts       # NEW: Detached background watcher for "resolved in terminal"
└── tools/
    └── ask-human.ts     # Existing (unchanged)
```

### Pattern 1: Single Entry Point with Internal Routing

**What:** `hook-handler.ts` reads JSON from stdin, inspects `hook_event_name`, dispatches to the appropriate handler in `src/hooks/`, then exits with code 0.

**When to use:** Always for Claude Code hook integration.

**Example:**
```typescript
// src/hook-handler.ts
// Source: Claude Code Hooks reference (code.claude.com/docs/en/hooks)

import { loadConfig } from "./config.js";
import { createSlackClient } from "./slack/client.js";
import { routeHookEvent } from "./hooks/router.js";

// Read all stdin before processing (Claude Code sends JSON on stdin)
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

(async () => {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw);

    const config = loadConfig();
    const slackClient = await createSlackClient(config);

    await routeHookEvent(input, slackClient, config);

    process.exit(0);
  } catch (err) {
    console.error("[signal-flare hook] Fatal error:", err);
    process.exit(1);  // Non-blocking error (not exit 2)
  }
})();
```

### Pattern 2: Stop Hook Handler (Task Completion)

**What:** Extracts `last_assistant_message`, builds one-line summary, posts "COMPLETED" notification, exits immediately.

**When to use:** `hook_event_name === "Stop"`

**Example:**
```typescript
// src/hooks/stop.ts
// Source: Stop hook input schema from code.claude.com/docs/en/hooks#stop

interface StopHookInput {
  hook_event_name: "Stop";
  session_id: string;
  transcript_path: string;
  cwd: string;
  last_assistant_message: string;
  stop_hook_active: boolean;
}

export async function handleStop(
  input: StopHookInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  // Truncate last_assistant_message to one summary sentence
  const summary = extractSummary(input.last_assistant_message);

  const payload = buildCompletedMessage(summary, config.SLACK_USER_ID);

  await slackClient.web.chat.postMessage({
    channel: slackClient.channelId,
    text: summary,
    ...payload,
  });
  // Exit immediately after posting — never block Claude Code
}
```

### Pattern 3: PostToolUseFailure Hook Handler (Errors)

**What:** Extracts `tool_name`, `error`, and relevant fields from `tool_input`, posts "ERROR" notification, exits immediately.

**When to use:** `hook_event_name === "PostToolUseFailure"`

**Example:**
```typescript
// src/hooks/post-tool-failure.ts
// Source: PostToolUseFailure input schema from code.claude.com/docs/en/hooks#posttoolusefailure

interface PostToolUseFailureInput {
  hook_event_name: "PostToolUseFailure";
  session_id: string;
  transcript_path: string;
  cwd: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
}

export async function handlePostToolUseFailure(
  input: PostToolUseFailureInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  // Extract context (file_path for Write/Edit/Read, command for Bash, etc.)
  const context = extractToolContext(input.tool_name, input.tool_input);

  const payload = buildErrorMessage(input.tool_name, input.error, context, config.SLACK_USER_ID);

  await slackClient.web.chat.postMessage({
    channel: slackClient.channelId,
    text: `Tool error: ${input.tool_name}`,
    ...payload,
  });
}
```

### Pattern 4: PermissionRequest Hook Handler

**What:** Detects whether this is an AskUserQuestion call or a regular permission prompt, formats appropriate message, posts immediately, then spawns detached watcher.

**When to use:** `hook_event_name === "PermissionRequest"`

**Key insight:** AskUserQuestion in Phase 1 is registered as an MCP tool named `ask_human_via_slack`. The PermissionRequest hook fires with `tool_name` set to the MCP tool name when Claude Code seeks permission for MCP tool calls. For built-in tools (Bash, Write, etc.), `tool_name` is the built-in tool name.

**Example:**
```typescript
// src/hooks/permission.ts
// Source: PermissionRequest input schema from code.claude.com/docs/en/hooks#permissionrequest

interface PermissionRequestInput {
  hook_event_name: "PermissionRequest";
  session_id: string;
  transcript_path: string;
  cwd: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  permission_suggestions?: Array<{ type: string; tool: string }>;
}

export async function handlePermissionRequest(
  input: PermissionRequestInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  const isAskHuman = input.tool_name === "mcp__signal-flare__ask_human_via_slack";

  let payload;
  if (isAskHuman) {
    // Show question text + options (same format as Phase 1 MCP tool)
    const question = input.tool_input.question as string;
    const options = input.tool_input.options as string[] | undefined;
    payload = buildQuestionMessage({ question, options }, config.SLACK_USER_ID);
  } else {
    // Show tool name + specific action
    const actionDescription = extractActionDescription(input.tool_name, input.tool_input);
    payload = buildPermissionMessage(input.tool_name, actionDescription, config.SLACK_USER_ID);
  }

  const postResult = await slackClient.web.chat.postMessage({
    channel: slackClient.channelId,
    text: `Permission needed: ${input.tool_name}`,
    ...payload,
  });

  // Spawn detached watcher to detect "resolved in terminal" within 90s
  if (postResult.ok && postResult.ts) {
    spawnWatcher(input.transcript_path, postResult.ts, slackClient.channelId, config);
  }
  // Exit immediately — watcher runs detached
}
```

### Pattern 5: Detached Background Watcher

**What:** Spawned as a detached child process. Polls transcript file every 5s for 90s. If new messages appear from the user (terminal response detected), posts "resolved in terminal" reply to Slack thread.

**When to use:** After every PermissionRequest notification is posted.

**Example:**
```typescript
// src/hooks/watcher.ts — separate detached entry point

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

export function spawnWatcher(
  transcriptPath: string,
  threadTs: string,
  channelId: string,
  config: Config
): void {
  const watcher = spawn(
    process.execPath, // node
    [
      new URL("./watcher.js", import.meta.url).pathname,
      transcriptPath,
      threadTs,
      channelId,
    ],
    {
      detached: true,
      stdio: "ignore",
      env: process.env,
    }
  );
  watcher.unref(); // Allow parent to exit without waiting for child
}

// watcher.ts main() — runs in background:
// 1. Record current transcript line count at start
// 2. Poll every 5s for up to HOOK_IDLE_TIMEOUT_MS (90s default)
// 3. If transcript has new human-authored messages → post "resolved in terminal"
// 4. If timeout reached with no new messages → exit silently (Slack notification stands)
```

### Pattern 6: tsup Multi-Entry Build

**What:** Update `tsup.config.ts` to build both `server.ts` and `hook-handler.ts` (and optionally `hooks/watcher.ts` as a separate output).

**Example:**
```typescript
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hook-handler.ts",
    "src/hooks/watcher.ts",
  ],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

### Pattern 7: Claude Code Settings Configuration

**What:** The hook configuration that goes in `~/.claude/settings.json` (or the project's `.claude/settings.json`).

**Example:**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/signal-flare/dist/hook-handler.js"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/signal-flare/dist/hook-handler.js"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/signal-flare/dist/hook-handler.js"
          }
        ]
      }
    ]
  }
}
```

Note: The same `hook-handler.js` entry point handles all three events. Internal routing by `hook_event_name` means one command in the config for each event type, not per-tool matchers.

### Anti-Patterns to Avoid

- **Using `async: true` in hook config instead of a separate detached process:** `async: true` runs hooks in the background but still within Claude Code's process tracking. For Signal Flare, the watcher needs to outlive the hook invocation cleanly — a detached child process is the correct approach.
- **Writing JSON to stdout from the hook handler:** Claude Code only processes JSON output on exit 0 for decision control. Signal Flare hooks fire notifications and exit 0 without returning decision JSON — that is correct. Writing debug output to stdout would corrupt Claude Code's hook parsing. Always use `console.error()`.
- **Calling `auth.test()` in the hook handler:** `createSlackClient()` currently does `auth.test()` at startup. This adds a network round-trip to every hook invocation. The hook handler should either skip auth validation (just pass token directly) or cache the bot user ID via a lightweight alternative.
- **Parsing the transcript JSON file for `last_assistant_message`:** The Stop hook input already includes `last_assistant_message` as a top-level field. Do not parse the transcript file.
- **Batching PermissionRequest events:** The locked decision requires every permission prompt to fire its own individual Slack notification. Do not attempt deduplication or batching.
- **Using exit code 2 from the hook handler:** Exit 2 is a blocking error that denies permissions or blocks tool calls. Signal Flare hooks are notification-only and must always exit 0 (or 1 for fatal errors that should be non-blocking).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slack message posting | Custom HTTP client | Existing `SlackClient` + `@slack/web-api` from Phase 1 | Already handles auth, rate limits, and API errors |
| Block Kit message formatting | Raw JSON construction | Extend Phase 1's `buildQuestionMessage()` and add new builders to `messages.ts` | Consistent layout with existing messages |
| Stdin reading from Claude Code | Stream-based parsing | Simple `readStdin()` async accumulator, then `JSON.parse()` | Claude Code sends complete JSON in one shot; no streaming needed |
| Detached process management | Daemon frameworks | Node.js `child_process.spawn` with `detached: true` + `unref()` | Built-in, zero dependencies, exactly right for this use case |

**Key insight:** The Phase 1 infrastructure (SlackClient, Block Kit builders, config loader) does most of the heavy lifting. Phase 2 is primarily: (1) plumbing hook stdin to the right handler, and (2) calling the right builder for each event type.

## Common Pitfalls

### Pitfall 1: auth.test() Latency in Hook Handler

**What goes wrong:** `createSlackClient()` calls `auth.test()` at construction time, adding a Slack API round-trip to every hook invocation. For Stop and PostToolUseFailure hooks that fire frequently, this adds 100-500ms of latency before the notification is sent.

**Why it happens:** The Phase 1 `createSlackClient()` was designed for a long-lived MCP server where one startup call amortizes over the lifetime. Hook handler is invoked fresh per event.

**How to avoid:** Create a `createSlackClientFromEnv()` variant for the hook handler that skips `auth.test()` and constructs `SlackClient` directly with a known bot user ID (or without bot user ID filtering since the hook handler doesn't poll). Alternatively, use the WebClient directly without wrapping in SlackClient.

**Warning signs:** Hook handler takes >500ms before posting the Slack message.

### Pitfall 2: console.log() in Hook Handler Corrupts Nothing (But Still Banned)

**What goes wrong:** The `console.log()` ban in Phase 1 was specifically for MCP stdio transport corruption. For the hook handler, stdout is read by Claude Code for JSON decision output — so `console.log()` wouldn't corrupt MCP, but could inject unexpected text into Claude Code's hook output parsing if it's not valid JSON.

**Why it happens:** Misunderstanding the scope of the stdout constraint.

**How to avoid:** Maintain the same `console.error()` discipline across all Signal Flare code. Keep hook handler stdout empty (or only valid JSON if returning a decision, which Signal Flare doesn't need to do). This is consistent with the project-wide `console.error()` rule and avoids Claude Code misinterpreting debug output.

**Warning signs:** Seeing unexpected text in Claude Code's hook debug output (`claude --debug`).

### Pitfall 3: Watcher Spawning Fails Silently

**What goes wrong:** The detached child process for the 90s watcher fails to spawn (wrong path, missing env vars), but the hook handler already exited — there's no way to surface the error.

**Why it happens:** Detached processes by definition are fire-and-forget. If the watcher crashes immediately, the "resolved in terminal" thread reply never gets posted, but the user won't know.

**How to avoid:** Verify the watcher script path exists before spawning. Log watcher spawn errors to stderr (hook handler stderr is shown in `claude --debug` verbose mode). The watcher itself should write its errors to a log file (`~/.claude/signal-flare-watcher.log`) since it has no attached stderr after detachment.

**Warning signs:** Slack shows the permission notification but never gets the "resolved in terminal" reply even after terminal responses.

### Pitfall 4: PermissionRequest Tool Name for AskUserQuestion

**What goes wrong:** Signal Flare's MCP tool `ask_human_via_slack` may appear in PermissionRequest hook input under a tool name like `mcp__signal-flare__ask_human_via_slack`. If the hook handler checks for the wrong name, it misidentifies the event type and formats a generic "permission needed" message instead of the question-specific format.

**Why it happens:** MCP tools follow the naming pattern `mcp__<server>__<tool>`. The server name comes from the MCP server configuration, and the tool name is the registered name. Phase 1 registers the tool as `ask_human_via_slack` on a server named `signal-flare`.

**How to avoid:** Check if `tool_name` includes `ask_human_via_slack` as a substring (not exact match) to be robust to different MCP naming conventions. Example: `input.tool_name.includes("ask_human_via_slack")`.

**Warning signs:** AskUserQuestion permission prompts show up as generic "PERMISSION" messages instead of "QUESTION" messages with options.

### Pitfall 5: Stop Hook Fires on stop_hook_active

**What goes wrong:** If Signal Flare's Stop hook itself causes Claude to continue (by returning a blocking decision), the `stop_hook_active` field will be `true` on subsequent Stop hook firings. Signal Flare's Stop hook does NOT return a blocking decision (it exits 0 without JSON), but developers must be careful not to accidentally add blocking behavior.

**Why it happens:** The Stop hook can block Claude from stopping if it returns `{ "decision": "block", "reason": "..." }`. If the hook accidentally does this, it creates an infinite loop.

**How to avoid:** Signal Flare's hook handler always exits 0 without JSON output. Never return `decision: "block"` from a notification-only hook. Check `stop_hook_active` field defensively and skip processing if already active (belt-and-suspenders).

**Warning signs:** Claude Code enters an infinite loop, repeatedly firing the Stop hook.

### Pitfall 6: Transcript Polling for Terminal Detection

**What goes wrong:** The watcher polls `transcript_path` to detect terminal responses. The transcript is a JSONL file. If the file format changes, the watcher breaks silently.

**Why it happens:** There is no official Claude Code API for detecting terminal input. Transcript file polling is the available mechanism.

**How to avoid:** Parse transcript lines defensively — wrap JSON.parse in try-catch, skip malformed lines, don't assume message schema. Check for new lines added after the hook fired (count-based comparison is more robust than content-based parsing).

**Warning signs:** Watcher never fires "resolved in terminal" even when user responds in terminal.

## Code Examples

Verified patterns from official sources:

### Stop Hook Input Schema
```typescript
// Source: code.claude.com/docs/en/hooks#stop (verified 2026-02-22)
interface StopHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions";
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message: string;  // Text content of Claude's final response
}
```

### PostToolUseFailure Hook Input Schema
```typescript
// Source: code.claude.com/docs/en/hooks#posttoolusefailure (verified 2026-02-22)
interface PostToolUseFailureInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "PostToolUseFailure";
  tool_name: string;  // e.g., "Bash", "Write", "Edit"
  tool_input: {
    // For Bash: { command: string, description?: string }
    // For Write: { file_path: string, content: string }
    // For Edit: { file_path: string, old_string: string, new_string: string }
    [key: string]: unknown;
  };
  tool_use_id: string;
  error: string;        // String describing what went wrong
  is_interrupt?: boolean;
}
```

### PermissionRequest Hook Input Schema
```typescript
// Source: code.claude.com/docs/en/hooks#permissionrequest (verified 2026-02-22)
interface PermissionRequestInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "PermissionRequest";
  tool_name: string;  // Tool name or MCP tool name (mcp__<server>__<tool>)
  tool_input: Record<string, unknown>;
  permission_suggestions?: Array<{
    type: string;   // e.g., "toolAlwaysAllow"
    tool: string;
  }>;
  // NOTE: No tool_use_id on PermissionRequest (unlike PostToolUse)
}
```

### Detached Child Process Pattern
```typescript
// Source: Node.js official docs (nodejs.org/api/child_process.html)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

function spawnDetachedWatcher(args: string[]): void {
  const watcherPath = fileURLToPath(
    new URL("./watcher.js", import.meta.url)
  );

  const child = spawn(process.execPath, [watcherPath, ...args], {
    detached: true,
    stdio: "ignore",   // Detach all stdio so parent can exit
    env: process.env,
  });

  child.unref();       // Allow parent process to exit independently
}
```

### Config Extension for HOOK_IDLE_TIMEOUT_MS
```typescript
// Extend src/config.ts ConfigSchema to add hook-specific env var
const ConfigSchema = z.object({
  // ... existing fields ...
  HOOK_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(90000),  // 90 seconds default
});
```

### Block Kit Message for Notification Types
```typescript
// Extend src/slack/messages.ts with hook-specific builders

type HookNotificationType = "COMPLETED" | "ERROR" | "QUESTION" | "PERMISSION";

interface HookMessageOptions {
  label: HookNotificationType;
  headline: string;
  body?: string;
  context?: string;
  userId?: string;
}

// Uses same attachment wrapper pattern as buildQuestionMessage
// Unified layout: header (label), section (headline + @mention), optional rich text (context)
// Color: same orange (#FFA500) as "normal" urgency for all hook types
export function buildHookMessage(opts: HookMessageOptions): { attachments: MessageAttachment[] };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No hook system | Full hook lifecycle (SessionStart through SessionEnd) | Claude Code hooks feature added | Everything in Phase 2 is possible without workarounds |
| Separate hook scripts per event | Single routing script with internal dispatch | Best practice per docs | Simpler settings.json config, single entry point to maintain |
| PreToolUse `decision`/`reason` top-level | `hookSpecificOutput.permissionDecision` / `permissionDecisionReason` | Recent API update | Old top-level fields deprecated for PreToolUse; Signal Flare uses PermissionRequest, not PreToolUse, so this doesn't directly apply |
| Transcript parsing for `last_assistant_message` | `last_assistant_message` field in Stop/SubagentStop input | Current version | No transcript parsing needed for Stop hook — field is provided directly |

**Deprecated/outdated:**
- PreToolUse `decision` and `reason` top-level fields: deprecated, replaced by `hookSpecificOutput.permissionDecision` / `permissionDecisionReason`. Signal Flare uses PermissionRequest (not PreToolUse) so this is informational only.

## Open Questions

1. **Exact MCP tool name for AskUserQuestion in PermissionRequest hook**
   - What we know: MCP tools appear as `mcp__<server>__<tool>` in hook events; Signal Flare's server is named "signal-flare" and the tool is named "ask_human_via_slack"
   - What's unclear: Whether the tool name is `mcp__signal-flare__ask_human_via_slack` or some other format; whether `PermissionRequest` fires for MCP tool calls at all (docs say it fires for "permission dialog" events, which may or may not include MCP tool permission prompts)
   - Recommendation: Implement with `tool_name.includes("ask_human_via_slack")` as the detection heuristic; add a debug log in development to see exact `tool_name` values; add a test hook that logs all PermissionRequest events to verify

2. **Transcript file format for watcher terminal-response detection**
   - What we know: `transcript_path` is provided in all hook inputs; it's a JSONL file (`.jsonl` extension per the docs)
   - What's unclear: Exact JSONL schema (message types, timestamps, how to distinguish user messages from assistant messages); whether the file is written atomically or appended in real-time
   - Recommendation: Implement watcher using line-count detection (count lines at hook fire time, check if new lines added within timeout) rather than content parsing; parse new lines defensively only to verify they're human-authored messages

3. **`createSlackClient` auth.test() performance for hook handler**
   - What we know: Current implementation calls `auth.test()` which requires a network round-trip; hook handler is invoked fresh for every hook event
   - What's unclear: Whether this latency is acceptable (100-500ms) or whether the hook handler needs a lighter client construction path
   - Recommendation: Create a `createSlackClientDirect(config: Config): SlackClient` that skips `auth.test()` and uses a placeholder botUserId (empty string or the configured SLACK_USER_ID); the hook handler never polls for replies, so botUserId filtering is not needed

## Sources

### Primary (HIGH confidence)
- https://code.claude.com/docs/en/hooks — Full hooks reference documentation, fetched 2026-02-22. Verified Stop, PostToolUseFailure, and PermissionRequest input schemas, exit code behavior, async hook flag, and configuration structure.
- Node.js built-in `child_process` — `spawn` with `detached: true` + `unref()` is the documented pattern for fire-and-forget background processes.

### Secondary (MEDIUM confidence)
- Phase 1 source code (`src/slack/client.ts`, `src/slack/messages.ts`, `src/config.ts`, `src/types.ts`) — direct reading of Phase 1 implementation, verified reuse points.
- tsup documentation (via existing `tsup.config.ts`) — multi-entry build verified as possible by adding additional paths to `entry` array.

### Tertiary (LOW confidence)
- MCP tool naming convention (`mcp__<server>__<tool>`) — stated in Claude Code hooks docs as a pattern, but exact tool name that appears in PermissionRequest hook input for Signal Flare's `ask_human_via_slack` tool is unverified until runtime testing.
- Transcript JSONL schema for watcher terminal-response detection — transcript format not officially documented; structure inferred from common Claude Code patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies are Phase 1 carry-overs; no new packages needed
- Hook input schemas: HIGH — verified directly from current official docs (code.claude.com/docs/en/hooks, fetched 2026-02-22)
- Architecture patterns: HIGH — single entry point + internal routing is clearly the right approach; detached child_process pattern is well-established Node.js
- Pitfalls: HIGH for `auth.test()` latency and exit code behavior; MEDIUM for MCP tool name and transcript format (depends on runtime verification)
- Watcher terminal detection: MEDIUM — transcript polling is the only viable approach but the exact JSONL format needs validation

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (hook API is relatively new but stabilizing; check for breaking changes if using after this date)
