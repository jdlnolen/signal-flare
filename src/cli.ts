// CLI entry point for signal-flare — #!/usr/bin/env node shebang added by tsup banner
// NOTE: console.log() is permitted here — this is a user-facing CLI process, not an MCP server

import { createRequire } from "node:module";
import { Command } from "commander";
import { runSetup } from "./commands/setup.js";
import { runTest } from "./commands/test.js";
import { runStatus } from "./commands/status.js";

const _require = createRequire(import.meta.url);
const { version: VERSION } = _require("../package.json") as { version: string };

const program = new Command();

program.name("signal-flare").description("Bridge Claude Code and Slack").version(VERSION);

program
  .command("setup")
  .description("Configure Signal Flare for your workspace")
  .action(async () => {
    await runSetup(VERSION);
  });

program
  .command("test")
  .description("Send a test notification to Slack")
  .action(async () => {
    await runTest();
  });

program
  .command("status")
  .description("Show current configuration and connection status")
  .action(async () => {
    await runStatus();
  });

// Show help if no subcommand given
program.action(() => program.help());

program.parse(process.argv);
