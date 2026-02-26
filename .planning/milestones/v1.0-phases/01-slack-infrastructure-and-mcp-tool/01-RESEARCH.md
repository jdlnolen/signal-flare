# Phase 1: Slack Infrastructure and MCP Tool - Research

**Researched:** 2026-02-22
**Domain:** MCP server (TypeScript, stdio transport) + Slack Web API (Block Kit messaging + thread polling)
**Confidence:** HIGH for MCP SDK and Slack API; MEDIUM for tool timeout configuration (active issue area)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Message Design**
- Rich context in every message: question text + code snippets + file paths + session info — include everything available
- Options rendered as numbered list ("Reply '1', '2', or '3' — or type a full response")
- High urgency: red color badge + bold question text + siren emoji + explicit @mention call-out
- Normal urgency: yellow badge, standard formatting
- Low urgency: green badge, minimal visual weight
- "Timed out" and "Response received" notices are full standalone messages in the thread (visible at a glance from thread list), not subtle context blocks
- @mention configured user (SLACK_USER_ID) in every message for push notifications

**Polling Behavior**
- Exponential backoff: start at 3s, back off to 15s cap
- On 10-minute timeout: auto-retry once — post a "still waiting" bump message in the thread, reset timer for another 10 minutes, then error if still no reply
- Filter short replies: single emoji or single word (like "ok") don't count as real answers — require at least a few words; Claude gets the full text of substantive replies
- Bot's own messages never count as human replies (filter by bot_id and user_id)

