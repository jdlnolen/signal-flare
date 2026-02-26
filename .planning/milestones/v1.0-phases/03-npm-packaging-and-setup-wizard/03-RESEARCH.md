# Phase 3: npm Packaging and Setup Wizard - Research

**Researched:** 2026-02-22
**Domain:** npm global package distribution, CLI wizard, Claude Code settings.json, dotenv configuration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Setup Wizard Flow
- `signal-flare setup` detects existing env vars first, pre-fills from environment, only prompts for missing values
- Wizard asks "Global or project-level?" and writes to either `~/.claude/settings.json` or `.claude/settings.json` accordingly
- Wizard validates Slack token by calling `auth.test()` and `conversations.info()` before writing config — fails with clear error if token or channel is invalid
- When Claude Code settings already have hooks or MCP servers configured, wizard merges Signal Flare's config alongside existing entries — never overwrites other tools' config

#### README Structure and Tone
- Professional but friendly tone — clear, structured, welcoming but not overly casual
- Step-by-step Slack app creation guide with numbered steps and exact menu paths/scope names — no screenshots (they go stale)
- Troubleshooting section covering top 5-6 common issues (missing scopes, wrong channel ID, token not working, no notifications, etc.)
- Demo GIF at the top of README showing the full flow: Claude asks question → Slack notification → reply → Claude continues

#### Configuration and Env Var Handling
- `.env` file with dotenv — tokens stay out of Claude Code's settings.json
- Wizard asks the user where to store the `.env` file (e.g., `~/.config/signal-flare/.env` or `~/.signal-flare.env`)
- MCP server and hook handler both load the `.env` file using dotenv at startup
- `signal-flare test` command sends a test notification to Slack to verify end-to-end configuration
- Missing env var errors are actionable: "Missing SLACK_BOT_TOKEN. Run `signal-flare setup` to configure, or set the env var manually."

#### Package Identity
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PKG-01 | Published as npm global package (`npm install -g signal-flare`) | bin field, shebang, ESM packaging, npm publish checklist |
| PKG-02 | `signal-flare setup` wizard writes hook config to `~/.claude/settings.json` and MCP server config using absolute paths | Claude Code settings.json format, hooks JSON schema, `~/.claude.json` MCP format |
| PKG-03 | All logging uses `console.error()` — zero `console.log()` calls in MCP server code | Already established in project; CLI commands can use console.log |
| PKG-04 | Configuration via environment variables: SLACK_BOT_TOKEN (required), SLACK_CHANNEL_ID (required), SLACK_USER_ID (optional) | dotenv custom path loading, env var expansion in Claude Code |
| PKG-05 | Polished README with Slack app creation guide, required scopes, setup instructions, troubleshooting, and demo GIF | README structure patterns |
</phase_requirements>

---

## Summary

Signal Flare Phase 3 converts the existing local TypeScript project into a globally-installable npm package with a guided setup wizard. The package already has the right structural foundation (`type: "module"`, ESM build output, tsup config) but needs: a separate CLI entry point for the `signal-flare` binary (currently the bin points to `dist/server.js` which is the MCP server, not a CLI dispatcher), dotenv integration for loading `.env` from a user-chosen path, a three-command CLI (`setup`, `test`, `status`), and correct writing to Claude Code's two configuration locations (`~/.claude/settings.json` for hooks, `~/.claude.json` for MCP servers).

The most critical discovery is that **Claude Code stores MCP servers in `~/.claude.json`** (the user/local scope), NOT in `~/.claude/settings.json`. The hooks configuration IS in `~/.claude/settings.json`. The wizard must write to two separate files. Both files require careful JSON merge logic to avoid overwriting existing configuration from other tools.

For the interactive prompt library, `@inquirer/prompts` v8.2.1 is the current standard — it is the official rewrite of the classic `inquirer` package, ships ESM-native, has full TypeScript support, and uses clean async/await API. It is the correct choice for this wizard.

