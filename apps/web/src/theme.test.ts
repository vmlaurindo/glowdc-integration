import { describe, expect, it } from "vitest";
import { nextTheme, resolveTheme } from "./theme";

describe("theme", () => {
  it("honors a persisted preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the operating-system preference", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("unsupported", false)).toBe("light");
  });

  it("switches between supported themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});