**Tool Interface**
- Tool name: `ask_human_via_slack`
- Parameters: question (required), context (optional), options (optional string[]), urgency (optional, default "normal"), session_id (optional — links Slack threads to Claude sessions)
- Tool description: broad — "Use when you need human input" so Claude calls it for any question
- MCP tool has an optional delay-before-sending (configurable, like prototype's 1-min delay) — separate from hook idle timeout in Phase 2
- Return format: structured — include who replied, response time, which numbered option was selected (if applicable), plus raw reply text

**Code Structure**
- Split into separate modules: Slack client, Block Kit builder, poll manager, MCP server entry point — each independently testable
- Strict TypeScript types — no `as any` casts; define proper interfaces for all Block Kit structures including rich_text
- Zod validation everywhere: tool params (via MCP SDK), env vars at startup, Slack API response shapes — fail fast with clear errors
- Pin zod to ^3.25.0 — let MCP SDK's compatibility shim handle its internal v4 usage
- All logging via `console.error()` — zero `console.log()` (corrupts MCP stdio transport)

### Claude's Discretion
- Exact exponential backoff curve (starting interval, multiplier, jitter)
- How to detect "short replies" (character count, word count, or pattern matching)
- Internal module boundaries beyond the 4 named modules
- Error message wording for timeout, missing env vars, Slack API failures

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-01 | User can send a question to Slack via `ask_human_via_slack` MCP tool and receive a threaded reply back in Claude Code | MCP SDK `server.tool()` API pattern; `StdioServerTransport` confirmed working; thread polling via `conversations.replies` |
| SLCK-02 | Slack messages use Block Kit formatting with header, context, divider, and urgency color coding (high=red, normal=yellow, low=green) | Legacy attachments with `color` field + embedded `blocks` array is the correct approach; `KnownBlock` union type from `@slack/types` |
| SLCK-03 | Messages include contextual information (current file path, error text, code snippets) extracted from tool parameters | `rich_text_preformatted` block type for code display; structured tool params with Zod schema |
| SLCK-04 | Messages @mention the configured user (SLACK_USER_ID) for push notifications | `<@USERID>` syntax in `mrkdwn` text fields confirmed; SLACK_USER_ID env var |
| SLCK-05 | Thread polling uses exponential backoff (3s initial, 15s cap) and configurable timeout (default 10 minutes) | `conversations.replies` API with `oldest` + `limit` params; manual bot-filter on response; full jitter backoff pattern |
| SLCK-06 | Timeout posts a "timed out" notice in the Slack thread and returns an error to Claude | `chat.postMessage` with `thread_ts` for thread-targeted messages; MCP tool error return format |
</phase_requirements>

---

## Summary

Phase 1 builds the core bidirectional tool: `ask_human_via_slack`. The MCP server uses `@modelcontextprotocol/sdk` v1.x with `StdioServerTransport`. The Slack side uses `@slack/web-api` v7. The two main technical challenges are (1) the color+Block Kit message format and (2) the MCP tool timeout for long-blocking calls.

For color-coded messages, the correct approach is legacy Slack attachments with a `color` field and an embedded `blocks` array. Block Kit `SectionBlock` alone has no color bar; you must nest blocks inside an attachment to get both. This is officially supported but considered legacy — acceptable here since the color bar is a deliberate design requirement.

The most significant risk for Phase 1 is the MCP tool timeout. `ask_human_via_slack` blocks waiting for a human reply (up to 20 minutes with the auto-retry logic). The MCP TypeScript SDK defaults to a 60-second request timeout. Claude Code CLI supports `MCP_TOOL_TIMEOUT` env variable to extend this; users must set it or the tool will time out before a human can respond. This must be documented in setup instructions and ideally auto-configured by the install command.

**Primary recommendation:** Build in the order Slack client → Block Kit builder → poll manager → MCP server entry point. Test each module in isolation before wiring. The color-attachment pattern needs manual testing in a real Slack workspace because the Block Kit Builder UI does not support attachments.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.27.0` | MCP server framework | Official Anthropic SDK; `McpServer` + `StdioServerTransport` is the only production-ready path for Claude Code MCP tools |
| `@slack/web-api` | `^7.14.1` | Slack REST client | Official Slack SDK; v7 has strict TypeScript types for all API methods; WebClient handles retries and rate limiting |
| `zod` | `^3.25.0` | Input validation | Peer dep of MCP SDK; pin to v3 until SDK explicitly requires v4; validated args from MCP tool calls need Zod schemas |
| TypeScript | `^5.7.0` | Language | Required; `@slack/web-api` v7 tested against TypeScript 5.3+; MCP SDK ships own types |
| Node.js | `>=20.0.0` | Runtime | Current LTS; `@slack/web-api` v7 minimum is Node 18 but use 20 for modern built-ins |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsup` | `^8.x` | TypeScript bundler | Required for building the npm-publishable artifact; zero-config CJS+ESM dual output |
| `tsx` | `^4.x` | Run TypeScript directly | Local dev execution without build step; faster than `ts-node` |
| `vitest` | `^2.x` | Test framework | Native TypeScript + ESM; mock `@slack/web-api` with `vi.mock` |
| `@types/node` | `^20.x` | Node type defs | Dev dep; needed for `process.stdin`, `setTimeout`, etc. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@slack/web-api` polling | Socket Mode | Socket Mode requires persistent WebSocket + app-level token; overkill for human-response timescales |
| Legacy attachment color | Emoji-only color indication | Losing the visual sidebar; color bar is a stated requirement |
| Manual backoff loop | `exponential-backoff` npm package | Package adds a dep for 20 lines of code; hand-rolling is fine here with tests |

**Installation:**
```bash
# Runtime
npm install @modelcontextprotocol/sdk @slack/web-api zod

# Dev
npm install -D typescript tsup tsx vitest @types/node
```

---

## Architecture Patterns

### Recommended Project Structure

```
signal-flare/
├── src/
│   ├── server.ts              # MCP server entry point — McpServer + StdioServerTransport
│   ├── tools/
│   │   └── ask-human.ts       # ask_human_via_slack tool: zod schema + handler
│   ├── slack/
│   │   ├── client.ts          # WebClient wrapper — init, error handling, token validation
│   │   ├── messages.ts        # Block Kit + attachment builders (color-coded messages)
│   │   └── poller.ts          # Thread reply polling with exponential backoff
│   └── config.ts              # Env var validation via Zod (startup fail-fast)
├── dist/                      # Compiled output
├── package.json
└── tsconfig.json
```

### Pattern 1: MCP Server Entry Point

```typescript
// src/server.ts
// Source: MCP SDK docs/server.md + official TypeScript SDK README
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
// NEVER: console.log() — corrupts JSON-RPC stream; use console.error() only
```

### Pattern 2: Tool Registration with Zod Schema

The `server.tool()` API (also callable as `server.registerTool()`) accepts:
1. Tool name string
2. Config object with `title`, `description`, `inputSchema` (Zod object)
3. Async handler receiving validated args

```typescript
// src/tools/ask-human.ts
// Source: MCP SDK docs/server.md
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const AskHumanSchema = {
  question: z.string().describe("The question to ask the human"),
  context: z.string().optional().describe("Additional context (file path, error, code)"),
  options: z.array(z.string()).optional().describe("Numbered options for the human to choose from"),
  urgency: z.enum(["high", "normal", "low"]).optional().default("normal"),
  session_id: z.string().optional().describe("Session identifier for thread continuity"),
};

export function registerAskHumanTool(server: McpServer) {
  server.tool(
    "ask_human_via_slack",
    AskHumanSchema,
    async (args) => {
      // ... implementation
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    }
  );
}
```

**Note:** `server.tool()` and `server.registerTool()` are both valid in SDK v1.27. `registerTool()` takes a config object with explicit `inputSchema`; `tool()` takes the zod schema directly as the second argument (shorthand). Both are supported.

### Pattern 3: Color-Coded Messages with Block Kit

The color sidebar requires legacy attachments (not pure Block Kit). The correct pattern is to embed `blocks` inside an attachment:

```typescript
// src/slack/messages.ts
// Source: Slack docs — "Reference: Secondary message attachments"
// https://docs.slack.dev/tools/node-slack-sdk/reference/types/interfaces/MessageAttachment/

import type { Block, KnownBlock, MessageAttachment } from "@slack/types";

type UrgencyLevel = "high" | "normal" | "low";

const URGENCY_CONFIG: Record<UrgencyLevel, { color: string; emoji: string; label: string }> = {
  high:   { color: "#FF0000", emoji: ":rotating_light:", label: "URGENT" },
  normal: { color: "#FFA500", emoji: ":bell:",            label: "Attention needed" },
  low:    { color: "#36A64F", emoji: ":information_source:", label: "FYI" },
};

export function buildQuestionMessage(params: {
  question: string;
  context?: string;
  options?: string[];
  urgency: UrgencyLevel;
  userId: string;  // SLACK_USER_ID for @mention
}): { attachments: MessageAttachment[] } {
  const cfg = URGENCY_CONFIG[params.urgency];
  const blocks: KnownBlock[] = [];

  // Header with urgency emoji and @mention
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `${cfg.emoji} Claude needs your input` },
  });

  // @mention + question text
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<@${params.userId}> *${params.question}*`,
    },
  });

  // Context (file path, code snippet, etc.)
  if (params.context) {
    blocks.push({
      type: "rich_text",
      elements: [{
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: params.context }],
      }],
    } as KnownBlock);
  }

  // Numbered options
  if (params.options?.length) {
    const optionText = params.options
      .map((opt, i) => `*${i + 1}.* ${opt}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${optionText}\n\nReply with a number or type a full response.`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // Wrap in attachment for color sidebar
  return {
    attachments: [{
      color: cfg.color,
      blocks,
    }],
  };
}
```

