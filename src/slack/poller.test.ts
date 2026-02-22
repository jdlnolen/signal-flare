import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebClient } from "@slack/web-api";
import { pollForReply, sleep } from "./poller.js";

// Minimal WebClient mock factory
function createMockWebClient(repliesResponses: Array<{ messages?: object[] }>): WebClient {
  let callCount = 0;
  return {
    conversations: {
      replies: vi.fn().mockImplementation(() => {
        const response = repliesResponses[Math.min(callCount, repliesResponses.length - 1)];
        callCount++;
        return Promise.resolve(response);
      }),
    },
  } as unknown as WebClient;
}

// Tiny timing params for fast tests
const FAST_OPTS = { initialDelayMs: 5, maxDelayMs: 10, multiplier: 1.5 };

const CHANNEL_ID = "C_TEST";
const THREAD_TS = "1000.0000";
const BOT_USER_ID = "U_BOT";

describe("sleep", () => {
  it("resolves after approximately the given duration", async () => {
    const start = Date.now();
    await sleep(20);
    const elapsed = Date.now() - start;
    // Should have waited at least 15ms (generous tolerance for test environments)
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it("resolves immediately when given 0ms", async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe("pollForReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // ROADMAP REQUIREMENT: Thread containing only bot messages returns found:false
  // This is the specific test case required by the roadmap: "polling loop must
  // verify that a thread containing only bot messages returns null (no false
  // positive self-detection)".
  // =========================================================================
  it("bot messages returns found:false when thread contains only bot messages", async () => {
    const botOnlyMessages = [
      // Root message (threadTs) — should be skipped
      { ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" },
      // Bot reply — should be filtered out
      { ts: "1000.0001", text: "I am a bot reply", bot_id: "B_OTHER" },
      // Another bot reply — should also be filtered
      { ts: "1000.0002", text: "Another bot message", bot_id: "B_SAME" },
    ];

    const client = createMockWebClient([{ messages: botOnlyMessages }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 60, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("returns found:true with reply text when a valid human reply is present", async () => {
    const messagesWithHumanReply = [
      { ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" },
      { ts: "1000.0001", text: "This is my answer", user: "U_HUMAN" },
    ];

    const client = createMockWebClient([{ messages: messagesWithHumanReply }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(result.found).toBe(true);
    expect(result.text).toBe("This is my answer");
    expect(result.user).toBe("U_HUMAN");
  });

  it("filters out self-messages where user === botUserId even without bot_id", async () => {
    const messagesWithSelfReply = [
      { ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" },
      // Self-message: user matches botUserId but no bot_id set
      { ts: "1000.0001", text: "I replied to myself", user: BOT_USER_ID },
    ];

    const client = createMockWebClient([{ messages: messagesWithSelfReply }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 60, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("filters out messages with type === bot_message even without bot_id", async () => {
    const messagesWithBotType = [
      { ts: THREAD_TS, text: "Question posted" },
      { ts: "1000.0001", text: "Legacy bot message", type: "bot_message" },
    ];

    const client = createMockWebClient([{ messages: messagesWithBotType }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 60, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("returns found:false when thread is empty (only root message) after timeout", async () => {
    // Only the root message — no replies
    const emptyThread = [{ ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" }];

    const client = createMockWebClient([{ emptyThread }]);
    // Use a very short timeout to keep test fast
    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 30, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("skips non-substantive replies (pure emoji)", async () => {
    const messagesWithEmojiOnly = [
      { ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" },
      // Pure emoji — should be filtered by isSubstantiveReply
      { ts: "1000.0001", text: "👍", user: "U_HUMAN" },
      // Substantive reply comes later
      { ts: "1000.0002", text: "Sure, go ahead", user: "U_HUMAN" },
    ];

    const client = createMockWebClient([{ messages: messagesWithEmojiOnly }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(result.found).toBe(true);
    // Should return the substantive reply, not the emoji
    expect(result.text).toBe("Sure, go ahead");
  });

  it("accepts allowlisted single-word acknowledgments as substantive", async () => {
    const messagesWithYes = [
      { ts: THREAD_TS, text: "Question posted", bot_id: "B_APP" },
      { ts: "1000.0001", text: "yes", user: "U_HUMAN" },
    ];

    const client = createMockWebClient([{ messages: messagesWithYes }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(result.found).toBe(true);
    expect(result.text).toBe("yes");
  });

  it("calls conversations.replies multiple times (polling loop)", async () => {
    // First two calls return only bot messages, third returns a human reply
    const botOnlyMessages = [
      { ts: THREAD_TS, bot_id: "B_APP", text: "Root" },
      { ts: "1000.0001", bot_id: "B_OTHER", text: "bot reply" },
    ];
    const humanReply = [
      { ts: THREAD_TS, bot_id: "B_APP", text: "Root" },
      { ts: "1000.0002", user: "U_HUMAN", text: "Finally here" },
    ];

    let callCount = 0;
    const mockReplies = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({ messages: botOnlyMessages });
      }
      return Promise.resolve({ messages: humanReply });
    });

    const client = {
      conversations: { replies: mockReplies },
    } as unknown as WebClient;

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(mockReplies).toHaveBeenCalledTimes(3);
    expect(result.found).toBe(true);
    expect(result.text).toBe("Finally here");
  });

  it("returns elapsedMs in the result", async () => {
    const messagesWithHumanReply = [
      { ts: THREAD_TS, bot_id: "B_APP", text: "Root" },
      { ts: "1000.0001", user: "U_HUMAN", text: "Hello" },
    ];

    const client = createMockWebClient([{ messages: messagesWithHumanReply }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(result.elapsedMs).toBeDefined();
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("handles conversations.replies API error gracefully (continues polling)", async () => {
    let callCount = 0;
    const mockReplies = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Slack API error"));
      }
      return Promise.resolve({
        messages: [
          { ts: THREAD_TS, bot_id: "B_APP", text: "Root" },
          { ts: "1000.0001", user: "U_HUMAN", text: "Human reply" },
        ],
      });
    });

    const client = { conversations: { replies: mockReplies } } as unknown as WebClient;

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    // After the error, should retry and find the reply
    expect(result.found).toBe(true);
    expect(result.text).toBe("Human reply");
  });

  it("skips messages with no text field", async () => {
    const messagesWithNoText = [
      { ts: THREAD_TS, bot_id: "B_APP" },
      // No text field — should be skipped
      { ts: "1000.0001", user: "U_HUMAN" },
    ];

    const client = createMockWebClient([{ messages: messagesWithNoText }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 60, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("skips the root message itself (ts === threadTs)", async () => {
    const messagesWithOnlyRoot = [
      // Only root message — same ts as threadTs
      { ts: THREAD_TS, user: "U_HUMAN", text: "The original question" },
    ];

    const client = createMockWebClient([{ messages: messagesWithOnlyRoot }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 60, FAST_OPTS);

    expect(result.found).toBe(false);
  });

  it("returns ts and user for found replies", async () => {
    const messagesWithReply = [
      { ts: THREAD_TS, bot_id: "B_APP", text: "Root" },
      { ts: "1000.9999", user: "U_HUMAN_2", text: "Great question!" },
    ];

    const client = createMockWebClient([{ messages: messagesWithReply }]);

    const result = await pollForReply(client, CHANNEL_ID, THREAD_TS, BOT_USER_ID, 500, FAST_OPTS);

    expect(result.found).toBe(true);
    expect(result.ts).toBe("1000.9999");
    expect(result.user).toBe("U_HUMAN_2");
  });
});
