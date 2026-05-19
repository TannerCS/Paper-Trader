import { describe, expect, it } from "vitest";
import { sanitizeWindowState } from "../windowStateRepository";

describe("windowStateRepository", () => {
  it("sanitizes usable desktop window state", () => {
    expect(sanitizeWindowState({ width: 1640.4, height: 980.8, x: 42.2, y: 84.7, maximized: true })).toEqual({
      width: 1640,
      height: 981,
      x: 42,
      y: 85,
      maximized: true,
    });
  });

  it("rejects unusable desktop window state", () => {
    expect(sanitizeWindowState({ width: "nope", height: 900 })).toBeNull();
  });
});
