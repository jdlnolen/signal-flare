// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import type { StopHookInput } from "../types.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import { buildHookMessage } from "../slack/messages.js";

/**
 * Extracts a one-line summary from the last assistant message.
 *
 * - Returns "Task completed (no summary available)" for empty/whitespace messages.
 * - Takes the first sentence (split on `.`, `!`, `?` followed by space or end-of-string).
 * - Truncates to 200 chars + "..." if the first sentence is too long.
 * - If no sentence delimiter is found, takes first 200 chars + "...".
 */
export function extractSummary(lastMessage: string): string {
  if (!lastMessage || !lastMessage.trim()) {
    return "Task completed (no summary available)";
  }

  // Find first sentence boundary: ., !, ? followed by space or end of string
  const sentenceMatch = lastMessage.match(/^(.*?[.!?])(?:\s|$)/s);
  let summary: string;

  if (sentenceMatch) {
    summary = sentenceMatch[1].trim();
  } else {
    // No sentence delimiter found — take first 200 chars
    summary = lastMessage.trim();
    if (summary.length > 200) {
      return summary.substring(0, 200) + "...";
    }
    return summary;
  }

  if (summary.length > 200) {
    return summary.substring(0, 200) + "...";
  }

  return summary;
}

/**
 * Handles the Stop hook event — posts a COMPLETED notification to Slack with
 * a one-line summary of what Claude accomplished.
 *
 * Fire-and-forget: catches Slack API errors, logs to stderr, never throws.
 * Never blocks Claude Code.
 */
export async function handleStop(
  input: StopHookInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  // Belt-and-suspenders: prevent infinite loop if stop_hook_active is true
  if (input.stop_hook_active) {
    console.error("[signal-flare hook] stop_hook_active=true — skipping to prevent infinite loop");
    return;
  }

  const summary = extractSummary(input.last_assistant_message);
  const payload = buildHookMessage({
    label: "COMPLETED",
    headline: summary,
    userId: config.SLACK_USER_ID,
  });

  try {
    await slackClient.web.chat.postMessage({
      channel: slackClient.channelId,
      text: summary,
      ...payload,
    });
  } catch (err) {
    console.error("[signal-flare hook] Failed to post COMPLETED notification:", err);
  }
}
