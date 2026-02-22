// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import type { HookInput } from "../types.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import { handleStop } from "./stop.js";
import { handlePostToolUseFailure } from "./post-tool-failure.js";
import { handlePermissionRequest } from "./permission.js";

/**
 * Routes a validated hook input to the correct handler based on hook_event_name.
 */
export async function routeHookEvent(
  input: HookInput,
  slackClient: SlackClient,
  config: Config
): Promise<void> {
  switch (input.hook_event_name) {
    case "Stop":
      await handleStop(input, slackClient, config);
      break;
    case "PostToolUseFailure":
      await handlePostToolUseFailure(input, slackClient, config);
      break;
    case "PermissionRequest":
      await handlePermissionRequest(input, slackClient, config);
      break;
    default: {
      // Defensive: TypeScript's discriminated union should prevent this at compile time,
      // but log and return gracefully if an unknown event type is received at runtime.
      const unknownEvent = (input as { hook_event_name: string }).hook_event_name;
      console.error(`[signal-flare hook] Unknown hook event type: "${unknownEvent}" — ignoring`);
      break;
    }
  }
}
