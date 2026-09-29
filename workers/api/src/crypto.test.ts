import { describe, expect, it } from "vitest";
import { constantTimeEqual, decryptText, encryptText, hmacHex } from "./crypto";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("sensitive value protection", () => {
  it("round-trips an AES-GCM envelope only with matching context", async () => {
    const envelope = await encryptText("synthetic-secret", key, "connection:fixture");
    expect(envelope).not.toContain("synthetic-secret");
    await expect(decryptText(envelope, key, "connection:fixture")).resolves.toBe("synthetic-secret");
    await expect(decryptText(envelope, key, "connection:other")).rejects.toThrow();
  });

  it("creates stable lookup hashes without returning the source", async () => {
    const first = await hmacHex("5511999990000", key);
    expect(await hmacHex("5511999990000", key)).toBe(first);
    expect(first).not.toContain("5511999990000");
  });

  it("compares webhook tokens without early string equality", () => {
    expect(constantTimeEqual("same-token", "same-token")).toBe(true);
    expect(constantTimeEqual("same-token", "wrong-token")).toBe(false);
    expect(constantTimeEqual("", "wrong-token")).toBe(false);
  });
});
