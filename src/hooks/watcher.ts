// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { createSlackClientDirect } from "../slack/client.js";
import { buildResolvedInTerminalMessage } from "../slack/messages.js";

/**
 * Watcher log file path for debugging detached process errors.
 * Written to ~/.claude/signal-flare-watcher.log for debuggability
 * (per research pitfall 3 — stderr is detached and invisible).
 */
const WATCHER_LOG = join(homedir(), ".claude", "signal-flare-watcher.log");

/**
 * Appends a log entry to the watcher log file with timestamp.
 * Swallows errors — log writes must never crash the watcher.
 */
function watcherLog(message: string): void {
  try {
    const ts = new Date().toISOString();
    appendFileSync(WATCHER_LOG, `[${ts}] ${message}\n`, "utf8");
  } catch {
    // Ignore — cannot log errors about failing to log
  }
}

/**
 * Counts the number of non-empty lines in a string.
 */
function countLines(content: string): number {
  return content.split("\n").filter((l) => l.trim().length > 0).length;
}

/**
 * Checks whether any of the new lines in the transcript contain a human/user message.
 * Parses each line as JSON (JSONL format) — skips malformed lines defensively.
 */
function hasHumanMessage(lines: string[]): boolean {
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      // Be defensive — try both "role" field values used by different Claude Code versions
      const role = parsed.role as string | undefined;
      if (role === "human" || role === "user") {
        return true;
      }
    } catch {
      // Skip malformed JSONL lines
    }
  }
  return false;
}

(async () => {
  try {
    const [transcriptPath, threadTs, channelId] = process.argv.slice(2);

    if (!transcriptPath || !threadTs || !channelId) {
      watcherLog("Missing required arguments — exiting");
      process.exit(1);
    }

    const config = loadConfig();
    const slackClient = createSlackClientDirect(config);

    // Read initial transcript state
    let initialContent: string;
    try {
      initialContent = readFileSync(transcriptPath, "utf8");
    } catch (err) {
      watcherLog(
        `Cannot read transcript at ${transcriptPath}: ${String(err)} — exiting gracefully`
      );
      process.exit(0);
    }

    const initialLines = initialContent.split("\n");
    const initialLineCount = countLines(initialContent);

    watcherLog(
      `Watcher started — transcript: ${transcriptPath}, thread: ${threadTs}, initial lines: ${initialLineCount}`
    );

    const pollIntervalMs = 5000;
    const startEpoch = Date.now();
    const timeoutMs = config.HOOK_IDLE_TIMEOUT_MS;

    while (Date.now() - startEpoch < timeoutMs) {
      await new Promise<void>((r) => setTimeout(r, pollIntervalMs));

      // Re-read transcript
      let currentContent: string;
      try {
        currentContent = readFileSync(transcriptPath, "utf8");
      } catch {
        // Transcript may have been moved/deleted — exit gracefully
        watcherLog("Transcript no longer readable — exiting gracefully");
        process.exit(0);
      }

      const currentLineCount = countLines(currentContent);

      if (currentLineCount > initialLineCount) {
        // New lines appeared — check for human messages
        const currentLines = currentContent.split("\n");
        const newLines = currentLines.slice(initialLines.length);

        if (hasHumanMessage(newLines)) {
          watcherLog("Terminal response detected — posting thread reply");
          try {
            await slackClient.web.chat.postMessage({
              channel: channelId,
              thread_ts: threadTs,
              ...buildResolvedInTerminalMessage(),
            });
          } catch (err) {
            watcherLog(`Failed to post resolved-in-terminal reply: ${String(err)}`);
          }
          process.exit(0);
        }
      }
    }

    // Timeout reached — no terminal response detected within HOOK_IDLE_TIMEOUT_MS
    watcherLog(
      `Watcher timeout after ${timeoutMs}ms — no terminal response detected, exiting silently`
    );
    process.exit(0);
  } catch (err) {
    try {
      watcherLog(`Watcher fatal error: ${String(err)}`);
    } catch {
      // Swallow
    }
    console.error("[signal-flare watcher] Fatal error:", err);
    process.exit(1);
  }
})();
