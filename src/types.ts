// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

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
