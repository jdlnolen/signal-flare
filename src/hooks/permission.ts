// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { PermissionRequestInput } from "../types.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import { buildHookMessage } from "../slack/messages.js";

/**
 * Extracts a human-readable action description from the tool input.
 *
 * - Bash: "Run: <command>" (truncated to 300 chars)
 * - Write: "Write to: <file_path>"
 * - Edit: "Edit: <file_path>"
 * - Read: "Read: <file_path>"
 * - Default: "<toolName> — <JSON of toolInput>" (truncated to 200 chars)
 */
function extractActionDescription(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  if (toolName === "Bash") {
    const desc = "Run: " + ((toolInput.command as string) ?? "unknown command");
    return desc.length > 300 ? desc.substring(0, 300) + "..." : desc;
  }
  if (toolName === "Write") {
    return "Write to: " + ((toolInput.file_path as string) ?? "unknown file");
  }
  if (toolName === "Edit") {
    return "Edit: " + ((toolInput.file_path as string) ?? "unknown file");
  }
  if (toolName === "Read") {
    return "Read: " + ((toolInput.file_path as string) ?? "unknown file");
  }
  return toolName + " — " + JSON.stringify(toolInput).substring(0, 200);
}

/**
 * Spawns a detached background watcher process to monitor the transcript file
 * for a terminal response within the hook idle timeout window.
 *
 * The watcher posts a "resolved in terminal" thread reply if the user responds
 * in the terminal before the timeout expires.
 *
 * Best-effort: if spawn fails, logs to stderr but does not throw — the Slack
 * notification was already sent.
 */
export function spawnWatcher(
  transcriptPath: string,
  threadTs: string,
  channelId: string,
  config: Config
): void {
  try {
    const watcherPath = fileURLToPath(new URL("./watcher.js", import.meta.url));
    const child = spawn(
      process.execPath,
      [watcherPath, transcriptPath, threadTs, channelId],
      {
        detached: true,
        stdio: "ignore",
        env: process.env,
      }
    );
    child.unref();
  } catch (err) {
    console.error("[signal-flare hook] Failed to spawn watcher process:", err);
  }
}

/**
 * Handles the PermissionRequest hook event.
 *
 * - If the tool name includes "ask_human_via_slack": posts a QUESTION notification
 *   with the full question text and numbered options.
 * - Otherwise: posts a PERMISSION notification with tool name and action description.
 *
 * After posting, spawns a detached watcher to monitor the transcript for a
 * terminal response within the hook idle timeout window.
 *
 * Fire-and-forget: catches Slack API errors, logs to stderr, never throws.
 * Never blocks Claude Code.
 */
export async function handlePermissionRequest(
  input: PermissionRequestInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  // Detect AskUserQuestion via tool name — use .includes() to handle
  // MCP naming convention like "mcp__signal-flare__ask_human_via_slack"
  const isAskHuman = input.tool_name.includes("ask_human_via_slack");

  let payload: { attachments: import("@slack/types").MessageAttachment[] };

  if (isAskHuman) {
    const question =
      (input.tool_input.question as string) ?? "Question from Claude";
    const options = input.tool_input.options as string[] | undefined;

    let body: string | undefined;
    if (options && options.length > 0) {
      const numberedList = options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");
      body = numberedList + "\n\nReply with a number or type a full response.";
    }

    payload = buildHookMessage({
      label: "QUESTION",
      headline: question,
      body,
      userId: config.SLACK_USER_ID,
    });
  } else {
    const actionDescription = extractActionDescription(
      input.tool_name,
      input.tool_input as Record<string, unknown>
    );

    payload = buildHookMessage({
      label: "PERMISSION",
      headline: "Claude wants to use: " + input.tool_name,
      body: actionDescription,
      userId: config.SLACK_USER_ID,
    });
  }

  try {
    const postResult = await slackClient.web.chat.postMessage({
      channel: slackClient.channelId,
      text: "Permission needed: " + input.tool_name,
      ...payload,
    });

    // Spawn watcher to monitor for terminal response (best-effort)
    if (postResult.ok && postResult.ts) {
      spawnWatcher(input.transcript_path, postResult.ts, slackClient.channelId, config);
    }
  } catch (err) {
    console.error("[signal-flare hook] Failed to post PERMISSION/QUESTION notification:", err);
  }
}
