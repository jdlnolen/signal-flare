// NOTE: console.log() is permitted here — this is a CLI wizard, not an MCP server

import { input, password, select, confirm } from "@inquirer/prompts";

/**
 * Ensures the current process is running in an interactive terminal.
 * If not (e.g., piped input), prints an error and exits.
 */
export function ensureTTY(): void {
  if (!process.stdin.isTTY) {
    console.error("signal-flare setup requires an interactive terminal. Run without piping.");
    process.exit(1);
  }
}

/**
 * Prompts for a Slack Bot Token (xoxb-...).
 * Uses password masking for security.
 * If an existing token is provided, shows a hint with the last 4 characters.
 */
export async function promptForToken(existing?: string): Promise<string> {
  ensureTTY();
  const hint = existing ? ` (current: xoxb-****...${existing.slice(-4)})` : "";
  const token = await password({
    message: `Enter your Slack Bot Token (xoxb-...):${hint}`,
    mask: "*",
    validate: (value: string) => {
      if (!value && existing) return true;
      if (!value.startsWith("xoxb-")) {
        return 'Token must start with "xoxb-"';
      }
      return true;
    },
  });
  // If user pressed Enter with empty value and an existing token was provided, return existing
  return token || existing || token;
}

/**
 * Prompts for a Slack Channel ID (starts with 'C').
 */
export async function promptForChannelId(existing?: string): Promise<string> {
  ensureTTY();
  return input({
    message: "Enter your Slack Channel ID (starts with C):",
    default: existing,
    validate: (value: string) => {
      if (!value.startsWith("C")) {
        return 'Channel ID must start with "C"';
      }
      return true;
    },
  });
}

/**
 * Prompts for a Slack User ID (optional, starts with 'U').
 * User can press Enter to skip.
 */
export async function promptForUserId(existing?: string): Promise<string> {
  ensureTTY();
  return input({
    message: "Enter your Slack User ID (optional, press Enter to skip):",
    default: existing ?? "",
    validate: (value: string) => {
      if (value === "") return true;
      if (!value.startsWith("U")) {
        return 'User ID must start with "U" or be empty to skip';
      }
      return true;
    },
  });
}

/**
 * Prompts for installation scope: global (all sessions) or project (current directory only).
 */
export async function promptForScope(): Promise<"global" | "project"> {
  ensureTTY();
  return select<"global" | "project">({
    message: "Where should Signal Flare be configured?",
    choices: [
      {
        name: "Global (all Claude Code sessions)",
        value: "global",
      },
      {
        name: "Project (this directory only)",
        value: "project",
      },
    ],
  });
}

/**
 * Prompts for the path where Signal Flare should store credentials.
 */
export async function promptForEnvPath(defaultPath: string): Promise<string> {
  ensureTTY();
  return input({
    message: "Where should Signal Flare store your credentials?",
    default: defaultPath,
  });
}

// Re-export confirm for use in setup command
export { confirm };
