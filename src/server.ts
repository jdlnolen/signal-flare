// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createSlackClient } from "./slack/client.js";
import { registerAskHumanTool } from "./tools/ask-human.js";

(async () => {
  try {
    // Load and validate configuration — exits with clear error if env vars are missing
    const config = loadConfig();

    // Initialize Slack client — validates token via auth.test() and resolves bot user ID
    const slackClient = await createSlackClient(config);

    // Create MCP server instance
    const server = new McpServer({ name: "signal-flare", version: "0.1.0" }, { capabilities: {} });

    // Register the ask_human_via_slack tool
    registerAskHumanTool(server, slackClient, config);

    // Connect via stdio transport (required for MCP JSON-RPC over stdin/stdout)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Signal Flare MCP server started");
  } catch (err) {
    console.error("Fatal:", err);
    process.exit(1);
  }
})();
