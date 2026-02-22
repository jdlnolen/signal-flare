// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import { z } from "zod";

/**
 * Urgency levels for Slack messages.
 * Controls color coding and visual weight of the notification.
 */
export type UrgencyLevel = "high" | "normal" | "low";

/**
 * Parameters for the ask_human_via_slack MCP tool.
 */
export interface AskHumanParams {
  /** The question to ask the human. Required. */
  question: string;
  /** Optional context — code snippets, file paths, error messages, etc. */
  context?: string;
  /** Optional numbered options the human can choose from. */
  options?: string[];
  /** Urgency level controlling visual weight. Defaults to "normal". */
  urgency?: UrgencyLevel;
  /** Optional session ID for linking Slack threads to Claude sessions. */
  session_id?: string;
}

/**
 * Result of a single poll attempt against the Slack thread.
 */
export interface PollResult {
  /** Whether a valid human reply was found. */
  found: boolean;
  /** The reply text (if found). */
  text?: string;
  /** The Slack user ID who replied (if found). */
  user?: string;
  /** The Slack message timestamp (if found). */
  ts?: string;
  /** Elapsed milliseconds since polling started. */
  elapsedMs?: number;
}

/**
 * Structured response returned to the MCP tool caller after a successful reply.
 */
export interface ToolResponse {
  /** The human's reply text. */
  reply: string;
  /** The Slack user ID who replied. */
  replied_by: string;
  /** How long (in ms) it took to get a reply from when the message was sent. */
  response_time_ms: number;
  /** If options were provided and user selected one, the option text. Otherwise null. */
  selected_option: string | null;
  /** If options were provided and user selected one, the 0-based index. Otherwise null. */
  selected_option_index: number | null;
}

// ---------------------------------------------------------------------------
// Hook input Zod schemas — validate stdin JSON from Claude Code hook events
// ---------------------------------------------------------------------------

/**
 * Zod schema for the Stop hook input from Claude Code.
 * Fired when Claude Code finishes a session or completes a task.
 */
export const StopHookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.literal("Stop"),
  stop_hook_active: z.boolean(),
  last_assistant_message: z.string(),
});

/**
 * Zod schema for the PostToolUseFailure hook input from Claude Code.
 * Fired when a tool invocation fails (e.g., Bash error, file not found).
 */
export const PostToolUseFailureInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.literal("PostToolUseFailure"),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_use_id: z.string(),
  error: z.string(),
  is_interrupt: z.boolean().optional(),
});

/**
 * Zod schema for the PermissionRequest hook input from Claude Code.
 * Fired when Claude Code requests permission to run a potentially risky operation.
 */
export const PermissionRequestInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.literal("PermissionRequest"),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  permission_suggestions: z.array(z.object({ type: z.string(), tool: z.string() })).optional(),
});

/** Inferred TypeScript type for Stop hook input. */
export type StopHookInput = z.infer<typeof StopHookInputSchema>;

/** Inferred TypeScript type for PostToolUseFailure hook input. */
export type PostToolUseFailureInput = z.infer<typeof PostToolUseFailureInputSchema>;

/** Inferred TypeScript type for PermissionRequest hook input. */
export type PermissionRequestInput = z.infer<typeof PermissionRequestInputSchema>;

/**
 * Notification type label for hook messages sent to Slack.
 * Used to differentiate message intent in the unified Block Kit builder.
 */
export type HookNotificationType = "COMPLETED" | "ERROR" | "QUESTION" | "PERMISSION";

/**
 * Discriminated union schema covering all three Claude Code hook event types.
 * Use this to parse the raw stdin JSON in hook handlers.
 */
export const HookInputSchema = z.discriminatedUnion("hook_event_name", [
  StopHookInputSchema,
  PostToolUseFailureInputSchema,
  PermissionRequestInputSchema,
]);

/** Inferred TypeScript type for any hook input (discriminated union). */
export type HookInput = z.infer<typeof HookInputSchema>;
