// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { z } from "zod";

const ConfigSchema = z.object({
  SLACK_BOT_TOKEN: z
    .string()
    .startsWith("xoxb-", { message: "SLACK_BOT_TOKEN must start with 'xoxb-'" }),
  SLACK_CHANNEL_ID: z
    .string()
    .startsWith("C", { message: "SLACK_CHANNEL_ID must start with 'C'" }),
  SLACK_USER_ID: z.string().optional(),
  SEND_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0, { message: "SEND_DELAY_MS must be >= 0" })
    .default(0),
  POLL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0, { message: "POLL_TIMEOUT_MS must be >= 0" })
    .default(600000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Loads and validates configuration from environment variables.
 * Logs a formatted error to stderr and exits with code 1 if validation fails.
 */
export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error("[signal-flare] Configuration error — missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      const field = issue.path.join(".");
      console.error(`  ${field}: ${issue.message}`);
    }
    console.error("\nRequired environment variables:");
    console.error("  SLACK_BOT_TOKEN   — Slack bot token (starts with xoxb-)");
    console.error("  SLACK_CHANNEL_ID  — Slack channel ID (starts with C)");
    console.error("\nOptional environment variables:");
    console.error("  SLACK_USER_ID     — Slack user ID to @mention in messages");
    console.error("  SEND_DELAY_MS     — Delay before sending (default: 0)");
    console.error("  POLL_TIMEOUT_MS   — Poll timeout in ms (default: 600000)");
    process.exit(1);
  }

  return result.data;
}
