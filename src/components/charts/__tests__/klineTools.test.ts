import { describe, expect, it } from "vitest";
import { kLineIndicatorNames, kLineOverlayNames } from "../klineTools";

describe("klineTools", () => {
  it("exposes the full built-in KLineCharts indicator set", () => {
    expect(kLineIndicatorNames).toEqual(
      expect.arrayContaining(["MA", "EMA", "MACD", "RSI", "BOLL", "KDJ", "SAR", "VOL", "WR"]),
    );
    expect(kLineIndicatorNames).toHaveLength(27);
  });

  it("exposes the full built-in KLineCharts overlay tool set", () => {
    expect(kLineOverlayNames).toEqual(
      expect.arrayContaining(["fibonacciLine", "priceChannelLine", "simpleAnnotation", "simpleTag"]),
    );
    expect(kLineOverlayNames).toHaveLength(15);
  });
});
