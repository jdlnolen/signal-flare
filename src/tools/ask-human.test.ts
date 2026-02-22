import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test.
// Use vi.hoisted() to create mocks accessible inside vi.mock factories.
// ---------------------------------------------------------------------------

const { mockPollForReply, mockSleep } = vi.hoisted(() => ({
  mockPollForReply: vi.fn(),
  mockSleep: vi.fn().mockResolvedValue(undefined),
}));

const {
  mockBuildQuestionMessage,
  mockBuildStillWaitingMessage,
  mockBuildTimeoutMessage,
  mockBuildResponseReceivedMessage,
} = vi.hoisted(() => ({
  mockBuildQuestionMessage: vi.fn().mockReturnValue({ attachments: [] }),
  mockBuildStillWaitingMessage: vi.fn().mockReturnValue({ text: "still waiting" }),
  mockBuildTimeoutMessage: vi.fn().mockReturnValue({ text: "timed out" }),
  mockBuildResponseReceivedMessage: vi.fn().mockReturnValue({ text: "response received" }),
}));

vi.mock("../slack/poller.js", () => ({
  pollForReply: mockPollForReply,
  sleep: mockSleep,
}));

vi.mock("../slack/messages.js", () => ({
  buildQuestionMessage: mockBuildQuestionMessage,
  buildStillWaitingMessage: mockBuildStillWaitingMessage,
  buildTimeoutMessage: mockBuildTimeoutMessage,
  buildResponseReceivedMessage: mockBuildResponseReceivedMessage,
}));

// Import after mocks
import { registerAskHumanTool } from "./ask-human.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Captures the tool handler function registered via server.registerTool().
 * Returns the handler so tests can invoke it directly.
 */
function captureToolHandler(
  slackClient: SlackClient,
  config: Config
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

  const mockServer = {
    registerTool: vi.fn(
      (
        _name: string,
        _config: unknown,
        handler: (args: Record<string, unknown>) => Promise<unknown>
      ) => {
        capturedHandler = handler;
      }
    ),
  };

  registerAskHumanTool(mockServer as never, slackClient, config);

  if (!capturedHandler) {
    throw new Error("Tool handler was not registered");
  }

  return capturedHandler;
}

function createMockPostMessage(opts: { ok?: boolean; ts?: string; error?: string } = {}) {
  const { ok = true, ts = "1700000000.000001", error } = opts;
  return vi.fn().mockResolvedValue({ ok, ts, error });
}

function makeSlackClient(postMessageMock = createMockPostMessage()): SlackClient {
  return {
    web: {
      chat: {
        postMessage: postMessageMock,
      },
    } as unknown as SlackClient["web"],
    botUserId: "U_BOT",
    channelId: "C_TEST",
  };
}

