// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { z } from "zod";
import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const ConfigSchema = z.object({
  SLACK_BOT_TOKEN: z
    .string()
    .startsWith("xoxb-", { message: "SLACK_BOT_TOKEN must start with 'xoxb-'" }),
  SLACK_CHANNEL_ID: z.string().startsWith("C", { message: "SLACK_CHANNEL_ID must start with 'C'" }),
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
  HOOK_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(90000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Resolves the path to the .env file to load.
 *
 * Priority:
 * 1. SIGNAL_FLARE_ENV_FILE env var (set via MCP server env block in ~/.claude.json)
 * 2. envFile field from ~/.config/signal-flare/config.json (fallback for hook handlers)
 * 3. undefined (fall through to existing env vars)
 */
function resolveEnvFilePath(): string | undefined {
  const envFileVar = process.env.SIGNAL_FLARE_ENV_FILE;
  if (envFileVar && envFileVar.trim() !== "") {
    return envFileVar;
  }

  // Fallback: read from convention config file (used by hook handlers)
  const conventionConfigPath = path.join(homedir(), ".config", "signal-flare", "config.json");
  try {
    if (existsSync(conventionConfigPath)) {
      const raw = readFileSync(conventionConfigPath, "utf8");
      const cfg = JSON.parse(raw) as { envFile?: string };
      if (cfg.envFile) {
        return cfg.envFile;
      }
    }
  } catch {
    // Silently ignore errors — env vars may be set directly
  }

  return undefined;
}

/**
 * Loads and validates configuration from environment variables.
 * If SIGNAL_FLARE_ENV_FILE is set or ~/.config/signal-flare/config.json contains
 * an envFile path, loads dotenv from that file first.
 * Logs a formatted error to stderr and exits with code 1 if validation fails.
 */
export function loadConfig(): Config {
  // Load dotenv from configured path before Zod parsing
  const envFilePath = resolveEnvFilePath();
  if (envFilePath !== undefined) {
    if (existsSync(envFilePath)) {
      dotenv.config({ path: envFilePath, quiet: true });
    } else {
      console.error(`[signal-flare] Warning: .env file not found at ${envFilePath}`);
    }
  }

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
    console.error("  SEND_DELAY_MS          — Delay before sending (default: 0)");
    console.error("  POLL_TIMEOUT_MS        — Poll timeout in ms (default: 600000)");
    console.error("  HOOK_IDLE_TIMEOUT_MS   — Hook idle timeout in ms (default: 90000)");
    console.error("\nRun `signal-flare setup` to configure, or set the env vars manually.");
    process.exit(1);
  }

  return result.data;
}
