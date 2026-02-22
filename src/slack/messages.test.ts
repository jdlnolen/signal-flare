// Tests for src/slack/messages.ts — Block Kit message builders.
//
// These are pure functions with no side effects. All tests use plain expect()
// assertions — no mocks needed.

import { describe, it, expect } from "vitest";
import {
  buildQuestionMessage,
  buildHookMessage,
  buildTimeoutMessage,
  buildStillWaitingMessage,
  buildResponseReceivedMessage,
  buildResolvedInTerminalMessage,
} from "./messages.js";
import type { AskHumanParams } from "../types.js";

// Type helpers for accessing Slack Block Kit fields without strict union type constraints.
// Slack's @slack/types defines Block as a large union type — casting is needed to access
// subtype-specific properties after narrowing by .type.
type AnyBlock = {
  type: string;
  text?: { type?: string; text: string; emoji?: boolean };
  elements?: Array<{
    type: string;
    elements?: Array<{ type: string; text?: string }>;
    text?: string;
  }>;
};

// ---------------------------------------------------------------------------
// buildQuestionMessage
// ---------------------------------------------------------------------------

describe("buildQuestionMessage", () => {
  const baseParams: AskHumanParams = {
    question: "What should I do next?",
  };

  it("returns an object with an attachments array", () => {
    const result = buildQuestionMessage(baseParams);
    expect(result).toHaveProperty("attachments");
    expect(Array.isArray(result.attachments)).toBe(true);
    expect(result.attachments).toHaveLength(1);
  });

  it("attachment contains a blocks array", () => {
    const result = buildQuestionMessage(baseParams);
    const attachment = result.attachments[0];
    expect(attachment).toHaveProperty("blocks");
    expect(Array.isArray(attachment.blocks)).toBe(true);
  });

  it("first block is a header block with question text", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const header = blocks[0];
    expect(header.type).toBe("header");
    if (header.type === "header") {
      expect(header.text!.text).toContain("Claude needs your input");
    }
  });

  it("second block is a section block containing the question text", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    expect(section.type).toBe("section");
    if (section.type === "section") {
      expect(section.text?.text).toContain("What should I do next?");
    }
  });

  it("includes @mention prefix in section when userId is provided", () => {
    const result = buildQuestionMessage(baseParams, "U12345678");
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    if (section.type === "section") {
      expect(section.text?.text).toContain("<@U12345678>");
    }
  });

  it("does not include @mention prefix in section when userId is omitted", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    if (section.type === "section") {
      expect(section.text?.text).not.toContain("<@");
    }
  });

  it("uses red color (#FF0000) for high urgency", () => {
    const result = buildQuestionMessage({ ...baseParams, urgency: "high" });
    expect(result.attachments[0].color).toBe("#FF0000");
  });

  it("uses orange color (#FFA500) for normal urgency", () => {
    const result = buildQuestionMessage({ ...baseParams, urgency: "normal" });
    expect(result.attachments[0].color).toBe("#FFA500");
  });

  it("uses green color (#36A64F) for low urgency", () => {
    const result = buildQuestionMessage({ ...baseParams, urgency: "low" });
    expect(result.attachments[0].color).toBe("#36A64F");
  });

  it("defaults to normal urgency color when urgency is not specified", () => {
    const result = buildQuestionMessage(baseParams);
    expect(result.attachments[0].color).toBe("#FFA500");
  });

  it("includes a rich_text block with preformatted context when context is provided", () => {
    const result = buildQuestionMessage({ ...baseParams, context: "some code here" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const richTextBlock = blocks.find((b) => b.type === "rich_text");
    expect(richTextBlock).toBeDefined();
    if (richTextBlock && richTextBlock.type === "rich_text") {
      const preformatted = richTextBlock.elements![0];
      expect(preformatted.type).toBe("rich_text_preformatted");
      if (preformatted.type === "rich_text_preformatted") {
        expect(preformatted.elements![0]).toMatchObject({
          type: "text",
          text: "some code here",
        });
      }
    }
  });

  it("does not include a rich_text block when context is omitted", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const richTextBlock = blocks.find((b) => b.type === "rich_text");
    expect(richTextBlock).toBeUndefined();
  });

  it("includes a numbered options list in a section block when options are provided", () => {
    const result = buildQuestionMessage({ ...baseParams, options: ["Option A", "Option B"] });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    // Find a section block (after the question section) that contains the numbered list
    const optionsBlock = blocks
      .filter((b) => b.type === "section")
      .find((b) => {
        if (b.type === "section") {
          return b.text?.text?.includes("*1.*") || b.text?.text?.includes("*2.*");
        }
        return false;
      });
    expect(optionsBlock).toBeDefined();
    if (optionsBlock && optionsBlock.type === "section") {
      expect(optionsBlock.text?.text).toContain("Option A");
      expect(optionsBlock.text?.text).toContain("Option B");
    }
  });

  it("does not include an options section block when options are omitted", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    // Only the question section should be present; no options list
    const sectionBlocks = blocks.filter((b) => b.type === "section");
    expect(sectionBlocks).toHaveLength(1);
  });

  it("last block is a divider", () => {
    const result = buildQuestionMessage(baseParams);
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock.type).toBe("divider");
  });
});

// ---------------------------------------------------------------------------
// buildHookMessage
// ---------------------------------------------------------------------------

