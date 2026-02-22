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
import type { UrgencyLevel, AskHumanParams } from "../types.js";

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