**Primary recommendation:** Create `src/cli.ts` as the CLI entry point with subcommands (`setup`, `test`, `status`), add `@inquirer/prompts` and `dotenv` as runtime dependencies, update `bin` in package.json to point to `dist/cli.js`, and write the wizard to merge into both `~/.claude/settings.json` (hooks) and `~/.claude.json` (MCP server).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@inquirer/prompts` | ^8.2.1 | Interactive CLI prompts (input, password, select, confirm) | Official rewrite of inquirer; ESM-native; TypeScript; async/await; most widely used in 2025-2026 ecosystem |
| `dotenv` | ^17.3.1 | Load `.env` file from user-chosen path into process.env | Universal standard; supports custom path via `dotenv.config({ path })` |
| `commander` | ^14.0.3 | CLI argument parsing and subcommand routing | Dominant Node.js CLI framework; handles `setup`, `test`, `status` subcommands cleanly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@slack/web-api` | ^7.14.1 | Already a dependency; used for token validation in wizard | Wizard calls `auth.test()` and `conversations.info()` to validate before writing config |
| `zod` | ^3.25.0 | Already a dependency; validate config after loading .env | Use in `signal-flare status` to show which vars are set/valid |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@inquirer/prompts` | `@clack/prompts` v1.0.1 | clack has beautiful spinner/intro/outro UI but was just released v1.0; inquirer is more proven, better TypeScript types, more prompt variety |
| `@inquirer/prompts` | `prompts` | prompts is lighter but not ESM-native; harder TypeScript experience |
| `commander` | Built-in argv parsing | commander handles edge cases, help text, version flags automatically — not worth hand-rolling |

**Installation:**
```bash
npm install @inquirer/prompts dotenv commander
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── cli.ts              # CLI entry point — commander setup, subcommand routing
├── commands/
│   ├── setup.ts        # `signal-flare setup` wizard implementation
│   ├── test.ts         # `signal-flare test` — sends test Slack notification
│   └── status.ts       # `signal-flare status` — shows config state
├── wizard/
│   ├── prompts.ts      # Reusable prompt functions (ask for token, channel, etc.)
│   ├── config-writer.ts # Write/merge ~/.claude/settings.json and ~/.claude.json
│   └── validator.ts    # Slack token + channel validation via API
├── config.ts           # UPDATED: load dotenv from SIGNAL_FLARE_ENV_FILE path
├── server.ts           # MCP server entry (unchanged)
├── hook-handler.ts     # Hook handler entry (unchanged)
└── hooks/
    └── watcher.ts      # (unchanged)
```

### Pattern 1: Separate CLI Entry Point

**What:** `cli.ts` is the binary entry point; it is NOT the MCP server. The existing `server.ts` is invoked by Claude Code as the MCP server, not by the user directly. The `bin` field must point to the CLI, not the MCP server.

**Why critical:** Currently `package.json` has `"bin": { "signal-flare": "./dist/server.js" }` which is wrong — running `signal-flare` would start the MCP JSON-RPC server on stdin/stdout, not a CLI. The bin must be updated to `./dist/cli.js`.

**Pattern:**
```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { runSetup } from './commands/setup.js';
import { runTest } from './commands/test.js';
import { runStatus } from './commands/status.js';

const program = new Command();
program
  .name('signal-flare')
  .description('Bridge Claude Code and Slack')
  .version('0.1.0');

program.command('setup').description('Configure Signal Flare').action(runSetup);
program.command('test').description('Send a test Slack notification').action(runTest);
program.command('status').description('Show configuration status').action(runStatus);

program.parse(process.argv);
```

### Pattern 2: Two-File Claude Code Configuration

**What:** Claude Code uses TWO separate files for hooks vs. MCP servers. The wizard must write to both.

**Critical discovery from official docs:**

| What | File | Format |
|------|------|--------|
| **Hooks** (PermissionRequest, Stop, PostToolUseFailure) | `~/.claude/settings.json` (global) or `.claude/settings.json` (project) | `{ "hooks": { "Stop": [...], "PermissionRequest": [...], "PostToolUseFailure": [...] } }` |
| **MCP servers** (user/local scope) | `~/.claude.json` | `{ "mcpServers": { "signal-flare": { ... } } }` |

**Hooks format in `~/.claude/settings.json`:**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/dist/hook-handler.js",
            "async": true
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/dist/hook-handler.js",
            "async": true
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "AskUserQuestion|mcp__.*__ask_human.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/dist/hook-handler.js"
          }
        ]
      }
    ]
  }
}
```

