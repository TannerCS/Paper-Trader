import { describe, expect, it } from "vitest";
import { defaultTerminalPreferences, sanitizeTerminalPreferences } from "../terminalPreferences";

describe("terminalPreferences", () => {
  it("defaults the trading terminal to MA, VOL, and MACD", () => {
    expect(defaultTerminalPreferences.activeIndicators).toEqual([
      { id: "default-ma", name: "MA", calcParams: [5, 10, 30, 60] },
      { id: "default-vol", name: "VOL", calcParams: [5, 10, 20] },
      { id: "default-macd", name: "MACD", calcParams: [12, 26, 9] },
    ]);
  });

  it("sanitizes missing indicator preferences back to the default indicator setup", () => {
    expect(sanitizeTerminalPreferences({}).activeIndicators).toEqual(defaultTerminalPreferences.activeIndicators);
  });

  it("sanitizes missing toolbar position back to the default floating toolbar location", () => {
    expect(sanitizeTerminalPreferences({}).chartToolbarPosition).toEqual({ x: 12, y: 92 });
  });

  it("sanitizes persisted chart drawings by coin id", () => {
    expect(
      sanitizeTerminalPreferences({
        chartOverlaysByCoinId: {
          "binanceus:BTCUSDT": [
            {
              id: "overlay-1",
              name: "horizontalStraightLine",
              paneId: "candle_pane",
              points: [{ timestamp: 1, value: 78000 }],
              visible: true,
              extendData: "Entry",
            },
          ],
        },
      }).chartOverlaysByCoinId,
    ).toEqual({
      "binanceus:BTCUSDT": [
        {
          id: "overlay-1",
          name: "horizontalStraightLine",
          paneId: "candle_pane",
          points: [{ timestamp: 1, value: 78000 }],
          visible: true,
          extendData: "Entry",
          styles: undefined,
        },
      ],
    });
  });
});
