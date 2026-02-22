// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { WebClient } from "@slack/web-api";
import type { Config } from "../config.js";

/**
 * Wraps the Slack WebClient with resolved bot identity and channel config.
 * Use createSlackClient() to construct — it validates the token via auth.test().
 */
export interface SlackClient {
  /** The initialized Slack WebClient instance. */
  web: WebClient;
  /** The bot's own Slack user ID, resolved via auth.test() at startup. */
  botUserId: string;
  /** The Slack channel ID to post messages to. */
  channelId: string;
}

/**
 * Creates a SlackClient by initializing the WebClient and resolving the bot
 * user ID via auth.test(). This serves dual purpose: validates the token AND
 * retrieves the bot user ID needed to filter bot messages during polling.
 *
 * Throws if auth.test() fails (invalid token, network error, etc.).
 */
export async function createSlackClient(config: Config): Promise<SlackClient> {
  const web = new WebClient(config.SLACK_BOT_TOKEN);

  let botUserId: string;
  try {
    const authResult = await web.auth.test();
    if (!authResult.ok || !authResult.user_id) {
      throw new Error(`auth.test() returned ok=${authResult.ok}, user_id=${authResult.user_id}`);
    }
    botUserId = authResult.user_id;
  } catch (err) {
    console.error("[signal-flare] Failed to authenticate with Slack:", err);
    throw err;
  }

  return {
    web,
    botUserId,
    channelId: config.SLACK_CHANNEL_ID,
  };
}

/**
 * Creates a SlackClient without calling auth.test().
 *
 * Intended for use in Claude Code hook handlers which are short-lived processes
 * invoked on every hook event. Skipping auth.test() avoids the 100-500ms
 * round-trip on every invocation. Token validation is the caller's responsibility.
 *
 * The botUserId is set to "" because hook handlers never poll for replies,
 * so bot-message filtering is not needed.
 */
export function createSlackClientDirect(config: Config): SlackClient {
  const web = new WebClient(config.SLACK_BOT_TOKEN);
  return {
    web,
    botUserId: "",
    channelId: config.SLACK_CHANNEL_ID,
  };
}
