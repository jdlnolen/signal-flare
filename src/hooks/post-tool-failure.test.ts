// Tests for src/hooks/post-tool-failure.ts — extractToolContext and handlePostToolUseFailure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractToolContext, handlePostToolUseFailure } from "./post-tool-failure.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import type { PostToolUseFailureInput } from "../types.js";

// Type helper for accessing Slack Block Kit fields without strict API type constraints
type SlackCallArgs = {
  channel: string;
  text: string;
  attachments: Array<{
    color: string;
    blocks: Array<{ type: string; text?: { type?: string; text: string } }>;
  }>;
};

function getCallArgs(mockFn: ReturnType<typeof vi.fn>): SlackCallArgs {
  return mockFn.mock.calls[0][0] as unknown as SlackCallArgs;
}

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

const baseInput: PostToolUseFailureInput = {
  session_id: "sess-001",
  transcript_path: "/tmp/transcript.json",
  cwd: "/home/user/project",
  permission_mode: "default",
  hook_event_name: "PostToolUseFailure",
  tool_name: "Bash",
  tool_input: { command: "ls /nonexistent" },
  tool_use_id: "tool-001",
  error: "No such file or directory",
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
// extractToolContext
// ---------------------------------------------------------------------------

describe("extractToolContext", () => {
  it("returns the Bash command for Bash tool", () => {
    const result = extractToolContext("Bash", { command: "ls -la" });
    expect(result).toBe("ls -la");
  });

  it("truncates Bash command to 500 chars with ellipsis", () => {
    const longCommand = "x".repeat(600);
    const result = extractToolContext("Bash", { command: longCommand });
    expect(result).toBe("x".repeat(500) + "...");
  });

  it("returns empty string for Bash with no command field", () => {
    const result = extractToolContext("Bash", {});
    expect(result).toBe("");
  });

  it("returns file_path for Write tool", () => {
    const result = extractToolContext("Write", { file_path: "/src/app.ts" });
    expect(result).toBe("/src/app.ts");
  });

  it("returns file_path for Edit tool", () => {
    const result = extractToolContext("Edit", { file_path: "/src/app.ts" });
    expect(result).toBe("/src/app.ts");
  });

  it("returns file_path for Read tool", () => {
    const result = extractToolContext("Read", { file_path: "/src/app.ts" });
    expect(result).toBe("/src/app.ts");
  });

  it("returns first 3 keys as JSON for MCP tools (tool name contains mcp__)", () => {
    const result = extractToolContext("mcp__signal-flare__ask_human_via_slack", {
      question: "What?",
      urgency: "high",
      context: "some ctx",
      extra: "extra field",
    });
    // Should contain first 3 keys, not the 4th
    const parsed = JSON.parse(result.replace("...", ""));
    expect(parsed).toHaveProperty("question");
    expect(parsed).toHaveProperty("urgency");
    expect(parsed).toHaveProperty("context");
    expect(parsed).not.toHaveProperty("extra");
  });

  it("truncates MCP tool JSON to 300 chars with ellipsis when very long", () => {
    const bigInput: Record<string, unknown> = {};
    for (let i = 0; i < 3; i++) {
      bigInput[`key${i}`] = "v".repeat(200);
    }
    const result = extractToolContext("mcp__tool__name", bigInput);
    expect(result.length).toBeLessThanOrEqual(303); // 300 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns JSON.stringify for unknown tool names", () => {
    const result = extractToolContext("MyCustomTool", { foo: "bar" });
    expect(result).toBe('{"foo":"bar"}');
  });

  it("truncates default JSON to 300 chars with ellipsis for unknown tools", () => {
    const bigInput = { data: "z".repeat(400) };
    const result = extractToolContext("SomeTool", bigInput);
    expect(result.length).toBeLessThanOrEqual(303);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUseFailure
// ---------------------------------------------------------------------------

describe("handlePostToolUseFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls chat.postMessage once", async () => {
    const slackClient = makeMockSlackClient();
    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    expect(slackClient.web.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("sends to the correct channel", async () => {
    const slackClient = makeMockSlackClient();
    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    expect(callArgs.channel).toBe("C12345678");
  });

  it("text mentions the tool name", async () => {
    const slackClient = makeMockSlackClient();
    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    expect(callArgs.text).toContain("Bash");
  });

  it("attachments have orange color bar (ERROR notification)", async () => {
    const slackClient = makeMockSlackClient();
    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    expect(callArgs.attachments[0].color).toBe("#FFA500");
  });

  it("error text appears in the attachments body", async () => {
    const slackClient = makeMockSlackClient();
    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const bodySection = blocks.find(
      (b) => b.type === "section" && b.text?.text === "No such file or directory"
    );
    expect(bodySection).toBeDefined();
  });

  it("truncates error text to 1000 chars with ellipsis", async () => {
    const slackClient = makeMockSlackClient();
    const longError = "E".repeat(1500);
    const input: PostToolUseFailureInput = { ...baseInput, error: longError };

    await handlePostToolUseFailure(input, slackClient, mockConfig);

    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    // The body section is the section block whose text matches the (truncated) error content.
    // The headline section contains "Bash failed"; the body section contains the error text.
    const sectionBlocks = blocks.filter((b) => b.type === "section");
    // body is the last section block (after headline)
    const bodySection = sectionBlocks[sectionBlocks.length - 1];
    const errorText = bodySection?.text?.text ?? "";
    expect(errorText.length).toBeLessThanOrEqual(1003); // 1000 + "..."
    expect(errorText.endsWith("...")).toBe(true);
  });

  it("includes @mention when config has SLACK_USER_ID", async () => {
    const slackClient = makeMockSlackClient();
    const configWithUser: Config = { ...mockConfig, SLACK_USER_ID: "U99999999" };

    await handlePostToolUseFailure(baseInput, slackClient, configWithUser);

    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find(
      (b) => b.type === "section" && b.text?.text?.includes("Bash failed")
    );
    expect(headlineSection?.text?.text).toContain("<@U99999999>");
  });

  it("does not throw when Slack API call rejects", async () => {
    const slackClient = makeMockSlackClient(() => Promise.reject(new Error("Slack API error")));
    await expect(
      handlePostToolUseFailure(baseInput, slackClient, mockConfig)
    ).resolves.toBeUndefined();
  });

  it("logs error to stderr when Slack API call fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const slackClient = makeMockSlackClient(() =>
      Promise.reject(new Error("Network failure"))
    );

    await handlePostToolUseFailure(baseInput, slackClient, mockConfig);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[signal-flare hook]"),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("handles missing tool_name gracefully (no crash)", async () => {
    const slackClient = makeMockSlackClient();
    const input: PostToolUseFailureInput = { ...baseInput, tool_name: "" };
    await expect(
      handlePostToolUseFailure(input, slackClient, mockConfig)
    ).resolves.toBeUndefined();
  });
});
