import { describe, expect, it } from "vitest";
import { twimlOpeningStream, twimlReplyStream } from "../lib/discagem/twilio-client";

describe("Twilio Media Stream fallback", () => {
  it("continues in Gather mode if the opening stream closes", () => {
    const xml = twimlOpeningStream(
      "https://example.com/opening.mp3",
      "wss://example.com/media-stream/1",
      "https://example.com/speech-gather-fallback",
    );

    expect(xml).toContain("<Play>https://example.com/opening.mp3</Play>");
    expect(xml).toContain('<Stream url="wss://example.com/media-stream/1" track="both_tracks" />');
    expect(xml).toContain('<Redirect method="POST">https://example.com/speech-gather-fallback</Redirect>');
    expect(xml.indexOf("</Connect>")).toBeLessThan(xml.indexOf("<Redirect"));
  });

  it("continues in Gather mode if a reply stream closes", () => {
    const xml = twimlReplyStream(
      "https://example.com/reply.mp3",
      "wss://example.com/media-stream/1",
      "https://example.com/speech-gather-fallback",
    );

    expect(xml).toContain('<Redirect method="POST">https://example.com/speech-gather-fallback</Redirect>');
    expect(xml).not.toContain("<Hangup");
  });
});