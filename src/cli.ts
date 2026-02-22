// CLI entry point for signal-flare — #!/usr/bin/env node shebang added by tsup banner
// NOTE: console.log() is permitted here — this is a user-facing CLI process, not an MCP server

import { Command } from "commander";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("signal-flare")
  .description("Bridge Claude Code and Slack")
  .version(VERSION);

program
  .command("setup")
  .description("Configure Signal Flare for your workspace")
  .action(() => {
    console.log("Setup wizard coming soon...");
  });

program
  .command("test")
  .description("Send a test notification to Slack")
  .action(() => {
    console.log("Test notification coming soon...");
  });

program
  .command("status")
  .description("Show current configuration and connection status")
  .action(() => {
    console.log("Status check coming soon...");
  });

// Show help if no subcommand given
program.action(() => program.help());

program.parse(process.argv);
