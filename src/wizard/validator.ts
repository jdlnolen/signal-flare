// NOTE: console.log() is permitted here — this is a CLI utility, not an MCP server

import { WebClient } from "@slack/web-api";

export interface ValidationResult {
  valid: boolean;
  botName?: string;
  channelName?: string;
  error?: string;
}

/**
 * Validates Slack credentials by calling auth.test() and conversations.info().
 * Returns the bot name and channel name on success, or an error message on failure.
 *
 * @param token - Slack bot token (xoxb-...)
 * @param channelId - Slack channel ID (starts with C)
 */
export async function validateSlackCredentials(
  token: string,
  channelId: string
): Promise<ValidationResult> {
  try {
    const web = new WebClient(token);

    // Validate token via auth.test()
    let authResult;
    try {
      authResult = await web.auth.test();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Invalid token: ${message}` };
    }

    if (!authResult.ok) {
      return { valid: false, error: `Invalid token: auth.test() returned ok=false` };
    }

    // Validate channel via conversations.info()
    let channelResult;
    try {
      channelResult = await web.conversations.info({ channel: channelId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("channel_not_found")) {
        return {
          valid: false,
          error: `Invalid channel: channel not found or bot is not a member of the channel. Make sure the bot is invited to the channel.`,
        };
      }
      if (message.includes("missing_scope")) {
        return {
          valid: false,
          error: `Missing Slack scope: the bot needs "channels:read" (public channels) or "groups:read" (private channels). Add the missing scope in your Slack app's OAuth & Permissions page, then reinstall the app to your workspace.`,
        };
      }
      return { valid: false, error: `Invalid channel: ${message}` };
    }

    if (!channelResult.ok) {
      return {
        valid: false,
        error: `Invalid channel: conversations.info() returned ok=false`,
      };
    }

    return {
      valid: true,
      botName: authResult.user ?? undefined,
      channelName: channelResult.channel?.name ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Network error: ${message}` };
  }
}