**MCP server format in `~/.claude.json`:**
```json
{
  "mcpServers": {
    "signal-flare": {
      "type": "stdio",
      "command": "/absolute/path/to/dist/server.js",
      "args": [],
      "env": {
        "SIGNAL_FLARE_ENV_FILE": "/home/user/.config/signal-flare/.env"
      }
    }
  }
}
```

### Pattern 3: dotenv Custom Path Loading

**What:** The user chooses where to store their `.env` file during setup. The wizard stores the chosen path in the MCP server `env` config as `SIGNAL_FLARE_ENV_FILE`. Both `server.ts` and `hook-handler.ts` call `dotenv.config({ path: process.env.SIGNAL_FLARE_ENV_FILE })` at startup.

**Implementation in config.ts:**
```typescript
// src/config.ts — add before ConfigSchema.safeParse
import dotenv from 'dotenv';
import { existsSync } from 'fs';

const envFilePath = process.env.SIGNAL_FLARE_ENV_FILE;
if (envFilePath && existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath });
} else if (envFilePath) {
  console.error(`[signal-flare] Warning: .env file not found at ${envFilePath}`);
}
// Falls through to existing ConfigSchema.safeParse(process.env) logic
```

**Hook handler challenge:** Hook handlers are invoked by Claude Code directly, not through the MCP server. They don't get the `env` from the MCP server config. The wizard must also write `SIGNAL_FLARE_ENV_FILE` to the hook command itself or use a convention path.

**Resolution approach:** Store the env path as a known convention: the wizard writes the `.env` path to `~/.config/signal-flare/config.json` (a lightweight location file). Both MCP server and hook handler read this location file at startup to find the `.env`.

Alternatively (simpler): Pass the env path directly in the hook command string:
```json
{
  "type": "command",
  "command": "SIGNAL_FLARE_ENV_FILE=/home/user/.config/signal-flare/.env /path/to/dist/hook-handler.js"
}
```

### Pattern 4: Safe JSON Merge for Claude Code Config

**What:** When writing `~/.claude/settings.json` or `~/.claude.json`, the wizard must merge Signal Flare config into any existing content — never overwrite.

**Implementation:**
```typescript
// src/wizard/config-writer.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return {}; // Don't crash if file is malformed
  }
}

function writeSettings(filePath: string, updates: Record<string, unknown>): void {
  const existing = readJsonSafe(filePath);
  // Deep merge hooks: append Signal Flare hooks to each event array
  const merged = deepMergeConfig(existing, updates);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
}
```

**Hooks merge strategy:** Each hook event (`Stop`, `PostToolUseFailure`, `PermissionRequest`) is an array. Append Signal Flare's hook handler entries to the existing array, checking first that Signal Flare is not already registered (idempotent).

### Anti-Patterns to Avoid

- **Writing entire settings.json from scratch:** Will delete existing hooks from other tools. Always read-modify-write.
- **Using `console.log()` in MCP server or hook handler:** Corrupts JSON-RPC stdio transport. The CLI commands (`cli.ts`, `commands/`) CAN use `console.log()` since they're not MCP processes.
- **Pointing `bin` to `server.ts` dist:** The MCP server hangs waiting on stdin. Bin must point to `cli.ts` dist.
- **Hardcoding the Signal Flare install path:** Use `process.execPath` or `import.meta.url` to resolve absolute paths at runtime, since global npm install location varies by NVM version.
- **Not adding `engines` field:** Users with Node < 18 will get confusing errors. Specify `"engines": { "node": ">=18.0.0" }`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive CLI prompts | Custom readline wrapper | `@inquirer/prompts` | Handles TTY detection, arrow keys, masking, terminal resize, ctrl-c gracefully |
| CLI argument parsing | Manual `process.argv` parsing | `commander` | Handles help text, version flag, subcommand routing, option aliases |
| Dotenv loading | `fs.readFileSync` + manual parse | `dotenv` | Handles quoting, multiline values, UTF-8 BOM, comments |
| JSON deep merge | Custom recursive merge | Write a simple targeted merge | Only hooks arrays need merging; full generic deep merge is overkill and risky |

