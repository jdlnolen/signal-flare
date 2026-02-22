// NOTE: console.log() is permitted here — this is a CLI command, not an MCP server

import { loadConfig } from "../config.js";
import { createSlackClientDirect } from "../slack/client.js";

/**
 * Sends a test notification to the configured Slack channel to verify setup.
 */
export async function runTest(): Promise<void> {
  console.log("Sending test notification to Slack...\n");

  let config;
  try {
    config = loadConfig();
  } catch {
    // loadConfig() already prints detailed error and exits — but if it throws, rethrow
    throw new Error("Failed to load configuration");
  }

  const slackClient = createSlackClientDirect(config);

  try {
    await slackClient.web.chat.postMessage({
      channel: slackClient.channelId,
      text: "Signal Flare test notification — your setup is working!",
      attachments: [
        {
          color: "#36a64f",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Signal Flare test notification* — your setup is working! :tada:\n\nSignal Flare will notify you here when Claude Code needs your input.",
              },
            },
          ],
        },
      ],
    });

    console.log("\u2713 Test notification sent to Slack! Check your channel.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to send test notification: ${message}`);
    console.error("\nTroubleshooting tips:");
    console.error("  - Check that your SLACK_BOT_TOKEN is valid (run signal-flare setup)");
    console.error("  - Check that your SLACK_CHANNEL_ID is correct and the bot is in the channel");
    console.error("  - Ensure the bot has the chat:write permission scope");
    process.exit(1);
  }
}
