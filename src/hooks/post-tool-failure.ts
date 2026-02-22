// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import type { PostToolUseFailureInput } from "../types.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import { buildHookMessage } from "../slack/messages.js";

/**
 * Extracts a concise context string from tool input based on the tool type.
 *
 * - Bash: returns the command (truncated to 500 chars)
 * - Write/Edit/Read: returns the file path
 * - MCP tools (name contains mcp__): returns first 3 keys as JSON (truncated to 300 chars)
 * - Default: returns JSON.stringify of tool input (truncated to 300 chars)
 */
export function extractToolContext(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  if (toolName === "Bash") {
    const command = (toolInput.command as string) ?? "";
    return command.length > 500 ? command.substring(0, 500) + "..." : command;
  }

  if (toolName === "Write" || toolName === "Edit" || toolName === "Read") {
    return (toolInput.file_path as string) ?? "";
  }

  if (toolName.includes("mcp__")) {
    const firstThreeKeys = Object.entries(toolInput).slice(0, 3);
    const partial = Object.fromEntries(firstThreeKeys);
    const json = JSON.stringify(partial);
    return json.length > 300 ? json.substring(0, 300) + "..." : json;
  }

  const json = JSON.stringify(toolInput);
  return json.length > 300 ? json.substring(0, 300) + "..." : json;
}

/**
 * Handles the PostToolUseFailure hook event — posts an ERROR notification to Slack
 * with the tool name, error text, and relevant context (command or file path).
 *
 * Fire-and-forget: catches Slack API errors, logs to stderr, never throws.
 * Never blocks Claude Code.
 */
export async function handlePostToolUseFailure(
  input: PostToolUseFailureInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  const toolContext = extractToolContext(input.tool_name, input.tool_input as Record<string, unknown>);

  // Truncate error text to 1000 chars
  const errorText =
    input.error.length > 1000
      ? input.error.substring(0, 1000) + "..."
      : input.error;

  const payload = buildHookMessage({
    label: "ERROR",
    headline: `${input.tool_name} failed`,
    body: errorText,
    context: toolContext || undefined,
    userId: config.SLACK_USER_ID,
  });

  try {
    await slackClient.web.chat.postMessage({
      channel: slackClient.channelId,
      text: `Tool error: ${input.tool_name}`,
      ...payload,
    });
  } catch (err) {
    console.error("[signal-flare hook] Failed to post ERROR notification:", err);
  }
}
