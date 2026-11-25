import { describe, expect, it } from "vitest";
import { shareMethod } from "./use-share";

const data = { title: "t", url: "https://example.com" };

describe("shareMethod", () => {
  it("prefers the native share sheet when it accepts the data", () => {
    expect(shareMethod({ share: async () => {}, canShare: () => true } as never, data)).toBe("native");
    expect(shareMethod({ share: async () => {} } as never, data)).toBe("native");
  });
  it("falls back to the clipboard", () => {
    expect(shareMethod({ share: async () => {}, canShare: () => false, clipboard: { writeText: async () => {} } } as never, data)).toBe("clipboard");
    expect(shareMethod({ clipboard: { writeText: async () => {} } } as never, data)).toBe("clipboard");
  });
  it("reports when neither exists", () => {
    expect(shareMethod(undefined, data)).toBe("none");
    expect(shareMethod({} as never, data)).toBe("none");
  });
});
