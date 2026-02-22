// Tests for src/hooks/permission.ts — handlePermissionRequest and spawnWatcher.
//
// spawnWatcher uses node:child_process.spawn to launch a detached background
// watcher. We mock child_process at the module level to avoid spawning real
// processes during tests.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock for child_process.spawn
// ---------------------------------------------------------------------------

const mockSpawn = vi.hoisted(() => {
  const mockChild = {
    unref: vi.fn(),
  };
  return vi.fn().mockReturnValue(mockChild);
});

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

// Also mock fileURLToPath to avoid ESM URL resolution issues in tests
vi.mock("node:url", () => ({
  fileURLToPath: vi.fn().mockReturnValue("/mock/path/to/watcher.js"),
}));

import { handlePermissionRequest, spawnWatcher } from "./permission.js";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import type { PermissionRequestInput } from "../types.js";

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

const baseFields = {
  session_id: "sess-001",
  transcript_path: "/tmp/transcript.json",
  cwd: "/home/user/project",
  permission_mode: "default",
  hook_event_name: "PermissionRequest" as const,
};

const bashPermissionInput: PermissionRequestInput = {
  ...baseFields,
  tool_name: "Bash",
  tool_input: { command: "rm -rf /tmp/test" },
};

const askHumanInput: PermissionRequestInput = {
  ...baseFields,
  tool_name: "mcp__signal-flare__ask_human_via_slack",
  tool_input: { question: "Should I proceed?", options: ["Yes", "No", "Cancel"] },
};

function makeMockSlackClient(postMessageResult: object = { ok: true, ts: "111.222" }): SlackClient {
  return {
    web: {
      chat: {
        postMessage: vi.fn().mockResolvedValue(postMessageResult),
      },
    } as unknown as SlackClient["web"],
    botUserId: "",
    channelId: "C12345678",
  };
}

// ---------------------------------------------------------------------------
// spawnWatcher
// ---------------------------------------------------------------------------

