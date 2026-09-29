import { describe, expect, it } from "vitest";
import { buildMetaPayload, isRetryableMetaStatus } from "./meta";

describe("Meta delivery contract", () => {
  it("builds LeadSubmitted without exposing the raw phone", async () => {
    const payload = await buildMetaPayload({
      eventId: "evt-synthetic",
      occurredAt: "2026-09-29T12:00:00.000Z",
      phone: "5511999990000",
      ctwaClid: "ctwa-synthetic",
      pageId: "page-synthetic",
      sourceId: "ad-synthetic"
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain("LeadSubmitted");
    expect(serialized).toContain("ctwa-synthetic");
    expect(serialized).not.toContain("5511999990000");
  });

  it("retries throttling and server failures only", () => {
    expect(isRetryableMetaStatus(429)).toBe(true);
    expect(isRetryableMetaStatus(503)).toBe(true);
    expect(isRetryableMetaStatus(400)).toBe(false);
  });
});