**Critical:** The `color` field accepts hex codes (`"#FF0000"`) or named values (`"good"`, `"warning"`, `"danger"`). Use explicit hex codes for the three urgency levels to avoid ambiguity with Slack's named-color semantics.

### Pattern 4: Thread Polling with Exponential Backoff

```typescript
// src/slack/poller.ts
// Source: Slack docs conversations.replies, bot message filtering pattern

import { WebClient } from "@slack/web-api";

export interface PollResult {
  found: boolean;
  text?: string;
  user?: string;
  ts?: string;
  elapsedMs?: number;
}

export async function pollForReply(
  client: WebClient,
  channelId: string,
  threadTs: string,
  botUserId: string,        // Filter out bot's own messages
  timeoutMs: number,        // e.g. 600_000 (10 min)
  opts: {
    initialDelayMs?: number;  // default 3000
    maxDelayMs?: number;      // default 15000
    multiplier?: number;      // default 1.5
    minReplyWords?: number;   // default 2 (filter "ok", single emoji)
  } = {}
): Promise<PollResult> {
  const {
    initialDelayMs = 3000,
    maxDelayMs = 15000,
    multiplier = 1.5,
    minReplyWords = 2,
  } = opts;

  const startMs = Date.now();
  const deadline = startMs + timeoutMs;
  let delay = initialDelayMs;

  while (Date.now() < deadline) {
    await sleep(delay);

    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      oldest: threadTs,  // Skip messages at or before parent
      inclusive: false,  // Strictly after threadTs
      limit: 10,
    });

    const replies = result.messages?.slice(1) ?? [];  // Skip parent message

    for (const msg of replies) {
      // Filter: skip bot messages
      if (msg.bot_id || msg.subtype === "bot_message") continue;
      // Filter: skip messages with bot's user ID
      if (msg.user === botUserId) continue;
      // Filter: require substantive reply
      const words = (msg.text ?? "").trim().split(/\s+/).filter(Boolean);
      if (words.length < minReplyWords) continue;

      return {
        found: true,
        text: msg.text!,
        user: msg.user,
        ts: msg.ts,
        elapsedMs: Date.now() - startMs,
      };
    }

    // Exponential backoff with full jitter
    const jittered = Math.random() * delay;
    delay = Math.min(delay * multiplier + jittered * 0.1, maxDelayMs);
  }

  return { found: false, elapsedMs: Date.now() - startMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Rate limit note:** `conversations.replies` is rate-limited to 1 req/min for non-Marketplace apps starting March 3, 2026. With the 15-second cap and exponential backoff, we stay well under this if users create their own internal Slack app (exempt from new limits at 50+ req/min). Internal app setup is the documented requirement.

### Pattern 5: Env Var Validation with Zod

```typescript
// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_CHANNEL_ID: z.string().startsWith("C"),
  SLACK_USER_ID: z.string().optional(),
  SEND_DELAY_MS: z.coerce.number().int().min(0).default(0),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }
  return result.data;
}
```

### Pattern 6: Thread Reply Posting (Timeout and "Still Waiting" notices)

```typescript
// Post a notice to the thread (timeout, received, still-waiting)
await client.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,         // MUST be a string (not number)
  text: "⏱ No response received — timed out.",
  blocks: [{
    type: "section",
    text: { type: "mrkdwn", text: "⏱ *Timed out.* Claude will attempt to continue without an answer." },
  }],
});
```

**Note:** `thread_ts` must be passed as a string. Passing a float/number will succeed but will NOT create a thread reply — the message posts to the channel root instead.

### Anti-Patterns to Avoid

- **`console.log()` anywhere in the MCP server**: Corrupts the stdio JSON-RPC stream. Use `console.error()` for all logging.
- **Polling `conversations.history` instead of `conversations.replies`**: `history` returns all channel messages; you need thread replies. Use `replies` with the `ts` of the parent message.
- **Not passing `inclusive: false` (or using `oldest: threadTs`)**: Without this, the bot's original question appears in the replies array. Filter by timestamp AND by `bot_id`.
- **Embedding `blocks` as top-level (not inside attachment)**: Top-level `blocks` in `chat.postMessage` do not support color bars. Use `attachments[].blocks` for color + Block Kit.
- **Using `attachment.blocks` without the `color` field**: The block rendering works without `color`, but you lose the urgency color bar entirely.
- **Hardcoded polling interval**: Must use backoff. A fixed 3-second interval will hit rate limits on non-internal apps.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slack API HTTP client | Custom fetch wrapper | `@slack/web-api` WebClient | Handles auth, retries, rate limiting, TypeScript types for 130+ methods |
| MCP protocol framing | Custom stdin/stdout parser | `@modelcontextprotocol/sdk` StdioServerTransport | JSON-RPC 2.0 with content-length framing is non-trivial; SDK handles all edge cases |
| Zod schema parsing errors | Custom error messages | Zod's `.format()` on error | Produces structured error trees that are already human-readable |
| Token validation at boot | Runtime try/catch on first call | Zod schema on `process.env` at startup | Fail-fast with clear message beats discovering bad tokens mid-session |

**Key insight:** The Slack WebClient handles `Retry-After` headers and 429 backoff automatically for its own calls. But it does NOT manage the poll loop — that's application logic we own.

---

## Common Pitfalls

### Pitfall 1: MCP Tool Timeout (60 seconds default)

**What goes wrong:** Claude Code's MCP client has a default tool call timeout of 60 seconds. `ask_human_via_slack` blocks for up to 20 minutes. Without configuration, the tool times out before a human can respond.

**Why it happens:** The MCP TypeScript SDK `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000`. Claude Code CLI respects `MCP_TOOL_TIMEOUT` env variable to override this; Claude Desktop does NOT.

**How to avoid:**
- Users must set `MCP_TOOL_TIMEOUT` when running Claude Code CLI (e.g., `MCP_TOOL_TIMEOUT=1200000 claude` for 20 minutes)
- Document this prominently in setup instructions
- The setup wizard (Phase 3) should write this to the MCP server env config
- **Important caveat:** `MCP_TOOL_TIMEOUT` has reported inconsistencies (some users see it not working); treat it as a recommendation, not guaranteed solution

**Warning signs:** Tool call returns `-32001 Request Timeout` after exactly 60 seconds. User sees "No result received from client-side tool execution."

### Pitfall 2: Bot Message Self-Detection

**What goes wrong:** `conversations.replies` returns ALL messages in the thread including the bot's own question. Without filtering, the poll loop detects the question text as the "human reply" and returns immediately.

**Why it happens:** The `oldest: threadTs` parameter skips messages AT the timestamp but includes messages AFTER. If the bot posts any follow-up message (e.g., a "still waiting" bump), that also appears. Must filter by `bot_id` AND check `subtype`.

**How to avoid:** Filter in the poll loop:
```typescript
if (msg.bot_id || msg.subtype === "bot_message") continue;
```
Also exclude messages from the bot's own user ID if the bot posts as a user. Write a unit test that feeds a thread containing only bot messages and asserts `found: false`.

**Warning signs:** `ask_human_via_slack` returns immediately with the question text as the answer. Poll loop exits in under 1 second.

### Pitfall 3: Color Bar Requires Attachment, Not Top-Level Blocks

**What goes wrong:** Developer uses top-level `blocks` in `chat.postMessage` (correct for modern Block Kit) but the color bar never appears. Urgency color coding silently doesn't work.

**Why it happens:** Color bars are a feature of legacy attachments only. Block Kit has no color bar equivalent. The only way to get both color AND modern block layout is `attachments[{ color, blocks }]`.

**How to avoid:** Always use the attachment wrapper pattern. Write a visual integration test in a real Slack workspace — Block Kit Builder and API explorers don't show attachment color correctly.

**Warning signs:** Messages appear in Slack but without a colored left border regardless of urgency setting.

### Pitfall 4: Short Reply Filter Needs Care

**What goes wrong:** The requirement to filter "short replies" (single word, single emoji) needs a defensible threshold. Too aggressive: legitimate one-word answers ("yes", "no", "stop") are rejected. Too loose: single emoji reactions from Slack's thread preview are accepted.

**Why it happens:** Slack threads can receive emoji reactions that appear in `conversations.replies` as messages. The filter on "at least 2 words" from the user decisions is the right starting point but needs handling of:
- "yes" / "no" / "ok" (1 word, but semantically complete)
- Pure emoji like "✅" or "👍" (0 words, but meaningful)
- Unicode strings where word-splitting is ambiguous

**How to avoid:** Implement with word count as primary filter, BUT allow single-word replies that are common acknowledgments via an allowlist. Alternatively, require minimum character count (e.g., 2+ characters) rather than word count. Use unit tests with edge cases.

**Recommended approach (Claude's discretion):** Minimum character count of 2, excluding whitespace and common emoji. This is simpler and more predictable than word counting.

### Pitfall 5: `thread_ts` as String vs Number

**What goes wrong:** `ts` values from Slack API responses are strings (e.g., `"1709123456.789012"`). If accidentally coerced to a number, `thread_ts` posts to the channel root instead of the thread — silently.

**Why it happens:** JSON parsing, type coercion, or destructuring without type annotations. The API accepts a number but does NOT create a thread reply; it creates a new channel message.

**How to avoid:** Define `threadTs: string` in your TypeScript types. The Slack API types in `@slack/web-api` already type `ts` as `string`. Never pass `Number(ts)` or `parseFloat(ts)` as `thread_ts`.

### Pitfall 6: Zod v4 vs v3 Compatibility

**What goes wrong:** `@modelcontextprotocol/sdk` internally uses Zod v4 via `zod/v4` compatibility shim. If your code imports from the wrong Zod version, you get runtime type errors that look like schema validation failures.

**Why it happens:** Zod v4 has breaking changes in schema construction. The MCP SDK's shim maintains backwards compatibility for consumer code using v3 schemas, but only if the consumer pins to `^3.25.0`.

**How to avoid:** Pin `"zod": "^3.25.0"` in `package.json`. Never import from `zod/v4` directly. The tool schemas work with standard `z.object({ ... })` from v3.

---

## Code Examples

### Complete Tool Handler Skeleton

```typescript
// src/tools/ask-human.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebClient } from "@slack/web-api";
import { buildQuestionMessage } from "../slack/messages.js";
import { pollForReply } from "../slack/poller.js";
import { loadConfig } from "../config.js";

