// NOTE: Never use console.log() in this project — it corrupts MCP stdio transport
// All logging must use console.error() instead.

import type {
  KnownBlock,
  MessageAttachment,
  RichTextBlock,
  RichTextPreformatted,
  RichTextText,
  SectionBlock,
  HeaderBlock,
  DividerBlock,
} from "@slack/types";
import type { UrgencyLevel, AskHumanParams, HookNotificationType } from "../types.js";

interface UrgencyConfig {
  color: string;
  emoji: string;
  label: string;
}

const URGENCY_CONFIG: Record<UrgencyLevel, UrgencyConfig> = {
  high: {
    color: "#FF0000",
    emoji: ":rotating_light:",
    label: "URGENT",
  },
  normal: {
    color: "#FFA500",
    emoji: ":bell:",
    label: "Attention needed",
  },
  low: {
    color: "#36A64F",
    emoji: ":information_source:",
    label: "FYI",
  },
};

/**
 * Maps hook notification types to their display emoji + header text.
 */
const HOOK_LABEL_CONFIG: Record<HookNotificationType, { emoji: string; text: string }> = {
  COMPLETED: { emoji: ":white_check_mark:", text: "Task Completed" },
  ERROR: { emoji: ":x:", text: "Tool Error" },
  QUESTION: { emoji: ":bell:", text: "Claude needs your input" },
  PERMISSION: { emoji: ":lock:", text: "Permission Needed" },
};

/**
 * Builds a rich Block Kit question message with urgency-based color coding.
 *
 * The attachment wrapper (not top-level blocks) is required for the color bar
 * to appear on the left side of the message — see Slack API docs.
 *
 * @param params - The question parameters from the MCP tool call
 * @param userId - Optional Slack user ID to @mention (SLACK_USER_ID env var)
 */
export function buildQuestionMessage(
  params: AskHumanParams,
  userId?: string
): { attachments: MessageAttachment[] } {
  const urgency = params.urgency ?? "normal";
  const urgencyConfig = URGENCY_CONFIG[urgency];
  const blocks: KnownBlock[] = [];

  // Header block: urgency emoji + label
  const headerBlock: HeaderBlock = {
    type: "header",
    text: {
      type: "plain_text",
      text: `${urgencyConfig.emoji} Claude needs your input`,
      emoji: true,
    },
  };
  blocks.push(headerBlock);

  // Section block: @mention + question text
  const mentionPrefix = userId ? `<@${userId}> ` : "";
  const questionBlock: SectionBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${mentionPrefix}*${params.question}*`,
    },
  };
  blocks.push(questionBlock);

  // Rich text block for context (code/error display)
  if (params.context) {
    const contextText: RichTextText = {
      type: "text",
      text: params.context,
    };
    const preformattedBlock: RichTextPreformatted = {
      type: "rich_text_preformatted",
      elements: [contextText],
    };
    const richTextBlock: RichTextBlock = {
      type: "rich_text",
      elements: [preformattedBlock],
    };
    blocks.push(richTextBlock);
  }

  // Options block: numbered list with reply instructions
  if (params.options && params.options.length > 0) {
    const numberedList = params.options
      .map((opt, idx) => `*${idx + 1}.* ${opt}`)
      .join("\n");
    const optionsBlock: SectionBlock = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${numberedList}\n\nReply with a number or type a full response.`,
      },
    };
    blocks.push(optionsBlock);
  }

  // Divider
  const dividerBlock: DividerBlock = {
    type: "divider",
  };
  blocks.push(dividerBlock);

  const attachment: MessageAttachment = {
    color: urgencyConfig.color,
    blocks,
  };

  return { attachments: [attachment] };
}

/**
 * Builds a timeout notice message for posting to the Slack thread.
 * Full standalone message (not subtle context block) — visible from thread list.
 */
export function buildTimeoutMessage(): { text: string } {
  return {
    text: "⏱ *Timed out.* Claude will attempt to continue without an answer.",
  };
}

/**
 * Builds a "still waiting" bump message for posting to the Slack thread
 * after the first timeout. Gentle nudge tone — not a second urgent alert.
 */
export function buildStillWaitingMessage(): { text: string } {
  return {
    text: "⏳ Still waiting for your reply...",
  };
}

/**
 * Builds a response received confirmation message for posting to the Slack thread.
 */
export function buildResponseReceivedMessage(): { text: string } {
  return {
    text: "✅ Response received — answer delivered to Claude.",
  };
}

// ---------------------------------------------------------------------------
// Hook notification message builders
// ---------------------------------------------------------------------------

/**
 * Options for building a hook notification message.
 */
export interface HookMessageOptions {
  /** Notification type label — controls header emoji and text. */
  label: HookNotificationType;
  /** Main summary text — displayed as bold section text. */
  headline: string;
  /** Optional detailed body (context, error text, numbered options, etc.). */
  body?: string;
  /** Optional code/file context displayed in a preformatted rich text block. */
  context?: string;
  /** Optional Slack user ID to @mention in the headline section. */
  userId?: string;
}

/**
 * Builds a unified Block Kit hook notification message for all hook types.
 *
 * All hook notification types use the same orange (#FFA500) color bar per
 * locked decision — not distinct colors per type. The label (COMPLETED, ERROR,
 * QUESTION, PERMISSION) differentiates the notification via the header block.
 *
 * Structure:
 *   - Header block: emoji + label text
 *   - Section block: optional @mention + bold headline
 *   - Rich text preformatted (if context provided)
 *   - Section block (if body provided)
 *   - Divider
 */
export function buildHookMessage(
  opts: HookMessageOptions
): { attachments: MessageAttachment[] } {
  const labelConfig = HOOK_LABEL_CONFIG[opts.label];
  const blocks: KnownBlock[] = [];

  // Header block: emoji + label text
  const headerBlock: HeaderBlock = {
    type: "header",
    text: {
      type: "plain_text",
      text: `${labelConfig.emoji} ${labelConfig.text}`,
      emoji: true,
    },
  };
  blocks.push(headerBlock);

  // Section block: optional @mention + bold headline
  const mentionPrefix = opts.userId ? `<@${opts.userId}> ` : "";
  const headlineBlock: SectionBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${mentionPrefix}*${opts.headline}*`,
    },
  };
  blocks.push(headlineBlock);

  // Rich text block for code/file context (preformatted display)
  if (opts.context) {
    const contextText: RichTextText = {
      type: "text",
      text: opts.context,
    };
    const preformattedBlock: RichTextPreformatted = {
      type: "rich_text_preformatted",
      elements: [contextText],
    };
    const richTextBlock: RichTextBlock = {
      type: "rich_text",
      elements: [preformattedBlock],
    };
    blocks.push(richTextBlock);
  }

  // Body section (error details, numbered options, action details, etc.)
  if (opts.body) {
    const bodyBlock: SectionBlock = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: opts.body,
      },
    };
    blocks.push(bodyBlock);
  }

  // Divider
  const dividerBlock: DividerBlock = {
    type: "divider",
  };
  blocks.push(dividerBlock);

  const attachment: MessageAttachment = {
    // Orange for all hook notification types — locked decision: no distinct colors per type
    color: "#FFA500",
    blocks,
  };

  return { attachments: [attachment] };
}

/**
 * Builds a "resolved in terminal" message posted when the watcher detects
 * the user has responded directly in the terminal before the hook timeout.
 */
export function buildResolvedInTerminalMessage(): { text: string } {
  return {
    text: "✅ Resolved in terminal — no action needed.",
  };
}
