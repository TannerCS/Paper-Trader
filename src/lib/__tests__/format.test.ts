import { describe, expect, it } from "vitest";
import { formatCurrency } from "../format";
import { formatMarketPair } from "../marketPair";

describe("formatCurrency", () => {
  it("formats ISO currencies with Intl currency symbols", () => {
    expect(formatCurrency(1234.56, "usd")).toBe("$1,234.56");
  });

  it("formats exchange quote assets without throwing", () => {
    expect(formatCurrency(1234.56, "usdt")).toBe("1,234.56 USDT");
  });
});

describe("formatMarketPair", () => {
  it("formats joined exchange symbols as base/quote pairs", () => {
    expect(formatMarketPair({ id: "BTCUSDT", symbol: "BTC" })).toBe("BTC/USDT");
  });

  it("formats dashed product ids as slash pairs", () => {
    expect(formatMarketPair({ id: "BTC-USD", symbol: "BTC" })).toBe("BTC/USD");
  });
});