describe("spawnWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls spawn with the watcher path, transcriptPath, threadTs, channelId", () => {
    spawnWatcher("/tmp/transcript.json", "111.222", "C12345678");
    expect(mockSpawn).toHaveBeenCalledOnce();
    // [execPath, args, options]
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const spawnOptions = mockSpawn.mock.calls[0][2] as { detached: boolean; stdio: string };
    expect(spawnArgs).toContain("/tmp/transcript.json");
    expect(spawnArgs).toContain("111.222");
    expect(spawnArgs).toContain("C12345678");
    expect(spawnOptions.detached).toBe(true);
    expect(spawnOptions.stdio).toBe("ignore");
  });

  it("calls child.unref() to allow parent process to exit", () => {
    spawnWatcher("/tmp/t.json", "ts", "C1");
    // Get the latest child mock
    const latestChild = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value;
    expect(latestChild.unref).toHaveBeenCalled();
  });

  it("does not throw if spawn throws an error", () => {
    mockSpawn.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });
    expect(() => spawnWatcher("/tmp/t.json", "ts", "C1")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handlePermissionRequest — non-AskHuman tool (PERMISSION notification)
// ---------------------------------------------------------------------------

describe("handlePermissionRequest — Bash tool (non-ask-human)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls chat.postMessage once", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    expect(slackClient.web.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("sends to correct channel", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    expect(callArgs.channel).toBe("C12345678");
  });

  it("sends a PERMISSION notification (orange color bar)", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    expect(callArgs.attachments[0].color).toBe("#FFA500");
  });

  it("headline mentions the tool name", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find((b) => b.type === "section");
    expect(headlineSection?.text?.text).toContain("Bash");
  });

  it("spawns watcher when postMessage succeeds (ok: true, ts provided)", async () => {
    const slackClient = makeMockSlackClient({ ok: true, ts: "999.111" });
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    expect(mockSpawn).toHaveBeenCalled();
  });

  it("does not spawn watcher when postMessage returns ok: false", async () => {
    const slackClient = makeMockSlackClient({ ok: false });
    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not throw when Slack API call rejects", async () => {
    const slackClient = {
      ...makeMockSlackClient(),
      web: {
        chat: {
          postMessage: vi.fn().mockRejectedValue(new Error("Slack error")),
        },
      } as unknown as SlackClient["web"],
    };
    await expect(
      handlePermissionRequest(bashPermissionInput, slackClient, mockConfig)
    ).resolves.toBeUndefined();
  });

  it("logs error to stderr when Slack API call fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const slackClient = {
      ...makeMockSlackClient(),
      web: {
        chat: {
          postMessage: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      } as unknown as SlackClient["web"],
    };

    await handlePermissionRequest(bashPermissionInput, slackClient, mockConfig);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[signal-flare hook]"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handlePermissionRequest — ask_human_via_slack tool (QUESTION notification)
// ---------------------------------------------------------------------------

describe("handlePermissionRequest — ask_human_via_slack tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls chat.postMessage with a QUESTION notification", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(askHumanInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    // Header should contain "Claude needs your input" (QUESTION label)
    const blocks = callArgs.attachments[0].blocks;
    const header = blocks[0];
    expect(header.text!.text).toContain("Claude needs your input");
  });

  it("headline contains the question text", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(askHumanInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find((b) => b.type === "section");
    expect(headlineSection?.text?.text).toContain("Should I proceed?");
  });

  it("includes numbered options in body", async () => {
    const slackClient = makeMockSlackClient();
    await handlePermissionRequest(askHumanInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    // Find section block containing options
    const optionsSection = blocks.find(
      (b) => b.type === "section" && b.text?.text?.includes("Yes")
    );
    expect(optionsSection?.text?.text).toContain("Yes");
    expect(optionsSection?.text?.text).toContain("No");
    expect(optionsSection?.text?.text).toContain("Cancel");
  });

  it("uses .includes() matching — tool name containing ask_human_via_slack triggers QUESTION path", async () => {
    const slackClient = makeMockSlackClient();
    // Simulate MCP-prefixed tool name
    const mcpInput: PermissionRequestInput = {
      ...askHumanInput,
      tool_name: "mcp__my-server__ask_human_via_slack",
    };
    await handlePermissionRequest(mcpInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const header = blocks[0];
    // QUESTION label used
    expect(header.text!.text).toContain("Claude needs your input");
  });

  it("spawns watcher after QUESTION notification when postMessage succeeds", async () => {
    const slackClient = makeMockSlackClient({ ok: true, ts: "222.333" });
    await handlePermissionRequest(askHumanInput, slackClient, mockConfig);
    expect(mockSpawn).toHaveBeenCalled();
    // Verify watcher receives transcript path and thread ts
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain("/tmp/transcript.json");
    expect(spawnArgs).toContain("222.333");
    expect(spawnArgs).toContain("C12345678");
  });

  it("handles missing options field in tool_input gracefully", async () => {
    const slackClient = makeMockSlackClient();
    const noOptionsInput: PermissionRequestInput = {
      ...askHumanInput,
      tool_input: { question: "What do you want?" },
    };
    await expect(
      handlePermissionRequest(noOptionsInput, slackClient, mockConfig)
    ).resolves.toBeUndefined();
    expect(slackClient.web.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("uses fallback question text when question field is missing from tool_input", async () => {
    const slackClient = makeMockSlackClient();
    const noQuestionInput: PermissionRequestInput = {
      ...askHumanInput,
      tool_input: {},
    };
    await handlePermissionRequest(noQuestionInput, slackClient, mockConfig);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find((b) => b.type === "section");
    // Falls back to "Question from Claude"
    expect(headlineSection?.text?.text).toContain("Question from Claude");
  });

  it("includes @mention when config has SLACK_USER_ID", async () => {
    const slackClient = makeMockSlackClient();
    const configWithUser: Config = { ...mockConfig, SLACK_USER_ID: "U88888888" };
    await handlePermissionRequest(askHumanInput, slackClient, configWithUser);
    const callArgs = getCallArgs(vi.mocked(slackClient.web.chat.postMessage));
    const blocks = callArgs.attachments[0].blocks;
    const headlineSection = blocks.find((b) => b.type === "section");
    expect(headlineSection?.text?.text).toContain("<@U88888888>");
  });
});
