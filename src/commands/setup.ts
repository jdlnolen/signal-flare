// NOTE: console.log() is permitted here — this is a CLI command, not an MCP server

import path from "node:path";
import { homedir } from "node:os";
import {
  ensureTTY,
  promptForToken,
  promptForChannelId,
  promptForUserId,
  promptForScope,
  promptForEnvPath,
} from "../wizard/prompts.js";
import { validateSlackCredentials } from "../wizard/validator.js";
import {
  resolvePackagePaths,
  writeEnvFile,
  writeConfigJson,
  writeHooksConfig,
  writeMcpConfig,
} from "../wizard/config-writer.js";

/**
 * Runs the interactive Signal Flare setup wizard.
 * Guides the user through providing Slack credentials, validates them via the
 * Slack API, and writes all required config files for Claude Code integration.
 */
export async function runSetup(version: string): Promise<void> {
  ensureTTY();

  // Welcome banner
  console.log("\n=====================================");
  console.log(`  Signal Flare Setup  v${version}`);
  console.log("=====================================");
  console.log("This wizard will configure Signal Flare to send Slack notifications");
  console.log("when Claude Code needs your input, and bring your response back.\n");

  // Detect existing env vars for pre-filling
  const existingToken = process.env.SLACK_BOT_TOKEN;
  const existingChannelId = process.env.SLACK_CHANNEL_ID;
  const existingUserId = process.env.SLACK_USER_ID;

  // Step 1: Scope (global vs project)
  const scope = await promptForScope();

  // Step 2: Slack credentials
  const token = await promptForToken(existingToken);
  const channelId = await promptForChannelId(existingChannelId);
  const userId = await promptForUserId(existingUserId);

  // Step 3: Validate credentials
  console.log("\nValidating Slack credentials...");
  const validation = await validateSlackCredentials(token, channelId);

  if (!validation.valid) {
    console.error(`\nValidation failed: ${validation.error}`);
    console.error("Please check your token and channel ID, then run signal-flare setup again.");
    process.exit(1);
  }

  console.log(
    `\u2713 Connected as @${validation.botName ?? "unknown"} to #${validation.channelName ?? channelId}`
  );

  // Step 4: Env file path
  const defaultEnvPath = path.join(homedir(), ".config", "signal-flare", ".env");
  const envPath = await promptForEnvPath(defaultEnvPath);

  // Resolve absolute paths to compiled dist files
  const { serverJs, hookHandlerJs } = resolvePackagePaths();

  // Step 5: Write all config files
  console.log("\nWriting configuration...");

  writeEnvFile(envPath, {
    token,
    channelId,
    userId: userId || undefined,
  });

  writeConfigJson(envPath);
  writeHooksConfig(scope, hookHandlerJs, envPath);
  writeMcpConfig(scope, serverJs, envPath);

  // Step 6: Success summary
  const settingsPath =
    scope === "global"
      ? path.join(homedir(), ".claude", "settings.json")
      : path.join(process.cwd(), ".claude", "settings.json");

  const mcpPath =
    scope === "global"
      ? path.join(homedir(), ".claude.json")
      : path.join(process.cwd(), ".mcp.json");

  console.log("\n=====================================");
  console.log("  Setup Complete!");
  console.log("=====================================");
  console.log(`\u2713 .env written to ${envPath}`);
  console.log(`\u2713 Hooks configured in ${settingsPath}`);
  console.log(`\u2713 MCP server configured in ${mcpPath}`);
  console.log("\nRestart Claude Code to activate Signal Flare.");
  console.log("Run `signal-flare test` to verify your setup.\n");
}
