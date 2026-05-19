import { describe, expect, it } from "vitest";
import { getQuoteAsset, mapBinanceUsTicker } from "../client";
import type { BinanceUsTickerRow } from "../types";

describe("BinanceUsClient", () => {
  it("maps 24h ticker rows into the shared market shape", () => {
    const ticker: BinanceUsTickerRow = {
      symbol: "BTCUSD",
      priceChange: "100.00",
      priceChangePercent: "2.5",
      weightedAvgPrice: "100",
      lastPrice: "101.00",
      lastQty: "1",
      openPrice: "99",
      highPrice: "110",
      lowPrice: "90",
      volume: "20",
      quoteVolume: "2000",
      openTime: 1715900000000,
      closeTime: 1715900100000,
    };

    expect(mapBinanceUsTicker(ticker)).toMatchObject({
      id: "BTCUSD",
      symbol: "BTC",
      name: "BTC",
      currentPrice: 101,
      totalVolume: 2000,
      priceChange24h: 100,
      priceChangePercentage24h: 2.5,
    });
  });

  it("extracts preferred quote assets from compact symbols", () => {
    expect(getQuoteAsset("ETHUSD")).toBe("USD");
    expect(getQuoteAsset("ETHUSDT")).toBe("USDT");
  });
});