const baseConfig: Config = {
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_CHANNEL_ID: "C_TEST",
  SLACK_USER_ID: undefined,
  SEND_DELAY_MS: 0,
  POLL_TIMEOUT_MS: 100,
  HOOK_IDLE_TIMEOUT_MS: 90000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ask_human_via_slack tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSleep.mockResolvedValue(undefined);
  });

  describe("normal flow: question posted → poll returns human reply", () => {
    it("returns reply text from Slack in structured JSON", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "Yes, proceed with that approach",
        user: "U_HUMAN",
        ts: "1700000001.0",
        elapsedMs: 5000,
      });

      const postMessage = createMockPostMessage({ ok: true, ts: "1700000000.0" });
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      const result = (await handler({ question: "Should I proceed?", urgency: "normal" })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reply).toBe("Yes, proceed with that approach");
      expect(parsed.replied_by).toBe("U_HUMAN");
      expect(typeof parsed.response_time_ms).toBe("number");
    });

    it("posts the question to the correct channel", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "OK",
        user: "U_HUMAN",
        elapsedMs: 100,
      });

      const postMessage = createMockPostMessage();
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      await handler({ question: "Are you ready?", urgency: "normal" });

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "C_TEST", text: "Are you ready?" })
      );
    });

    it("calls buildQuestionMessage with the question params", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "Looks good",
        user: "U_HUMAN",
        elapsedMs: 50,
      });

      const slackClient = makeSlackClient();
      const handler = captureToolHandler(slackClient, baseConfig);

      await handler({ question: "Check this code?", context: "file.ts:42", urgency: "high" });

      expect(mockBuildQuestionMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          question: "Check this code?",
          context: "file.ts:42",
          urgency: "high",
        }),
        undefined // SLACK_USER_ID is undefined in baseConfig
      );
    });

    it("posts response-received notice after getting a reply", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "Done",
        user: "U_HUMAN",
        elapsedMs: 200,
      });

      const postMessage = createMockPostMessage();
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      await handler({ question: "Finished?", urgency: "normal" });

      // postMessage called twice: first for question, second for response-received
      expect(postMessage).toHaveBeenCalledTimes(2);
      const secondCall = postMessage.mock.calls[1][0];
      expect(secondCall).toMatchObject({ channel: "C_TEST" });
    });
  });

  describe("urgency levels", () => {
    it("passes urgency: high through to buildQuestionMessage", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "Urgent reply",
        user: "U_H",
        elapsedMs: 10,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      await handler({ question: "Urgent?", urgency: "high" });

      expect(mockBuildQuestionMessage).toHaveBeenCalledWith(
        expect.objectContaining({ urgency: "high" }),
        undefined
      );
    });

    it("passes urgency: low through to buildQuestionMessage", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "Low reply",
        user: "U_H",
        elapsedMs: 10,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      await handler({ question: "Low priority?", urgency: "low" });

      expect(mockBuildQuestionMessage).toHaveBeenCalledWith(
        expect.objectContaining({ urgency: "low" }),
        undefined
      );
    });
  });

  describe("options handling", () => {
    it("passes options array through to buildQuestionMessage", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "2",
        user: "U_HUMAN",
        elapsedMs: 100,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      await handler({
        question: "Which approach?",
        options: ["Option A", "Option B", "Option C"],
        urgency: "normal",
      });

      expect(mockBuildQuestionMessage).toHaveBeenCalledWith(
        expect.objectContaining({ options: ["Option A", "Option B", "Option C"] }),
        undefined
      );
    });

    it("resolves selected_option when user replies with a number", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "2",
        user: "U_HUMAN",
        elapsedMs: 100,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      const result = (await handler({
        question: "Which approach?",
        options: ["Option A", "Option B", "Option C"],
        urgency: "normal",
      })) as { content: Array<{ text: string }> };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.selected_option).toBe("Option B");
      expect(parsed.selected_option_index).toBe(1);
    });

    it("returns null selected_option when reply is not a number", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "I prefer the second one actually",
        user: "U_HUMAN",
        elapsedMs: 100,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      const result = (await handler({
        question: "Which approach?",
        options: ["Option A", "Option B"],
        urgency: "normal",
      })) as { content: Array<{ text: string }> };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.selected_option).toBeNull();
      expect(parsed.selected_option_index).toBeNull();
    });
  });

  describe("poll timeout flow", () => {
    it("returns isError:true when first poll times out and second poll times out", async () => {
      // Both polling windows time out
      mockPollForReply.mockResolvedValue({ found: false, elapsedMs: 100 });

      const postMessage = createMockPostMessage();
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      const result = (await handler({ question: "Any reply?", urgency: "normal" })) as {
        content: Array<{ text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toMatch(/[Tt]imeout/);
    });

    it("posts still-waiting bump between first and second timeout", async () => {
      mockPollForReply.mockResolvedValue({ found: false, elapsedMs: 100 });

      const postMessage = createMockPostMessage();
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      await handler({ question: "Waiting?", urgency: "normal" });

      // Should post: question, still-waiting, timeout notice
      expect(mockBuildStillWaitingMessage).toHaveBeenCalledTimes(1);
      expect(mockBuildTimeoutMessage).toHaveBeenCalledTimes(1);
    });

    it("succeeds if second poll window returns a reply", async () => {
      // First poll: timeout, second poll: human reply
      mockPollForReply
        .mockResolvedValueOnce({ found: false, elapsedMs: 600000 })
        .mockResolvedValueOnce({
          found: true,
          text: "Sorry, late reply!",
          user: "U_HUMAN",
          elapsedMs: 100,
        });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      const result = (await handler({ question: "Are you there?", urgency: "normal" })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reply).toBe("Sorry, late reply!");
    });
  });

  describe("Slack API errors", () => {
    it("returns isError:true when chat.postMessage throws", async () => {
      const postMessage = vi.fn().mockRejectedValue(new Error("Slack API down"));
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      const result = (await handler({ question: "Hello?", urgency: "normal" })) as {
        content: Array<{ text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toMatch(/[Ff]ailed to post/);
    });

    it("returns isError:true when postMessage returns ok=false", async () => {
      const postMessage = createMockPostMessage({
        ok: false,
        ts: undefined,
        error: "channel_not_found",
      });
      const slackClient = makeSlackClient(postMessage);
      const handler = captureToolHandler(slackClient, baseConfig);

      const result = (await handler({ question: "Hello?", urgency: "normal" })) as {
        content: Array<{ text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
    });
  });

  describe("SEND_DELAY_MS", () => {
    it("calls sleep when SEND_DELAY_MS > 0", async () => {
      const configWithDelay = { ...baseConfig, SEND_DELAY_MS: 50 };
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "OK",
        user: "U_HUMAN",
        elapsedMs: 10,
      });

      const handler = captureToolHandler(makeSlackClient(), configWithDelay);
      await handler({ question: "Delayed?", urgency: "normal" });

      expect(mockSleep).toHaveBeenCalledWith(50);
    });

    it("does NOT call sleep when SEND_DELAY_MS is 0", async () => {
      mockPollForReply.mockResolvedValue({
        found: true,
        text: "OK",
        user: "U_HUMAN",
        elapsedMs: 10,
      });

      const handler = captureToolHandler(makeSlackClient(), baseConfig);
      await handler({ question: "Immediate?", urgency: "normal" });

      expect(mockSleep).not.toHaveBeenCalled();
    });
  });
});
