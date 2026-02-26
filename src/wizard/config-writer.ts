// NOTE: console.log() is permitted here — this is a CLI utility, not an MCP server

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Safely reads a JSON file, returning an empty object if the file doesn't exist
 * or cannot be parsed.
 */
function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error(`[signal-flare] Warning: Could not parse ${filePath}, treating as empty`);
    return {};
  }
}

/**
 * Resolves the absolute paths to the Signal Flare package's dist files.
 * Uses import.meta.url to locate the package root relative to this file.
 */
export function resolvePackagePaths(): { serverJs: string; hookHandlerJs: string } {
  // This file is at src/wizard/config-writer.ts
  // When compiled, it is at dist/wizard/config-writer.js
  // The package root is two levels up from dist/wizard/
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(thisFile), "..", "..");
  return {
    serverJs: path.join(packageRoot, "dist", "server.js"),
    hookHandlerJs: path.join(packageRoot, "dist", "hook-handler.js"),
  };
}

/**
 * Writes the Signal Flare .env file with Slack credentials.
 * Uses restrictive permissions (0o600 — owner read/write only) for security.
 *
 * @param envPath - Absolute path to write the .env file
 * @param vars - Slack credentials to write
 */
export function writeEnvFile(
  envPath: string,
  vars: { token: string; channelId: string; userId?: string }
): void {
  const dir = path.dirname(envPath);
  mkdirSync(dir, { recursive: true });

  let content = `SLACK_BOT_TOKEN=${vars.token}\nSLACK_CHANNEL_ID=${vars.channelId}\n`;
  if (vars.userId && vars.userId.trim() !== "") {
    content += `SLACK_USER_ID=${vars.userId}\n`;
  }

  writeFileSync(envPath, content, { mode: 0o600 });
}

/**
 * Writes the Signal Flare convention config file at ~/.config/signal-flare/config.json.
 * This tells hook handlers where to find the .env file.
 *
 * @param envFilePath - Absolute path to the .env file
 */
export function writeConfigJson(envFilePath: string): void {
  const configDir = path.join(homedir(), ".config", "signal-flare");
  mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, "config.json");
  writeFileSync(configPath, JSON.stringify({ envFile: envFilePath }, null, 2), "utf8");
}

/**
 * Writes Signal Flare hook entries to the Claude Code settings file.
 * Merges safely into the existing settings without overwriting other tools' config.
 * Idempotent: updates existing Signal Flare entries rather than duplicating them.
 *
 * @param scope - 'global' writes to ~/.claude/settings.json, 'project' to .claude/settings.json
 * @param hookHandlerPath - Absolute path to the hook-handler.js file
 * @param envFilePath - Absolute path to the .env file
 */
export function writeHooksConfig(
  scope: "global" | "project",
  hookHandlerPath: string,
  envFilePath: string
): void {
  const settingsPath =
    scope === "global"
      ? path.join(homedir(), ".claude", "settings.json")
      : path.join(process.cwd(), ".claude", "settings.json");

  // Ensure parent directory exists
  mkdirSync(path.dirname(settingsPath), { recursive: true });

  const existing = readJsonSafe(settingsPath);
  const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};

  // The hook command with inline env var so hook handler can find the .env
  const hookCommand = `SIGNAL_FLARE_ENV_FILE=${envFilePath} ${hookHandlerPath}`;

  // Helper: remove existing Signal Flare entries from a hooks array.
  // Handles both old format ({ command: "..." }) and new format ({ matcher: {}, hooks: [...] }).
  function removeExistingEntries(arr: unknown[]): unknown[] {
    return arr.filter((entry) => {
      if (typeof entry === "object" && entry !== null) {
        const e = entry as Record<string, unknown>;
        // Old format: { command: "...signal-flare..." }
        if (typeof e.command === "string" && e.command.includes("signal-flare")) {
          return false;
        }
        // New format: { matcher: {}, hooks: [{ type: "command", command: "...signal-flare..." }] }
        if (Array.isArray(e.hooks)) {
          const hasSignalFlare = (e.hooks as unknown[]).some((h) => {
            if (typeof h === "object" && h !== null) {
              const hook = h as Record<string, unknown>;
              return typeof hook.command === "string" && hook.command.includes("signal-flare");
            }
            return false;
          });
          if (hasSignalFlare) return false;
        }
      }
      return true;
    });
  }

  // Claude Code hooks use the matcher/hooks format:
  // { "matcher": "regex", "hooks": [{ "type": "command", "command": "..." }] }
  // matcher is a regex string (or omit for "match all"). Stop and PostToolUseFailure
  // don't support matchers and always fire on every occurrence.
  // See: https://code.claude.com/docs/en/hooks

  // Stop hook (no matcher support — always fires on every stop)
  const stopHooks = removeExistingEntries(
    Array.isArray(hooks["Stop"]) ? (hooks["Stop"] as unknown[]) : []
  );
  stopHooks.push({
    hooks: [{ type: "command", command: hookCommand }],
  });
  hooks["Stop"] = stopHooks;

  // PostToolUseFailure hook (no matcher support — always fires on every failure)
  const postToolFailureHooks = removeExistingEntries(
    Array.isArray(hooks["PostToolUseFailure"]) ? (hooks["PostToolUseFailure"] as unknown[]) : []
  );
  postToolFailureHooks.push({
    hooks: [{ type: "command", command: hookCommand }],
  });
  hooks["PostToolUseFailure"] = postToolFailureHooks;

  // Clean up stale Signal Flare entries from PreToolUse (migrated to PermissionRequest)
  if (Array.isArray(hooks["PreToolUse"])) {
    const cleanedPreToolUse = removeExistingEntries(hooks["PreToolUse"] as unknown[]);
    if (cleanedPreToolUse.length > 0) {
      hooks["PreToolUse"] = cleanedPreToolUse;
    } else {
      delete hooks["PreToolUse"];
    }
  }

  // PermissionRequest hook — fires when Claude needs human approval for a risky action
  const permissionHooks = removeExistingEntries(
    Array.isArray(hooks["PermissionRequest"]) ? (hooks["PermissionRequest"] as unknown[]) : []
  );
  permissionHooks.push({
    hooks: [{ type: "command", command: hookCommand }],
  });
  hooks["PermissionRequest"] = permissionHooks;

  const merged = { ...existing, hooks };
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf8");
}

/**
 * Writes the Signal Flare MCP server entry to the Claude Code config file.
 * Merges safely into the existing config without overwriting other tools' entries.
 *
 * @param scope - 'global' writes to ~/.claude.json, 'project' to .mcp.json
 * @param serverJsPath - Absolute path to the server.js file
 * @param envFilePath - Absolute path to the .env file
 */
export function writeMcpConfig(
  scope: "global" | "project",
  serverJsPath: string,
  envFilePath: string
): void {
  const mcpPath =
    scope === "global"
      ? path.join(homedir(), ".claude.json")
      : path.join(process.cwd(), ".mcp.json");

  // Ensure parent directory exists (for project scope .mcp.json in CWD)
  mkdirSync(path.dirname(mcpPath), { recursive: true });

  const existing = readJsonSafe(mcpPath);
  const mcpServers = (existing.mcpServers as Record<string, unknown>) ?? {};

  // Add or update signal-flare MCP server entry
  mcpServers["signal-flare"] = {
    type: "stdio",
    command: serverJsPath,
    args: [],
    env: {
      SIGNAL_FLARE_ENV_FILE: envFilePath,
    },
  };

  const merged = { ...existing, mcpServers };
  writeFileSync(mcpPath, JSON.stringify(merged, null, 2), "utf8");
}