const AskHumanInputSchema = {
  question: z.string().min(1).describe("The question to ask the human"),
  context: z.string().optional().describe("File path, error message, or code snippet for context"),
  options: z.array(z.string()).optional().describe("If provided, human can reply with a number 1-N"),
  urgency: z.enum(["high", "normal", "low"]).optional().default("normal"),
  session_id: z.string().optional().describe("Session ID for thread continuity (future use)"),
};

export function registerAskHumanTool(server: McpServer, client: WebClient) {
  const config = loadConfig();

  server.tool(
    "ask_human_via_slack",
    AskHumanInputSchema,
    async (args) => {
      const urgency = args.urgency ?? "normal";
      const userId = config.SLACK_USER_ID ?? "";

      // 1. Optional send delay (configurable, default 0)
      if (config.SEND_DELAY_MS > 0) {
        await sleep(config.SEND_DELAY_MS);
      }

      // 2. Post question to Slack
      const messagePayload = buildQuestionMessage({
        question: args.question,
        context: args.context,
        options: args.options,
        urgency,
        userId,
      });

      const postResult = await client.chat.postMessage({
        channel: config.SLACK_CHANNEL_ID,
        text: args.question,   // Fallback for notifications
        ...messagePayload,
      });

      if (!postResult.ok || !postResult.ts) {
        return { content: [{ type: "text", text: "Error: Failed to post to Slack" }], isError: true };
      }

      const threadTs = postResult.ts;

      // 3. Poll for reply with auto-retry logic
      const firstAttempt = await pollForReply(
        client, config.SLACK_CHANNEL_ID, threadTs,
        config.BOT_USER_ID, 600_000   // 10 minute window
      );

      if (!firstAttempt.found) {
        // Post "still waiting" bump
        await client.chat.postMessage({
          channel: config.SLACK_CHANNEL_ID,
          thread_ts: threadTs,
          text: "⏳ Still waiting for your reply...",
        });

        // Second 10-minute window
        const secondAttempt = await pollForReply(
          client, config.SLACK_CHANNEL_ID, threadTs,
          config.BOT_USER_ID, 600_000
        );

        if (!secondAttempt.found) {
          await client.chat.postMessage({
            channel: config.SLACK_CHANNEL_ID,
            thread_ts: threadTs,
            text: "⏱ Timed out — no response received.",
          });
          return {
            content: [{ type: "text", text: "Timeout: No human response received after 20 minutes." }],
            isError: true,
          };
        }

        return formatReply(secondAttempt, args.options);
      }

      // 4. Post confirmation
      await client.chat.postMessage({
        channel: config.SLACK_CHANNEL_ID,
        thread_ts: threadTs,
        text: "✅ Response received.",
      });

      return formatReply(firstAttempt, args.options);
    }
  );
}

