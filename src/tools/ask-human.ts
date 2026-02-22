// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import type { ToolResponse } from "../types.js";
import {
  buildQuestionMessage,
  buildStillWaitingMessage,
  buildTimeoutMessage,
  buildResponseReceivedMessage,
} from "../slack/messages.js";
import { pollForReply, sleep } from "../slack/poller.js";

/**
 * Input schema for the ask_human_via_slack MCP tool.
 * Defined as a plain Zod raw shape (not z.object()) — required by McpServer.registerTool().
 */
const AskHumanInputSchema = {
  question: z.string().min(1).describe("The question to ask the human"),
  context: z.string().optional().describe("File path, error message, or code snippet for context"),
  options: z.array(z.string()).optional().describe("Numbered options for the human to choose from"),
  urgency: z.enum(["high", "normal", "low"]).optional().default("normal"),
  session_id: z.string().optional().describe("Session identifier for thread continuity"),
};

/**
 * Parses a numbered option selection from the reply text.
 * If the user replied with a number 1-N (possibly with whitespace), returns the
 * corresponding 0-based index and option text. Otherwise returns nulls.
 */
function formatReply(
  replyText: string,
  options?: string[]
): Pick<ToolResponse, "selected_option" | "selected_option_index"> {
  if (!options || options.length === 0) {
    return { selected_option: null, selected_option_index: null };
  }

  const trimmed = replyText.trim();
  const numericMatch = /^(\d+)$/.exec(trimmed);
  if (numericMatch) {
    const selected = parseInt(numericMatch[1], 10);
    const idx = selected - 1; // Convert 1-based to 0-based
    if (idx >= 0 && idx < options.length) {
      return { selected_option: options[idx], selected_option_index: idx };
    }
  }

  return { selected_option: null, selected_option_index: null };
}

/**
 * Registers the ask_human_via_slack tool on the MCP server.
 *
 * The tool:
 * 1. Posts a Block Kit question to the configured Slack channel
 * 2. Polls the thread for a human reply (with exponential backoff)
 * 3. If first timeout: posts "still waiting" bump and retries for another timeout window
 * 4. If final timeout: posts "timed out" notice and returns an error to Claude
 * 5. On success: posts "response received" notice and returns structured data
 */
export function registerAskHumanTool(
  server: McpServer,
  slackClient: SlackClient,
  config: Config
): void {
  server.registerTool(
    "ask_human_via_slack",
    {
      title: "Ask Human via Slack",
      description:
        "Send a question to a human via Slack and wait for their reply. Use this whenever you need human input, approval, or a decision and the human may not be watching the terminal.",
      inputSchema: AskHumanInputSchema,
    },
    async (args) => {
      const { question, context, options, urgency } = args;

      // Optional send delay (for testing or rate limiting)
      if (config.SEND_DELAY_MS > 0) {
        await sleep(config.SEND_DELAY_MS);
      }

      // Build and post the question message to Slack
      const messagePayload = buildQuestionMessage(
        { question, context, options, urgency: urgency ?? "normal" },
        config.SLACK_USER_ID
      );

      const postStart = Date.now();
      let postResult;
      try {
        postResult = await slackClient.web.chat.postMessage({
          channel: slackClient.channelId,
          text: question,
          ...messagePayload,
        });
      } catch (err) {
        console.error("[signal-flare] Failed to post question to Slack:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Failed to post question to Slack" }),
            },
          ],
          isError: true,
        };
      }

      if (!postResult.ok || !postResult.ts) {
        console.error(
          "[signal-flare] chat.postMessage returned ok=false or missing ts:",
          postResult.error
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Failed to post question to Slack" }),
            },
          ],
          isError: true,
        };
      }

      const threadTs = postResult.ts;

      // First polling window
      const firstPoll = await pollForReply(
        slackClient.web,
        slackClient.channelId,
        threadTs,
        slackClient.botUserId,
        config.POLL_TIMEOUT_MS
      );

      if (!firstPoll.found) {
        // Post "still waiting" bump and start second polling window
        try {
          await slackClient.web.chat.postMessage({
            channel: slackClient.channelId,
            thread_ts: threadTs,
            ...buildStillWaitingMessage(),
          });
        } catch (err) {
          console.error("[signal-flare] Failed to post still-waiting message:", err);
        }

        const secondPoll = await pollForReply(
          slackClient.web,
          slackClient.channelId,
          threadTs,
          slackClient.botUserId,
          config.POLL_TIMEOUT_MS
        );

        if (!secondPoll.found) {
          // Final timeout — post notice and return error
          try {
            await slackClient.web.chat.postMessage({
              channel: slackClient.channelId,
              thread_ts: threadTs,
              ...buildTimeoutMessage(),
            });
          } catch (err) {
            console.error("[signal-flare] Failed to post timeout message:", err);
          }

          const timeoutMinutes = (config.POLL_TIMEOUT_MS * 2) / 60000;
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Timeout: No human response received",
                  timeout_minutes: timeoutMinutes,
                }),
              },
            ],
            isError: true,
          };
        }

        // Reply came in during second poll window
        return buildSuccessResponse(secondPoll, options, postStart, slackClient, threadTs);
      }

      // Reply came in during first poll window
      return buildSuccessResponse(firstPoll, options, postStart, slackClient, threadTs);
    }
  );
}

/**
 * Builds the success response for a valid human reply.
 * Posts a "response received" notice to the thread and returns structured data.
 */
async function buildSuccessResponse(
  pollResult: { found: boolean; text?: string; user?: string; ts?: string; elapsedMs?: number },
  options: string[] | undefined,
  postStart: number,
  slackClient: SlackClient,
  threadTs: string
) {
  const replyText = pollResult.text ?? "";
  const repliedBy = pollResult.user ?? "unknown";
  const responseTimeMs = Date.now() - postStart;

  // Post response-received notice to thread
  try {
    await slackClient.web.chat.postMessage({
      channel: slackClient.channelId,
      thread_ts: threadTs,
      ...buildResponseReceivedMessage(),
    });
  } catch (err) {
    console.error("[signal-flare] Failed to post response-received message:", err);
  }

  const { selected_option, selected_option_index } = formatReply(replyText, options);

  const response: ToolResponse = {
    reply: replyText,
    replied_by: repliedBy,
    response_time_ms: responseTimeMs,
    selected_option,
    selected_option_index,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  };
}
