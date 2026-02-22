import { describe, it, expect, vi, beforeEach } from "vitest";

// ESM mock: inline vi.fn() inside factory to avoid hoisting issues
vi.mock("@slack/web-api", () => {
  const mockAuthTest = vi.fn();
  const MockWebClient = vi.fn().mockImplementation((token: string) => ({
    _token: token,
    auth: { test: mockAuthTest },
  }));
  return { WebClient: MockWebClient };
});

// Import after mocks are registered
import { WebClient } from "@slack/web-api";
import { createSlackClient, createSlackClientDirect } from "./client.js";
import type { Config } from "../config.js";

const baseConfig: Config = {
  SLACK_BOT_TOKEN: "xoxb-test-token",
  SLACK_CHANNEL_ID: "C123456",
  SLACK_USER_ID: undefined,
  SEND_DELAY_MS: 0,
  POLL_TIMEOUT_MS: 600000,
  HOOK_IDLE_TIMEOUT_MS: 90000,
};

describe("createSlackClient", () => {
  let mockWebClientInstance: { _token: string; auth: { test: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    // Each createSlackClient call creates a new WebClient instance
    mockWebClientInstance = {
      _token: "",
      auth: { test: vi.fn() },
    };
    (vi.mocked(WebClient) as any).mockImplementation((token: string) => {
      mockWebClientInstance._token = token;
      return mockWebClientInstance;
    });
  });

  it("constructs WebClient with the correct token", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: true, user_id: "U_BOT_01" });

    await createSlackClient(baseConfig);

    expect(WebClient).toHaveBeenCalledWith("xoxb-test-token");
  });

  it("resolves botUserId from auth.test() response", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: true, user_id: "U_BOT_42" });

    const client = await createSlackClient(baseConfig);

    expect(client.botUserId).toBe("U_BOT_42");
  });

  it("returns the correct channelId from config", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: true, user_id: "U_BOT_01" });

    const client = await createSlackClient(baseConfig);

    expect(client.channelId).toBe("C123456");
  });

  it("throws if auth.test() returns ok=false", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: false, user_id: undefined });

    await expect(createSlackClient(baseConfig)).rejects.toThrow();
  });

  it("throws if auth.test() returns missing user_id", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: true, user_id: undefined });

    await expect(createSlackClient(baseConfig)).rejects.toThrow(/user_id/);
  });

  it("propagates error if auth.test() rejects (network/API error)", async () => {
    const networkError = new Error("Network timeout");
    mockWebClientInstance.auth.test.mockRejectedValue(networkError);

    await expect(createSlackClient(baseConfig)).rejects.toThrow("Network timeout");
  });

  it("returns a SlackClient with the web property set", async () => {
    mockWebClientInstance.auth.test.mockResolvedValue({ ok: true, user_id: "U_BOT_01" });

    const client = await createSlackClient(baseConfig);

    expect(client.web).toBeDefined();
  });
});

describe("createSlackClientDirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vi.mocked(WebClient) as any).mockImplementation((token: string) => ({
      _token: token,
      auth: { test: vi.fn() },
    }));
  });

  it("sets botUserId to empty string", () => {
    const client = createSlackClientDirect(baseConfig);

    expect(client.botUserId).toBe("");
  });

  it("does NOT call auth.test()", () => {
    createSlackClientDirect(baseConfig);

    // The WebClient was constructed — get its mock instance
    const instances = vi.mocked(WebClient).mock.results;
    const instance = instances[0]?.value as { auth: { test: ReturnType<typeof vi.fn> } };
    expect(instance.auth.test).not.toHaveBeenCalled();
  });

  it("constructs WebClient with the correct token", () => {
    createSlackClientDirect(baseConfig);

    expect(WebClient).toHaveBeenCalledWith("xoxb-test-token");
  });

  it("returns the correct channelId from config", () => {
    const client = createSlackClientDirect(baseConfig);

    expect(client.channelId).toBe("C123456");
  });

  it("returns a SlackClient with the web property set", () => {
    const client = createSlackClientDirect(baseConfig);

    expect(client.web).toBeDefined();
  });
});