describe("buildHookMessage", () => {
  it("returns an object with an attachments array", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "All done!" });
    expect(result).toHaveProperty("attachments");
    expect(result.attachments).toHaveLength(1);
  });

  it("always uses orange (#FFA500) color — locked decision", () => {
    const labels = ["COMPLETED", "ERROR", "QUESTION", "PERMISSION"] as const;
    for (const label of labels) {
      const result = buildHookMessage({ label, headline: "test" });
      expect(result.attachments[0].color).toBe("#FFA500");
    }
  });

  it("COMPLETED notification: header contains 'Task Completed' text", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done." });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const header = blocks[0];
    expect(header.type).toBe("header");
    if (header.type === "header") {
      expect(header.text!.text).toContain("Task Completed");
    }
  });

  it("ERROR notification: header contains 'Tool Error' text", () => {
    const result = buildHookMessage({ label: "ERROR", headline: "Bash failed" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const header = blocks[0];
    if (header.type === "header") {
      expect(header.text!.text).toContain("Tool Error");
    }
  });

  it("QUESTION notification: header contains 'Claude needs your input' text", () => {
    const result = buildHookMessage({ label: "QUESTION", headline: "What?" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const header = blocks[0];
    if (header.type === "header") {
      expect(header.text!.text).toContain("Claude needs your input");
    }
  });

  it("PERMISSION notification: header contains 'Permission Needed' text", () => {
    const result = buildHookMessage({ label: "PERMISSION", headline: "Allow Bash?" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const header = blocks[0];
    if (header.type === "header") {
      expect(header.text!.text).toContain("Permission Needed");
    }
  });

  it("headline appears as bold text in the section block", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Task is done!" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    expect(section.type).toBe("section");
    if (section.type === "section") {
      expect(section.text?.text).toContain("*Task is done!*");
    }
  });

  it("includes @mention in headline section when userId is provided", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done.", userId: "U99999" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    if (section.type === "section") {
      expect(section.text?.text).toContain("<@U99999>");
    }
  });

  it("does not include @mention when userId is omitted", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done." });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const section = blocks[1];
    if (section.type === "section") {
      expect(section.text?.text).not.toContain("<@");
    }
  });

  it("includes a rich_text preformatted block when context is provided", () => {
    const result = buildHookMessage({ label: "ERROR", headline: "Bash failed", context: "ls -la" });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const richText = blocks.find((b) => b.type === "rich_text");
    expect(richText).toBeDefined();
    if (richText && richText.type === "rich_text") {
      const preformatted = richText.elements![0];
      expect(preformatted.type).toBe("rich_text_preformatted");
      if (preformatted.type === "rich_text_preformatted") {
        expect(preformatted.elements![0]).toMatchObject({ type: "text", text: "ls -la" });
      }
    }
  });

  it("does not include a rich_text block when context is omitted", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done." });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    expect(blocks.find((b) => b.type === "rich_text")).toBeUndefined();
  });

  it("includes a body section block when body is provided", () => {
    const result = buildHookMessage({
      label: "ERROR",
      headline: "Fail",
      body: "Error details here",
    });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const bodySection = blocks
      .filter((b) => b.type === "section")
      .find((b) => {
        if (b.type === "section") {
          return b.text?.text === "Error details here";
        }
        return false;
      });
    expect(bodySection).toBeDefined();
  });

  it("does not include a body section block when body is omitted", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done." });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    const sectionBlocks = blocks.filter((b) => b.type === "section");
    // Only the headline section should be present
    expect(sectionBlocks).toHaveLength(1);
  });

  it("last block is always a divider", () => {
    const result = buildHookMessage({ label: "COMPLETED", headline: "Done." });
    const blocks = result.attachments[0].blocks as unknown as AnyBlock[];
    expect(blocks[blocks.length - 1].type).toBe("divider");
  });
});

// ---------------------------------------------------------------------------
// Simple text message builders
// ---------------------------------------------------------------------------

describe("buildTimeoutMessage", () => {
  it("returns an object with a text property", () => {
    const result = buildTimeoutMessage();
    expect(result).toHaveProperty("text");
    expect(typeof result.text).toBe("string");
  });

  it("text mentions timed out", () => {
    expect(buildTimeoutMessage().text.toLowerCase()).toContain("timed out");
  });
});

describe("buildStillWaitingMessage", () => {
  it("returns an object with a text property", () => {
    const result = buildStillWaitingMessage();
    expect(result).toHaveProperty("text");
    expect(typeof result.text).toBe("string");
  });

  it("text mentions waiting", () => {
    expect(buildStillWaitingMessage().text.toLowerCase()).toContain("waiting");
  });
});

describe("buildResponseReceivedMessage", () => {
  it("returns an object with a text property", () => {
    const result = buildResponseReceivedMessage();
    expect(result).toHaveProperty("text");
    expect(typeof result.text).toBe("string");
  });

  it("text mentions response received", () => {
    expect(buildResponseReceivedMessage().text.toLowerCase()).toContain("response received");
  });
});

describe("buildResolvedInTerminalMessage", () => {
  it("returns an object with a text property", () => {
    const result = buildResolvedInTerminalMessage();
    expect(result).toHaveProperty("text");
    expect(typeof result.text).toBe("string");
  });

  it("text mentions resolved in terminal", () => {
    expect(buildResolvedInTerminalMessage().text.toLowerCase()).toContain("resolved in terminal");
  });
});
