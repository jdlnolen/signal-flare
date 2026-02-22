// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import type { WebClient } from "@slack/web-api";
import type { PollResult } from "../types.js";

/** Allowlist of single-word replies that are considered substantive. */
const ACKNOWLEDGMENT_ALLOWLIST = new Set([
  "yes",
  "no",
  "stop",
  "cancel",
  "approve",
  "approved",
  "reject",
  "rejected",
  "done",
  "skip",
  "continue",
  "proceed",
  "correct",
  "incorrect",
  "wrong",
  "right",
]);

/**
 * Returns true if the reply text is substantive enough to return to the caller.
 *
 * Rules (in order):
 * 1. Must have at least 2 non-whitespace characters.
 * 2. If it matches the allowlist (common single-word acknowledgments), accept it.
 * 3. If it is purely emoji-only, reject unless it has at least 2 non-emoji characters.
 */
function isSubstantiveReply(text: string): boolean {
  const stripped = text.trim();

  // Must have at least 2 non-whitespace characters
  const nonWhitespace = stripped.replace(/\s/g, "");
  if (nonWhitespace.length < 2) {
    return false;
  }

  // Allow common single-word acknowledgments regardless of other rules
  if (ACKNOWLEDGMENT_ALLOWLIST.has(stripped.toLowerCase())) {
    return true;
  }

  // Reject pure emoji-only replies unless they contain at least 2 non-emoji characters
  const emojiOnlyRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  if (emojiOnlyRegex.test(stripped)) {
    // Strip all emoji and whitespace, check remaining characters
    const nonEmojiText = stripped.replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu,
      ""
    );
    return nonEmojiText.length >= 2;
  }

  return true;
}

/**
 * Utility sleep function — pauses execution for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PollOptions {
  /** Initial delay in ms before first poll. Default: 3000 */
  initialDelayMs?: number;
  /** Maximum delay in ms (exponential backoff cap). Default: 15000 */
  maxDelayMs?: number;
  /** Exponential backoff multiplier. Default: 1.5 */
  multiplier?: number;
}

/**
 * Polls a Slack thread for a human reply using exponential backoff with full jitter.
 *
 * Filters out:
 * - The original question message (ts === threadTs)
 * - Bot messages (bot_id, subtype "bot_message", or user === botUserId)
 * - Non-substantive replies (too short, pure emoji, not in acknowledgment allowlist)
 *
 * @param client     - Slack WebClient instance
 * @param channelId  - Channel to poll
 * @param threadTs   - Timestamp of the root message (thread parent)
 * @param botUserId  - The bot's own user ID (to filter self-messages)
 * @param timeoutMs  - Maximum time to wait for a reply in milliseconds
 * @param opts       - Optional tuning parameters
 * @returns PollResult with found=true and reply details, or found=false on timeout
 */
export async function pollForReply(
  client: WebClient,
  channelId: string,
  threadTs: string,
  botUserId: string,
  timeoutMs: number,
  opts?: PollOptions
): Promise<PollResult> {
  const initialDelayMs = opts?.initialDelayMs ?? 3000;
  const maxDelayMs = opts?.maxDelayMs ?? 15000;
  const multiplier = opts?.multiplier ?? 1.5;

  const start = Date.now();
  const deadline = start + timeoutMs;

  let baseDelay = initialDelayMs;

  while (Date.now() < deadline) {
    // Full jitter: actual delay is random within [0, baseDelay]
    const jitteredDelay = Math.random() * baseDelay;
    await sleep(jitteredDelay);

    // Check if deadline has passed after sleeping
    if (Date.now() >= deadline) {
      break;
    }

    try {
      const response = await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        oldest: threadTs,
        inclusive: false,
        limit: 10,
      });

      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          // Belt-and-suspenders: skip the root message itself
          if (msg.ts === threadTs) {
            continue;
          }

          // Filter out bot messages:
          // - bot_id present means posted by a bot (covers most cases)
          // - type === "bot_message" covers legacy bot messages
          // - user === botUserId is belt-and-suspenders for our own bot
          if (msg.bot_id) {
            continue;
          }
          if (msg.type === "bot_message") {
            continue;
          }
          if (msg.user === botUserId) {
            continue;
          }

          // Must have text
          const text = msg.text;
          if (!text) {
            continue;
          }

          // Apply substantive reply filter
          if (!isSubstantiveReply(text)) {
            console.error(
              `[signal-flare] Skipping non-substantive reply: "${text.substring(0, 50)}"`
            );
            continue;
          }

          // Valid human reply found
          const elapsedMs = Date.now() - start;
          return {
            found: true,
            text,
            user: msg.user,
            ts: msg.ts,
            elapsedMs,
          };
        }
      }
    } catch (err) {
      console.error("[signal-flare] Error polling conversations.replies:", err);
    }

    // Grow the base delay for next iteration (capped at maxDelayMs)
    baseDelay = Math.min(baseDelay * multiplier, maxDelayMs);
  }

  // Deadline reached with no valid reply
  const elapsedMs = Date.now() - start;
  return { found: false, elapsedMs };
}