**Key insight:** The JSON merge for Claude Code settings is the one place where a targeted hand-rolled solution is safer than a generic deep-merge library. The shape of `settings.json` hooks is well-defined; a targeted merge avoids accidentally corrupting unknown fields.

---

## Common Pitfalls

### Pitfall 1: bin Points to MCP Server
**What goes wrong:** `signal-flare setup` hangs forever waiting on stdin because `server.ts` opens stdio transport.
**Why it happens:** Current `package.json` has `"bin": { "signal-flare": "./dist/server.js" }`.
**How to avoid:** Create `src/cli.ts` as the binary entry point. Update `package.json` bin to `./dist/cli.js`. Add `cli.ts` to tsup entry array.
**Warning signs:** Running `signal-flare` in terminal produces no output and hangs.

### Pitfall 2: MCP Server Stored in Wrong File
**What goes wrong:** Wizard writes MCP server config to `~/.claude/settings.json` but Claude Code looks in `~/.claude.json` for user-scoped servers.
**Why it happens:** Conflation between settings.json (hooks, permissions) and .claude.json (MCP servers).
**How to avoid:** Hooks → `~/.claude/settings.json`. MCP servers (user scope) → `~/.claude.json`. Confirmed by official Claude Code docs: "User and local scope: ~/.claude.json (in the mcpServers field)".
**Warning signs:** Running `claude mcp list` after setup shows nothing; hooks fire but MCP tool not available.

### Pitfall 3: Hook Handler Cannot Find .env File
**What goes wrong:** Hook handler cannot load Slack credentials because it doesn't know where the `.env` file is.
**Why it happens:** Hook commands don't inherit the MCP server's `env` block. Claude Code spawns the hook directly from its own process.
**How to avoid:** The hook command string in `~/.claude/settings.json` must include the env var inline, OR use a convention file (e.g., `~/.config/signal-flare/config.json`) that the hook handler reads to find the `.env` path.
**Recommended solution:** Wizard writes `~/.config/signal-flare/config.json` with `{ "envFile": "/path/to/.env" }`. Hook handler and MCP server both read this file at startup if `SIGNAL_FLARE_ENV_FILE` is not set.
**Warning signs:** Hook fires but logs "Configuration error — missing SLACK_BOT_TOKEN" despite running `signal-flare status` showing tokens as configured.

### Pitfall 4: Absolute Paths in Config are NVM-Relative
**What goes wrong:** Wizard writes `/Users/jane/.nvm/versions/node/v20.0.0/lib/node_modules/signal-flare/dist/server.js` but user switches Node version and path breaks.
**Why it happens:** `require.resolve()` or `process.argv[1]` returns the NVM-versioned path.
**How to avoid:** Use the npm binary symlink path (e.g., `/Users/jane/.nvm/versions/node/v20.0.0/bin/signal-flare`) or derive from `import.meta.url` resolved to the package root. Better: resolve against the `signal-flare` binary itself since npm creates a symlink at the active Node bin location.
**Alternative:** Write the hook command as `signal-flare` (the binary name) if it is guaranteed to be on PATH. But PATH may not be set correctly in Claude Code's subprocess environment. Absolute paths are safer.

### Pitfall 5: Wizard Runs Without TTY (piped)
**What goes wrong:** `@inquirer/prompts` throws or silently fails when stdin is not a TTY.
**Why it happens:** Developer pipes setup into CI or script.
**How to avoid:** Detect non-TTY (`!process.stdin.isTTY`) and print helpful error: "signal-flare setup requires an interactive terminal. Run without piping."

### Pitfall 6: .env File Written Without Restrictive Permissions
**What goes wrong:** Slack bot token is world-readable.
**Why it happens:** Default `writeFileSync` uses 0o666 (umask applied).
**How to avoid:** Use `writeFileSync(path, content, { mode: 0o600 })` for the .env file. 0o600 = owner read/write only.

