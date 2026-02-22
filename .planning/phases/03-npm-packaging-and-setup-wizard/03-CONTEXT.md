# Phase 3: npm Packaging and Setup Wizard - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Global npm package (`signal-flare`) with CLI commands (`setup`, `test`, `status`), a `.env`-based configuration system with dotenv, and a polished README with Slack app creation guide, troubleshooting, and demo GIF. Covers PKG-01 through PKG-05. Test suite and CI are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Setup Wizard Flow
- `signal-flare setup` detects existing env vars first, pre-fills from environment, only prompts for missing values
- Wizard asks "Global or project-level?" and writes to either `~/.claude/settings.json` or `.claude/settings.json` accordingly
- Wizard validates Slack token by calling `auth.test()` and `conversations.info()` before writing config — fails with clear error if token or channel is invalid
- When Claude Code settings already have hooks or MCP servers configured, wizard merges Signal Flare's config alongside existing entries — never overwrites other tools' config

### README Structure & Tone
- Professional but friendly tone — clear, structured, welcoming but not overly casual
- Step-by-step Slack app creation guide with numbered steps and exact menu paths/scope names — no screenshots (they go stale)
- Troubleshooting section covering top 5-6 common issues (missing scopes, wrong channel ID, token not working, no notifications, etc.)
- Demo GIF at the top of README showing the full flow: Claude asks question → Slack notification → reply → Claude continues

### Configuration & Env Var Handling
- `.env` file with dotenv — tokens stay out of Claude Code's settings.json
- Wizard asks the user where to store the `.env` file (e.g., `~/.config/signal-flare/.env` or `~/.signal-flare.env`)
- MCP server and hook handler both load the `.env` file using dotenv at startup
- `signal-flare test` command sends a test notification to Slack to verify end-to-end configuration
- Missing env var errors are actionable: "Missing SLACK_BOT_TOKEN. Run `signal-flare setup` to configure, or set the env var manually."

### Package Identity
- npm package name: `signal-flare` (confirmed available on npm)
- License: MIT
- CLI commands: `signal-flare setup`, `signal-flare test`, `signal-flare status`
- `signal-flare status` shows current config, detected env vars, and whether Claude Code settings are configured
- Repository: `github.com/jdlnolen/signal-flare` (public)

### Claude's Discretion
- Exact interactive prompt library (inquirer, prompts, etc.)
- package.json keywords and description wording
- Exact troubleshooting topics beyond the top 5-6
- How dotenv path is passed to MCP server and hook handler (env var pointing to .env location, or hardcoded convention)
- Demo GIF creation tooling and exact scenario shown

</decisions>

<specifics>
## Specific Ideas

- The setup wizard should feel like `npx create-next-app` or `npm init` — guided, smart defaults, minimal friction
- README should get someone from "never heard of Signal Flare" to "receiving first Slack notification" in under 10 minutes
- `signal-flare status` is a debugging lifeline — show everything: env vars (masked tokens), config file paths, Claude Code settings state

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-npm-packaging-and-setup-wizard*
*Context gathered: 2026-02-22*
