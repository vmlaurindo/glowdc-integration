import { describe, expect, it } from "vitest";
import { normalizeUazapiInbound } from "./index";

describe("normalizeUazapiInbound", () => {
  it("recognizes a complete paid inbound event", () => {
    const result = normalizeUazapiInbound({
      token: "fixture-secret-never-logged",
      message: {
        id: "msg-001",
        fromMe: false,
        timestamp: "2026-09-29T12:00:00.000Z",
        sender: { phone: "+55 (11) 99999-0000", pushName: "Contato sintético" },
        contextInfo: {
          externalAdReply: {
            ctwa_clid: "synthetic-ctwa",
            source_id: "synthetic-ad",
            headline: "Campanha sintética"
          }
        }
      }
    });

    expect(result).toMatchObject({
      externalMessageId: "msg-001",
      phone: "5511999990000",
      classification: "paid_complete",
      ctwaClid: "synthetic-ctwa",
      sourceId: "synthetic-ad"
    });
  });

  it("classifies outbound and group events before attribution", () => {
    expect(normalizeUazapiInbound({ message: { fromMe: true } }).classification)
      .toBe("ignored_outbound");
    expect(normalizeUazapiInbound({ message: { key: { remoteJid: "123@g.us" } } }).classification)
      .toBe("ignored_group");
  });

  it("keeps organic leads separate from incomplete paid referrals", () => {
    const organic = normalizeUazapiInbound({ message: { sender: { phone: "5511988887777" } } });
    const incomplete = normalizeUazapiInbound({
      message: {
        sender: { phone: "5511988887777" },
        contextInfo: { externalAdReply: { ctwa_clid: "only-one-side" } }
      }
    });
    expect(organic.classification).toBe("organic");
    expect(incomplete.classification).toBe("paid_incomplete");
  });
});
