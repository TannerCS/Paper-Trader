import { describe, expect, it } from "vitest";
import { mergeLivePriceIntoOhlc } from "../ohlc";

describe("mergeLivePriceIntoOhlc", () => {
  it("updates the current candle when a websocket tick lands in the active bucket", () => {
    const candles = [{ timestamp: 60_000, open: 100, high: 105, low: 95, close: 101 }];

    expect(mergeLivePriceIntoOhlc(candles, 110, 89_000, 60_000)).toEqual([
      { timestamp: 60_000, open: 100, high: 110, low: 95, close: 110 },
    ]);
  });

  it("adds a new candle when a websocket tick lands after the stored history", () => {
    const candles = [{ timestamp: 60_000, open: 100, high: 105, low: 95, close: 101 }];

    expect(mergeLivePriceIntoOhlc(candles, 106, 120_000, 60_000)).toEqual([
      { timestamp: 60_000, open: 100, high: 105, low: 95, close: 101 },
      { timestamp: 120_000, open: 101, high: 106, low: 106, close: 106 },
    ]);
  });
});