### Pitfall 7: settings.json is Malformed JSON Before Merge
**What goes wrong:** Wizard crashes trying to JSON.parse existing settings.json that has comments or syntax errors.
**Why it happens:** Users sometimes manually edit settings.json.
**How to avoid:** Wrap JSON.parse in try/catch. If parse fails, warn user and offer to overwrite or exit. Don't silently corrupt.

---

## Code Examples

Verified patterns from official sources:

### bin Field in package.json (Source: npm docs)
```json
{
  "bin": {
    "signal-flare": "./dist/cli.js"
  }
}
```
The tsup config must add `#!/usr/bin/env node` banner (already configured) and `cli.ts` must be in the entry array.

### Hooks Configuration in ~/.claude/settings.json (Source: Claude Code official hooks docs)
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/node_modules/.bin/signal-flare-hook",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/dist/hook-handler.js",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/dist/hook-handler.js",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### MCP Server Configuration in ~/.claude.json (Source: Claude Code official MCP docs)
```json
{
  "mcpServers": {
    "signal-flare": {
      "type": "stdio",
      "command": "/absolute/path/to/dist/server.js",
      "args": [],
      "env": {
        "SIGNAL_FLARE_ENV_FILE": "/Users/user/.config/signal-flare/.env"
      }
    }
  }
}
```

### @inquirer/prompts Usage (Source: npm package docs, verified v8.2.1)
```typescript
// src/wizard/prompts.ts
import { input, password, select, confirm } from '@inquirer/prompts';

export async function promptForToken(existingToken?: string): Promise<string> {
  return password({
    message: 'Enter your Slack Bot Token (xoxb-...):',
    mask: '*',
    // Pre-fill hint if already set
    ...(existingToken ? { default: existingToken } : {}),
  });
}

export async function promptForChannelId(existingId?: string): Promise<string> {
  return input({
    message: 'Enter your Slack Channel ID (C...):',
    default: existingId,
    validate: (val) => val.startsWith('C') ? true : 'Channel ID must start with C',
  });
}

export async function promptForScope(): Promise<'global' | 'project'> {
  return select({
    message: 'Where should Signal Flare be configured?',
    choices: [
      { name: 'Global (all Claude Code sessions)', value: 'global' },
      { name: 'Project (this directory only)', value: 'project' },
    ],
  });
}

export async function promptForEnvPath(defaultPath: string): Promise<string> {
  return input({
    message: 'Where should Signal Flare store your credentials?',
    default: defaultPath,
  });
}
```

### dotenv Custom Path Loading (Source: dotenv GitHub README)
```typescript
// src/config.ts — updated startup sequence
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function resolveEnvFilePath(): string | undefined {
  // 1. Check env var set by MCP server config
  if (process.env.SIGNAL_FLARE_ENV_FILE) {
    return process.env.SIGNAL_FLARE_ENV_FILE;
  }
  // 2. Fall back to convention config file (for hook handlers)
  const configFile = path.join(
    process.env.HOME ?? '~',
    '.config', 'signal-flare', 'config.json'
  );
  if (existsSync(configFile)) {
    try {
      const cfg = JSON.parse(readFileSync(configFile, 'utf8'));
      return cfg.envFile;
    } catch { /* ignore */ }
  }
  return undefined;
}

const envFilePath = resolveEnvFilePath();
if (envFilePath) {
  dotenv.config({ path: envFilePath });
}
// Then: ConfigSchema.safeParse(process.env) as before
```

