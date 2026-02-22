// Tests for src/hooks/router.ts — routeHookEvent dispatch.
//
// Uses vi.mock() to isolate individual handler modules so we verify only
// routing behavior (correct dispatch with correct arguments), not handler logic.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SlackClient } from "../slack/client.js";
import type { Config } from "../config.js";
import type { HookInput } from "../types.js";

// ---------------------------------------------------------------------------
// Hoisted mock references (vi.hoisted ensures these are available before
// the mock factories run, which is required in ESM vi.mock() context).
// ---------------------------------------------------------------------------

const mockHandleStop = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHandlePostToolUseFailure = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHandlePermissionRequest = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Use .js extension to match Node16 ESM resolution
vi.mock("./stop.js", () => ({
  handleStop: mockHandleStop,
}));

vi.mock("./post-tool-failure.js", () => ({
  handlePostToolUseFailure: mockHandlePostToolUseFailure,
}));

vi.mock("./permission.js", () => ({
  handlePermissionRequest: mockHandlePermissionRequest,
}));

// Import after mocks are registered
import { routeHookEvent } from "./router.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockSlackClient: SlackClient = {
  web: {} as SlackClient["web"],
  botUserId: "",
  channelId: "C12345678",
};

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
};

const stopInput: HookInput = {
  ...baseFields,
  hook_event_name: "Stop",
  stop_hook_active: false,
  last_assistant_message: "All tasks completed.",
};

const postToolFailureInput: HookInput = {
  ...baseFields,
  hook_event_name: "PostToolUseFailure",
  tool_name: "Bash",
  tool_input: { command: "ls /nonexistent" },
  tool_use_id: "tool-001",
  error: "No such file or directory",
};

const permissionInput: HookInput = {
  ...baseFields,
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: { command: "rm -rf /tmp/test" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("routeHookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches Stop event to handleStop with correct arguments", async () => {
    await routeHookEvent(stopInput, mockSlackClient, mockConfig);
    expect(mockHandleStop).toHaveBeenCalledOnce();
    expect(mockHandleStop).toHaveBeenCalledWith(stopInput, mockSlackClient, mockConfig);
  });

  it("does not call other handlers when Stop event is received", async () => {
    await routeHookEvent(stopInput, mockSlackClient, mockConfig);
    expect(mockHandlePostToolUseFailure).not.toHaveBeenCalled();
    expect(mockHandlePermissionRequest).not.toHaveBeenCalled();
  });

  it("dispatches PostToolUseFailure event to handlePostToolUseFailure with correct arguments", async () => {
    await routeHookEvent(postToolFailureInput, mockSlackClient, mockConfig);
    expect(mockHandlePostToolUseFailure).toHaveBeenCalledOnce();
    expect(mockHandlePostToolUseFailure).toHaveBeenCalledWith(
      postToolFailureInput,
      mockSlackClient,
      mockConfig
    );
  });

  it("does not call other handlers when PostToolUseFailure event is received", async () => {
    await routeHookEvent(postToolFailureInput, mockSlackClient, mockConfig);
    expect(mockHandleStop).not.toHaveBeenCalled();
    expect(mockHandlePermissionRequest).not.toHaveBeenCalled();
  });

  it("dispatches PermissionRequest event to handlePermissionRequest with correct arguments", async () => {
    await routeHookEvent(permissionInput, mockSlackClient, mockConfig);
    expect(mockHandlePermissionRequest).toHaveBeenCalledOnce();
    expect(mockHandlePermissionRequest).toHaveBeenCalledWith(
      permissionInput,
      mockSlackClient,
      mockConfig
    );
  });

  it("does not call other handlers when PermissionRequest event is received", async () => {
    await routeHookEvent(permissionInput, mockSlackClient, mockConfig);
    expect(mockHandleStop).not.toHaveBeenCalled();
    expect(mockHandlePostToolUseFailure).not.toHaveBeenCalled();
  });

  it("handles unknown event name gracefully without throwing", async () => {
    // Cast to HookInput to simulate runtime unknown event (TypeScript union is exhaustive)
    const unknownInput = {
      ...baseFields,
      hook_event_name: "UnknownEvent",
    } as unknown as HookInput;

    await expect(
      routeHookEvent(unknownInput, mockSlackClient, mockConfig)
    ).resolves.toBeUndefined();
    expect(mockHandleStop).not.toHaveBeenCalled();
    expect(mockHandlePostToolUseFailure).not.toHaveBeenCalled();
    expect(mockHandlePermissionRequest).not.toHaveBeenCalled();
  });

  it("awaits the handler — returns a Promise that resolves", async () => {
    await expect(routeHookEvent(stopInput, mockSlackClient, mockConfig)).resolves.toBeUndefined();
  });
});
