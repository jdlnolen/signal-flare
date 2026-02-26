# Signal Flare

> When Claude Code needs you and you're not watching the terminal, Signal Flare gets the message to you in Slack.

<!-- TODO: Add demo GIF showing: Claude asks question -> Slack notification -> reply -> Claude continues -->
![Signal Flare Demo](./docs/demo.gif)

---

## Features

- **Ask Human via Slack** — Claude sends questions directly to Slack. You reply in Slack, and your answer is delivered back to Claude so work continues without you switching windows.
- **Task completion notifications** — Get a Slack message when Claude finishes a long-running task, so you know when to check in.
- **Error alerts** — Notified when a tool fails so you can decide whether to intervene.
- **Question detection** — If Claude is waiting at a terminal prompt and you don't respond within 90 seconds, Signal Flare escalates to Slack.
- **Rich Block Kit messages** — Color-coded notifications (orange for questions and alerts) with structured content.
- **One-command setup wizard** — `signal-flare setup` walks you through configuration interactively.

---

## Quick Start

Get from zero to your first Slack notification in under 10 minutes:

1. [Create a Slack app](#creating-your-slack-app) (5 minutes, one-time setup)
2. Install Signal Flare globally:
   ```
   npm install -g signal-flare
   ```
3. Run the setup wizard:
   ```
   signal-flare setup
   ```
4. Restart Claude Code to pick up the new MCP server and hooks.
5. Verify everything is working:
   ```
   signal-flare test
   ```

You should see a test notification appear in your Slack channel.

---

## Creating Your Slack App

Signal Flare uses your own personal Slack app — this keeps it exempt from Slack's rate limits for third-party apps and ensures your tokens stay private.

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**.

2. Give your app a name (e.g., "Signal Flare" or "Claude Notifications") and select the workspace you want to use. Click **Create App**.

3. In the left sidebar, click **OAuth & Permissions**.

4. Scroll down to **Scopes** > **Bot Token Scopes**. Click **Add an OAuth Scope** and add the following scopes:
   - `chat:write` — Allows the bot to send messages to channels
   - `channels:history` — Read message replies in public channels
   - `channels:read` — Verify access to public channels

   **If using a private channel**, also add:
   - `groups:history` — Read message replies in private channels
   - `groups:read` — Verify access to private channels

5. Scroll back to the top of the **OAuth & Permissions** page and click **Install to Workspace**. Review the permissions and click **Allow**.

6. After installation, you'll be returned to the **OAuth & Permissions** page. Copy the **Bot User OAuth Token** — it starts with `xoxb-`. This is your `SLACK_BOT_TOKEN`.

7. Open Slack and create or choose a channel where you want notifications to appear (e.g., `#claude-notifications`).

8. Get the **Channel ID**: Right-click the channel name in the sidebar > **View channel details** > scroll to the bottom of the About tab. Copy the ID — it starts with `C` (e.g., `C08ABCDEF12`). This is your `SLACK_CHANNEL_ID`.

9. Invite your bot to the channel. In the channel, type:
   ```
   /invite @YourBotName
   ```
   Replace `YourBotName` with the name you gave your app.

10. **(Optional) Get your User ID for @mentions**: Click your profile picture in the top-right > **Profile** > click the three-dot menu (**...**) > **Copy member ID**. This is your `SLACK_USER_ID` — Signal Flare will @mention you in notifications if this is set.

---

## Installation

```bash
npm install -g signal-flare
```

**Requirements:** Node.js 18 or later.

---

## Setup

```bash
signal-flare setup
```

The setup wizard will:
- Prompt you for your Slack bot token, channel ID, and optional user ID
- Validate your credentials by connecting to Slack
- Ask where to store your `.env` config file
- Write MCP server and hook entries into your Claude Code settings

The wizard merges Signal Flare's config alongside any existing Claude Code settings — it will never overwrite configuration from other tools.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `signal-flare setup` | Interactive configuration wizard — creates or updates your Slack credentials and Claude Code settings |
| `signal-flare test` | Sends a test notification to your Slack channel to verify end-to-end configuration |
| `signal-flare status` | Shows current configuration, detected environment variables (tokens masked), and whether Claude Code settings are correctly configured |

---

## How It Works

Signal Flare runs as both an **MCP server** and a set of **Claude Code hooks**:

**MCP server (`ask_human_via_slack` tool):** When Claude needs human input during a task, it calls this tool directly. Signal Flare posts a formatted question to Slack and polls for your reply (up to 10 minutes). Your Slack response is delivered back to Claude as the tool result, and Claude continues working.

**Hook handlers:** Three Claude Code lifecycle hooks send Slack notifications automatically — `Stop` fires when a session ends and sends a task summary, `PostToolUseFailure` fires on tool errors and sends an alert, and `PermissionRequest` includes an idle timeout: if Claude is waiting at a terminal prompt and you don't respond within 90 seconds, Signal Flare posts the question to Slack.

**Your data stays yours:** All communication goes through your own Slack app using your own tokens. No third-party servers are involved.

---

## Configuration

Signal Flare reads credentials from a `.env` file (the path is stored in `~/.config/signal-flare/config.json` by the setup wizard, or can be overridden with `SIGNAL_FLARE_ENV_FILE`).

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot OAuth token from Slack (starts with `xoxb-`) |
| `SLACK_CHANNEL_ID` | Yes | ID of the Slack channel for notifications (starts with `C`) |
| `SLACK_USER_ID` | No | Your Slack member ID for @mentions in notifications |
| `SIGNAL_FLARE_ENV_FILE` | No | Absolute path to your `.env` file (overrides the convention path) |
| `HOOK_IDLE_TIMEOUT_MS` | No | Milliseconds to wait at a terminal prompt before escalating to Slack (default: `90000`) |
| `POLL_TIMEOUT_MS` | No | Milliseconds the MCP tool waits for a Slack reply before timing out (default: `600000`) |

---

## Troubleshooting

**"Missing SLACK_BOT_TOKEN" or "Missing SLACK_CHANNEL_ID" error**
Your credentials are not loading. Run `signal-flare setup` to configure them, or check that the `.env` file path in `~/.config/signal-flare/config.json` points to a file that exists and contains the correct variables. You can also set `SIGNAL_FLARE_ENV_FILE` to an absolute path if you prefer a custom location.

**Bot is not posting messages to the channel**
Make sure your bot is invited to the channel. In Slack, open the channel and type `/invite @YourBotName`. Without this step, the bot has a token but no permission to post in that channel.

**"missing_scope" error during setup**
Your bot token is missing a required OAuth scope. For public channels, you need `channels:read` and `channels:history`. For private channels, you need `groups:read` and `groups:history`. Add the missing scope in your Slack app's **OAuth & Permissions** page, then **reinstall the app to your workspace** (Slack requires reinstallation after scope changes).

**"channel_not_found" error**
Verify that your `SLACK_CHANNEL_ID` starts with `C` (not the channel name, which starts with `#`). Also confirm the bot is invited to the channel (`/invite @YourBotName`) and has the appropriate read scope (`channels:read` for public, `groups:read` for private).

**Hooks are not firing**
Run `signal-flare status` to see the current state. Verify that `~/.claude/settings.json` contains hook entries for `Stop`, `PostToolUseFailure`, and `PermissionRequest`. If hooks are missing, re-run `signal-flare setup`. After any settings change, restart Claude Code completely.

**`ask_human_via_slack` tool is not available in Claude**
Run `signal-flare status` to check MCP server registration. Verify that `~/.claude.json` (or `~/.claude/claude.json`) contains an `mcpServers` entry for `signal-flare`. If missing, re-run `signal-flare setup`. Restart Claude Code after any changes.

**Questions are not triggering Slack notifications**
The idle timeout is 90 seconds by default — Signal Flare only sends a Slack notification if you have not responded in the terminal within that window. If you respond quickly at the terminal, no Slack notification is sent (by design). To lower the threshold, set `HOOK_IDLE_TIMEOUT_MS` in your `.env` file (e.g., `HOOK_IDLE_TIMEOUT_MS=30000` for 30 seconds).

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Contributing

This is a personal project, but issues and pull requests are welcome on [GitHub](https://github.com/jdlnolen/signal-flare). If something isn't working or a step in the docs is unclear, please open an issue.