### tsup Config Update (add cli.ts entry)
```typescript
// tsup.config.ts — updated
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hook-handler.ts",
    "src/hooks/watcher.ts",
    "src/cli.ts",           // ADD: CLI binary entry
  ],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

### package.json Updates Required
```json
{
  "name": "signal-flare",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "signal-flare": "./dist/cli.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "@slack/web-api": "^7.14.1",
    "commander": "^14.0.3",
    "dotenv": "^17.3.1",
    "@inquirer/prompts": "^8.2.1",
    "zod": "^3.25.0"
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `inquirer` (classic) | `@inquirer/prompts` (rewrite) | 2023 | ESM-native, better TypeScript, smaller bundle |
| Claude Code `~/.claude/settings.json` for MCP | `~/.claude.json` for MCP servers | 2024-2025 | MCP servers moved to separate file; hooks stay in settings.json |
| Claude Code `--scope global` | `--scope user` | 2025 | Terminology changed; "global" is now "user" |
| SSE transport for MCP | stdio or HTTP | 2025 | SSE deprecated in Claude Code; signal-flare uses stdio which is still correct |

**Deprecated/outdated:**
- `"global"` scope name in Claude Code MCP: replaced by `"user"` scope (old value still works but deprecated)
- Writing MCP servers to `~/.claude/settings.json`: they moved to `~/.claude.json`
- Classic `inquirer` package: replaced by `@inquirer/prompts` for new projects

---

## Open Questions

1. **Hook handler env var discovery**
   - What we know: Hook handlers don't inherit the MCP server's `env` block from `~/.claude.json`
   - What's unclear: Whether Claude Code sets any environment variables that identify the Signal Flare install location when invoking hooks
   - Recommendation: Use the two-tier approach: check `SIGNAL_FLARE_ENV_FILE` env var first (works for MCP server), fall back to `~/.config/signal-flare/config.json` convention file (works for hooks). Write this config file during `signal-flare setup`.

2. **Absolute path to dist/server.js for MCP config**
   - What we know: npm global installs go to `{nvm-node-version}/lib/node_modules/signal-flare/dist/` under NVM
   - What's unclear: Most reliable way to discover this path at wizard runtime
   - Recommendation: At wizard runtime, use `import.meta.url` in `cli.ts` to resolve the package root, then derive `dist/server.js` and `dist/hook-handler.js` paths. This works because cli.ts IS in the package. Cross-check with `which signal-flare` for the binary symlink path.

3. **Project-level wizard scope for hooks vs. MCP**
   - What we know: Project hooks go to `.claude/settings.json`. Project MCP goes to `.mcp.json`.
   - What's unclear: Whether writing to `.mcp.json` requires the `mcpServers` top-level key or a different format
   - Recommendation: Per official docs, `.mcp.json` format is `{ "mcpServers": { ... } }` — same structure as the user-scoped section in `~/.claude.json`. Confirm by inspecting an existing `.mcp.json` if one exists in the workspace.

---

## Sources

### Primary (HIGH confidence)
- Claude Code official MCP docs (https://code.claude.com/docs/en/mcp) — fetched 2026-02-22; confirmed `~/.claude.json` stores user/local MCP servers
- Claude Code official hooks docs (https://code.claude.com/docs/en/hooks) — fetched 2026-02-22; confirmed hooks format in `~/.claude/settings.json` with exact JSON schema
- Claude Code official settings docs (https://code.claude.com/docs/en/settings) — fetched 2026-02-22; confirmed settings.json structure and available fields

### Secondary (MEDIUM confidence)
- npm docs (https://docs.npmjs.com/files/package.json/) — bin field, files field, engines field behavior
- `@inquirer/prompts` README (GitHub) — API examples for input, password, select, confirm
- `dotenv` GitHub (https://github.com/motdotla/dotenv) — custom path via `dotenv.config({ path })`
- npm registry version check — `@inquirer/prompts@8.2.1`, `dotenv@17.3.1`, `commander@14.0.3` (verified live)

### Tertiary (LOW confidence)
- WebSearch results on NVM global package path resolution — not verified against official docs; treat as directional

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified live from npm registry; library choices verified against official docs
- Architecture: HIGH — Claude Code file locations confirmed from official docs (fetched 2026-02-22)
- Pitfalls: HIGH for known pitfalls (bin mismatch, wrong MCP file), MEDIUM for env var discovery (functional approach confirmed, exact Claude Code behavior with hook env not officially documented)
- dotenv custom path: HIGH — verified against dotenv GitHub README

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days; stable APIs; Claude Code settings format changes infrequently)
