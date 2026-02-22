// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { HookInputSchema } from "./types.js";
import { loadConfig } from "./config.js";
import { createSlackClientDirect } from "./slack/client.js";
import { routeHookEvent } from "./hooks/router.js";

/**
 * Reads all stdin data and resolves when the stream ends.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      resolve(raw);
    });
    process.stdin.on("error", reject);
  });
}

(async () => {
  try {
    const raw = await readStdin();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("[signal-flare hook] Failed to parse stdin JSON:", err);
      process.exit(0);
    }

    const result = HookInputSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        "[signal-flare hook] Invalid hook input — schema validation failed:",
        result.error.flatten()
      );
      process.exit(0);
    }

    const config = loadConfig();
    const slackClient = createSlackClientDirect(config);

    await routeHookEvent(result.data, slackClient, config);

    process.exit(0);
  } catch (err) {
    console.error("[signal-flare hook] Fatal error:", err);
    process.exit(1);
  }
})();