function formatReply(result: { text?: string; user?: string; elapsedMs?: number }, options?: string[]) {
  const raw = result.text ?? "";
  let selectedOption: number | null = null;

  if (options?.length) {
    const num = parseInt(raw.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      selectedOption = num - 1;  // 0-indexed
    }
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        reply: raw,
        replied_by: result.user ?? "unknown",
        response_time_ms: result.elapsedMs ?? 0,
        selected_option: selectedOption !== null ? options![selectedOption] : null,
        selected_option_index: selectedOption,
      }),
    }],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### User @mention Syntax

```typescript
// In mrkdwn text: <@SLACK_USER_ID> triggers push notification
// Source: https://api.slack.com/reference/surfaces/formatting
const mentionText = `<@${userId}> *${question}*`;

// In plain_text blocks, @mentions don't resolve — always use mrkdwn type
```

### MCP Server Config for Claude Code (users add this)

```json
// ~/.claude.json or .mcp.json (project scope)
{
  "mcpServers": {
    "signal-flare": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/signal-flare/dist/server.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token",
        "SLACK_CHANNEL_ID": "C0123456789",
        "SLACK_USER_ID": "U0123456789",
        "MCP_TOOL_TIMEOUT": "1200000"
      }
    }
  }
}
```

**Note on `MCP_TOOL_TIMEOUT`:** Claude Code CLI respects this for tool call timeouts. Claude Desktop ignores it. Setting to `1200000` (20 minutes) allows the full dual-window polling behavior.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@slack/rtm-api` (Real Time Messaging) | `@slack/web-api` polling or Socket Mode | 2022 (RTM deprecated) | RTM is gone; polling is correct for v1 |
| `ts-node` for TypeScript execution | `tsx` | 2023 | tsx is faster (no type checking), ESM-compatible |
| `jest` for TypeScript tests | `vitest` | 2023-2024 | vitest works natively with ESM; no transform config needed |
| `@modelcontextprotocol/sdk` low-level Server class | `McpServer` high-level class | SDK v1.x | `McpServer` handles protocol details; `Server` is still available for advanced use |
| Zod v3 only | Zod v3 + v4 compatibility | 2025 (Zod v4 release) | Pin to v3.25.0 — SDK shim allows v3 consumer code while SDK uses v4 internally |

**Deprecated/outdated:**
- `@slack/rtm-api`: Deprecated; do not use
- Slack Socket Mode for this use case: Overkill; polling is correct
- `express` or HTTP transports for Claude Code local MCP servers: Unnecessary complexity; stdio is the correct transport

---

## Open Questions

1. **`MCP_TOOL_TIMEOUT` reliability**
   - What we know: Claude Code CLI documents `MCP_TOOL_TIMEOUT` as a supported env var; GitHub issues confirm it's the intended mechanism
   - What's unclear: Community reports of it not working consistently in some environments; may depend on Claude Code version
   - Recommendation: Implement the polling logic correctly regardless; document `MCP_TOOL_TIMEOUT=1200000` as a requirement; test with simulated 2-minute responses before shipping

2. **Bot user ID availability**
   - What we know: We need the bot's own user ID to filter self-messages from poll results; this is not a config value users know off the top of their head
   - What's unclear: Best way to acquire it — `auth.test` API call at startup returns `user_id` for the bot token
   - Recommendation: Call `client.auth.test()` at server startup to cache the bot's user ID; store in config; use in poll filter

3. **`ts` field in `conversations.replies` after `oldest` filter**
   - What we know: Using `oldest: threadTs, inclusive: false` should return only messages after the parent
   - What's unclear: Whether the parent message is always excluded with `inclusive: false`, or if we still need to filter the first element of the messages array
   - Recommendation: Use both `oldest: threadTs, inclusive: false` AND filter `msg.ts > threadTs` in code; belt-and-suspenders approach

4. **`rich_text` block type assertion**
   - What we know: `@slack/types` includes `RichTextBlock` in `KnownBlock` union; TypeScript recognizes `rich_text` as a valid block type
   - What's unclear: Whether `as KnownBlock` cast is needed or if TypeScript infers it correctly with strict mode
   - Recommendation: Define the rich_text block explicitly as `RichTextBlock` imported from `@slack/types` to avoid any cast

---

## Sources

### Primary (HIGH confidence)
- [MCP TypeScript SDK — docs/server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — tool registration API, StdioServerTransport
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) — MCP server config format, scope options, `MCP_TIMEOUT` env var
- [Slack @slack/types MessageAttachment](https://docs.slack.dev/tools/node-slack-sdk/reference/types/interfaces/MessageAttachment/) — color field accepts hex codes or "good"/"warning"/"danger"; blocks array supported within attachments
- [Slack conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies/) — oldest/inclusive params, rate limits (1 req/min for non-Marketplace)
- [Slack KnownBlock type reference](https://docs.slack.dev/tools/node-slack-sdk/reference/types/type-aliases/KnownBlock/) — union of all block types including RichTextBlock
- [Slack rich_text block reference](https://docs.slack.dev/reference/block-kit/blocks/rich-text-block/) — rich_text_preformatted for code display

### Secondary (MEDIUM confidence)
- [GitHub Issue #22542 — MCP Tool Timeout in Claude Code](https://github.com/anthropics/claude-code/issues/22542) — `MCP_TOOL_TIMEOUT` documented; Claude Desktop ignores it; CLI respects it
- [GitHub Issue #5615 — Verified Working Timeout Config](https://github.com/anthropics/claude-code/issues/5615) — `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` verified; `MCP_TOOL_TIMEOUT` disputed
- [MCP SDK npm page](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.27.0 current stable
- [Slack Formatting Reference](https://api.slack.com/reference/surfaces/formatting) — `<@USERID>` syntax for @mentions in mrkdwn text
- [Slack Rate Limit Changes (May 2025)](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) — 1 req/min for non-Marketplace apps effective March 3, 2026

### Tertiary (LOW confidence — flag for validation)
- [MCPcat guide on -32001 timeout](https://mcpcat.io/guides/fixing-mcp-error-32001-request-timeout/) — suggests progress notifications; TypeScript SDK hard 60s limit reported but unverified against Claude Code CLI behavior
- Community reports on `MCP_TOOL_TIMEOUT` inconsistency — needs hands-on testing before Phase 1 verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — MCP SDK v1.27.0 and Slack web-api v7.14.1 verified against official npm/GitHub
- Architecture: HIGH — StdioServerTransport pattern verified against SDK docs; attachment+blocks pattern verified against Slack type reference
- Tool registration API: HIGH — `server.tool()` / `server.registerTool()` pattern verified against SDK docs
- Block Kit color pattern: HIGH — attachment.color + attachment.blocks confirmed via official MessageAttachment type reference
- Poll manager: HIGH — `conversations.replies` params verified against Slack docs; bot filter logic from official message structure
- MCP tool timeout: MEDIUM — `MCP_TOOL_TIMEOUT` documented in Claude Code but community reports inconsistency; needs hands-on testing
- Short reply detection: MEDIUM — design decision (word count vs. char count) deferred to Claude's discretion; both approaches are trivial to implement

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 for stable parts (MCP SDK, Slack API); 2026-03-01 for rate limit behavior (March 3, 2026 effective date for new Slack rate limits)
