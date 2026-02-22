// Tests for src/hooks/stop.ts — extractSummary and handleStop.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractSummary, handleStop } from "./stop.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import type { StopHookInput } from "../types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockConfig: Config = {
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_CHANNEL_ID: "C12345678",
  SEND_DELAY_MS: 0,
  POLL_TIMEOUT_MS: 600000,
  HOOK_IDLE_TIMEOUT_MS: 90000,
};

const baseInput: StopHookInput = {
  session_id: "sess-001",
  transcript_path: "/tmp/transcript.json",
  cwd: "/home/user/project",
  permission_mode: "default",
  hook_event_name: "Stop",
  stop_hook_active: false,
  last_assistant_message: "All tasks completed successfully.",
};

function makeMockSlackClient(postMessageImpl?: () => Promise<unknown>): SlackClient {
  return {
    web: {
      chat: {
        postMessage: vi.fn().mockImplementation(
          postMessageImpl ?? (() => Promise.resolve({ ok: true, ts: "111.222" }))
        ),
      },
    } as unknown as SlackClient["web"],
    botUserId: "",
    channelId: "C12345678",
  };
}

// ---------------------------------------------------------------------------
// extractSummary
// ---------------------------------------------------------------------------

describe("extractSummary", () => {
  it("returns first sentence ending with period", () => {
    const result = extractSummary("Task done. More details follow.");
    expect(result).toBe("Task done.");
  });

  it("returns first sentence ending with exclamation mark", () => {
    const result = extractSummary("Done! And more text after.");
    expect(result).toBe("Done!");
  });

  it("returns first sentence ending with question mark", () => {
    const result = extractSummary("Is it done? Let me check.");
    expect(result).toBe("Is it done?");
  });

  it("returns fallback message for empty string", () => {
    expect(extractSummary("")).toBe("Task completed (no summary available)");
  });

  it("returns fallback message for whitespace-only string", () => {
    expect(extractSummary("   ")).toBe("Task completed (no summary available)");
  });

  it("truncates first sentence to 200 chars with ellipsis when too long", () => {
    const longSentence = "A".repeat(250) + ".";
    const result = extractSummary(longSentence);
    expect(result).toBe("A".repeat(200) + "...");
  });

  it("returns full text up to 200 chars when no sentence delimiter is found", () => {
    const noDelimiter = "No sentence delimiter here";
    const result = extractSummary(noDelimiter);
    expect(result).toBe("No sentence delimiter here");
  });

  it("truncates to 200 chars with ellipsis when no sentence delimiter and text > 200 chars", () => {
    const longText = "B".repeat(250);
    const result = extractSummary(longText);
    expect(result).toBe("B".repeat(200) + "...");
  });

  it("handles text that is exactly 200 chars without truncation", () => {
    const exactText = "C".repeat(200) + ".";
    const result = extractSummary(exactText);
    // The first sentence is 201 chars (200 Cs + period), truncates at 200
    expect(result).toBe("C".repeat(200) + "...");
  });

  it("handles text with sentence delimited at exactly 200 chars", () => {
    const sentence200 = "D".repeat(199) + ".";
    const result = extractSummary(sentence200 + " More text.");
    // 200-char sentence — should fit exactly within limit
    expect(result).toBe("D".repeat(199) + ".");
  });
});

// ---------------------------------------------------------------------------
// handleStop
// ---------------------------------------------------------------------------

describe("handleStop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls chat.postMessage with the extracted summary as text", async () => {
    const slackClient = makeMockSlackClient();
    await handleStop(baseInput, slackClient, mockConfig);

    expect(slackClient.web.chat.postMessage).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(slackClient.web.chat.postMessage).mock.calls[0][0];
    expect(callArgs.text).toBe("All tasks completed successfully.");
    expect(callArgs.channel).toBe("C12345678");
  });

  it("sends a COMPLETED notification — attachments have orange color bar", async () => {
    const slackClient = makeMockSlackClient();
    await handleStop(baseInput, slackClient, mockConfig);

    const callArgs = vi.mocked(slackClient.web.chat.postMessage).mock.calls[0][0];
    // buildHookMessage always uses #FFA500 for hook notifications
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments[0].color).toBe("#FFA500");
  });

  it("early-returns without calling postMessage when stop_hook_active is true", async () => {
    const slackClient = makeMockSlackClient();
    const activeInput: StopHookInput = { ...baseInput, stop_hook_active: true };

    await handleStop(activeInput, slackClient, mockConfig);
    expect(slackClient.web.chat.postMessage).not.toHaveBeenCalled();
  });

  it("includes @mention in headline when config has SLACK_USER_ID", async () => {
    const slackClient = makeMockSlackClient();
    const configWithUser: Config = { ...mockConfig, SLACK_USER_ID: "U99999999" };

    await handleStop(baseInput, slackClient, configWithUser);

    const callArgs = vi.mocked(slackClient.web.chat.postMessage).mock.calls[0][0];
    // The headline section in attachments should include the @mention
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find(
      (b: { type: string }) => b.type === "section"
    );
    expect(headlineSection.text.text).toContain("<@U99999999>");
  });

  it("does not throw when Slack API call rejects", async () => {
    const slackClient = makeMockSlackClient(() =>
      Promise.reject(new Error("Slack API error"))
    );
    await expect(handleStop(baseInput, slackClient, mockConfig)).resolves.toBeUndefined();
  });

  it("logs error to stderr when Slack API call fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const slackClient = makeMockSlackClient(() =>
      Promise.reject(new Error("Network failure"))
    );

    await handleStop(baseInput, slackClient, mockConfig);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[signal-flare hook]"),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("uses last_assistant_message for summary extraction", async () => {
    const slackClient = makeMockSlackClient();
    const input: StopHookInput = {
      ...baseInput,
      last_assistant_message: "Refactored the database schema. Old tables removed.",
    };

    await handleStop(input, slackClient, mockConfig);

    const callArgs = vi.mocked(slackClient.web.chat.postMessage).mock.calls[0][0];
    // extractSummary takes only the first sentence
    expect(callArgs.text).toBe("Refactored the database schema.");
  });
});
