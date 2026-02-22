// Tests for src/config.ts — loadConfig() validation and defaults.
//
// Uses vi.resetModules() + dynamic import() to isolate each test's env vars,
// since config.ts reads process.env at module evaluation time.
//
// IMPORTANT: process.env is saved/restored in beforeEach/afterEach to avoid
// test pollution. The SIGNAL_FLARE_ENV_FILE var is cleared so no .env file is
// loaded from disk during tests (resolveEnvFilePath returns undefined).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Minimal valid env vars for config
const VALID_ENV = {
  SLACK_BOT_TOKEN: "xoxb-test-token",
  SLACK_CHANNEL_ID: "C12345678",
};

describe("loadConfig", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save current env and start with a clean slate for each test
    savedEnv = { ...process.env };
    // Remove all vars that config cares about
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;
    delete process.env.SLACK_USER_ID;
    delete process.env.SEND_DELAY_MS;
    delete process.env.POLL_TIMEOUT_MS;
    delete process.env.HOOK_IDLE_TIMEOUT_MS;
    // Prevent dotenv from loading any file (no SIGNAL_FLARE_ENV_FILE)
    delete process.env.SIGNAL_FLARE_ENV_FILE;
    // Reset module cache so each import() gets a fresh evaluation
    vi.resetModules();
  });

  afterEach(() => {
    process.env = savedEnv;
    vi.resetModules();
  });

  it("returns a valid config object when all required vars are present", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.SLACK_BOT_TOKEN).toBe("xoxb-test-token");
    expect(config.SLACK_CHANNEL_ID).toBe("C12345678");
  });

  it("applies default value for SEND_DELAY_MS (0) when not set", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.SEND_DELAY_MS).toBe(0);
  });

  it("applies default value for POLL_TIMEOUT_MS (600000) when not set", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.POLL_TIMEOUT_MS).toBe(600000);
  });

  it("applies default value for HOOK_IDLE_TIMEOUT_MS (90000) when not set", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.HOOK_IDLE_TIMEOUT_MS).toBe(90000);
  });

  it("accepts custom POLL_TIMEOUT_MS overriding the default", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    process.env.POLL_TIMEOUT_MS = "300000";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.POLL_TIMEOUT_MS).toBe(300000);
  });

  it("accepts custom HOOK_IDLE_TIMEOUT_MS overriding the default", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    process.env.HOOK_IDLE_TIMEOUT_MS = "30000";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.HOOK_IDLE_TIMEOUT_MS).toBe(30000);
  });

  it("accepts custom SEND_DELAY_MS overriding the default", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    process.env.SEND_DELAY_MS = "500";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.SEND_DELAY_MS).toBe(500);
  });

  it("leaves SLACK_USER_ID as undefined when not set", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.SLACK_USER_ID).toBeUndefined();
  });

  it("includes SLACK_USER_ID in config when set", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    process.env.SLACK_USER_ID = "U99999999";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.SLACK_USER_ID).toBe("U99999999");
  });

  it("calls process.exit(1) when SLACK_BOT_TOKEN is missing", async () => {
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    // SLACK_BOT_TOKEN is not set

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("calls process.exit(1) when SLACK_CHANNEL_ID is missing", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    // SLACK_CHANNEL_ID is not set

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("calls process.exit(1) when SLACK_BOT_TOKEN does not start with xoxb-", async () => {
    process.env.SLACK_BOT_TOKEN = "invalid-token";
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("calls process.exit(1) when SLACK_CHANNEL_ID does not start with C", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = "D12345678"; // DM channel, not a public channel

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("coerces numeric string env vars to numbers", async () => {
    process.env.SLACK_BOT_TOKEN = VALID_ENV.SLACK_BOT_TOKEN;
    process.env.SLACK_CHANNEL_ID = VALID_ENV.SLACK_CHANNEL_ID;
    process.env.POLL_TIMEOUT_MS = "120000";
    process.env.HOOK_IDLE_TIMEOUT_MS = "60000";
    process.env.SEND_DELAY_MS = "100";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(typeof config.POLL_TIMEOUT_MS).toBe("number");
    expect(typeof config.HOOK_IDLE_TIMEOUT_MS).toBe("number");
    expect(typeof config.SEND_DELAY_MS).toBe("number");
    expect(config.POLL_TIMEOUT_MS).toBe(120000);
    expect(config.HOOK_IDLE_TIMEOUT_MS).toBe(60000);
    expect(config.SEND_DELAY_MS).toBe(100);
  });
});
