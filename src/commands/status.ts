// NOTE: console.log() is permitted here — this is a CLI command, not an MCP server

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Displays the current Signal Flare configuration status.
 * Shows environment variables (with masked tokens), config file paths, and
 * Claude Code settings state.
 */
export async function runStatus(): Promise<void> {
  console.log("\n=====================================");
  console.log("  Signal Flare Status");
  console.log("=====================================\n");

  let anyConfigured = false;

  // --- Environment Variables ---
  console.log("Environment Variables:");

  const token = process.env.SLACK_BOT_TOKEN;
  if (token) {
    console.log(`  SLACK_BOT_TOKEN       : set (${token.slice(0, 8)}...)`);
    anyConfigured = true;
  } else {
    console.log("  SLACK_BOT_TOKEN       : not set");
  }

  const channelId = process.env.SLACK_CHANNEL_ID;
  if (channelId) {
    console.log(`  SLACK_CHANNEL_ID      : set (${channelId})`);
    anyConfigured = true;
  } else {
    console.log("  SLACK_CHANNEL_ID      : not set");
  }

  const userId = process.env.SLACK_USER_ID;
  if (userId) {
    console.log(`  SLACK_USER_ID         : set (${userId})`);
  } else {
    console.log("  SLACK_USER_ID         : not set");
  }

  const envFileVar = process.env.SIGNAL_FLARE_ENV_FILE;
  if (envFileVar) {
    console.log(`  SIGNAL_FLARE_ENV_FILE : set (${envFileVar})`);
  } else {
    console.log("  SIGNAL_FLARE_ENV_FILE : not set");
  }

  // --- Convention Config File ---
  console.log("\nConfig File:");
  const configPath = path.join(homedir(), ".config", "signal-flare", "config.json");

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const cfg = JSON.parse(raw) as { envFile?: string };
      if (cfg.envFile) {
        console.log(`  ~/.config/signal-flare/config.json : found`);
        console.log(`    envFile: ${cfg.envFile}`);
        const envExists = existsSync(cfg.envFile);
        console.log(`    .env file exists: ${envExists ? "yes" : "no"}`);
        if (envExists) anyConfigured = true;
      } else {
        console.log("  ~/.config/signal-flare/config.json : found (no envFile field)");
      }
    } catch {
      console.log("  ~/.config/signal-flare/config.json : found (could not parse)");
    }
  } else {
    console.log("  ~/.config/signal-flare/config.json : not found");
  }

  // --- Claude Code Settings ---
  console.log("\nClaude Code Settings:");

  // Check global settings.json for hooks
  const globalSettingsPath = path.join(homedir(), ".claude", "settings.json");
  const projectSettingsPath = path.join(process.cwd(), ".claude", "settings.json");

  let hooksConfigured = false;

  for (const [label, settingsPath] of [
    ["Global ~/.claude/settings.json", globalSettingsPath],
    ["Project .claude/settings.json", projectSettingsPath],
  ]) {
    if (existsSync(settingsPath)) {
      try {
        const raw = readFileSync(settingsPath, "utf8");
        const settings = JSON.parse(raw) as { hooks?: Record<string, unknown[]> };
        const hasSignalFlare = checkHooksForSignalFlare(settings.hooks);
        if (hasSignalFlare) {
          console.log(`  ${label}: hooks configured`);
          hooksConfigured = true;
          anyConfigured = true;
        } else {
          console.log(`  ${label}: found (no Signal Flare hooks)`);
        }
      } catch {
        console.log(`  ${label}: found (could not parse)`);
      }
    } else {
      console.log(`  ${label}: not found`);
    }
  }

  if (!hooksConfigured) {
    console.log("  Hooks: not configured");
  }

  // Check MCP server config
  const globalMcpPath = path.join(homedir(), ".claude.json");
  const projectMcpPath = path.join(process.cwd(), ".mcp.json");

  let mcpConfigured = false;

  for (const [label, mcpPath] of [
    ["Global ~/.claude.json", globalMcpPath],
    ["Project .mcp.json", projectMcpPath],
  ]) {
    if (existsSync(mcpPath)) {
      try {
        const raw = readFileSync(mcpPath, "utf8");
        const config = JSON.parse(raw) as {
          mcpServers?: Record<string, unknown>;
        };
        if (config.mcpServers && "signal-flare" in config.mcpServers) {
          console.log(`  ${label}: MCP server configured`);
          mcpConfigured = true;
          anyConfigured = true;
        } else {
          console.log(`  ${label}: found (no Signal Flare MCP entry)`);
        }
      } catch {
        console.log(`  ${label}: found (could not parse)`);
      }
    } else {
      console.log(`  ${label}: not found`);
    }
  }

  if (!mcpConfigured) {
    console.log("  MCP server: not configured");
  }

  // --- Summary ---
  console.log();
  if (!anyConfigured) {
    console.log("Nothing is configured yet.");
    console.log("Run `signal-flare setup` to get started.\n");
  } else {
    console.log("Configuration found. Run `signal-flare test` to verify Slack connectivity.\n");
  }
}

/**
 * Checks if a hooks object contains any Signal Flare entries.
 */
function checkHooksForSignalFlare(hooks: Record<string, unknown[]> | undefined): boolean {
  if (!hooks) return false;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).command === "string" &&
        ((entry as Record<string, unknown>).command as string).includes("signal-flare")
      ) {
        return true;
      }
    }
  }
  return false;
}
