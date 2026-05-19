import { beforeEach, describe, expect, it } from "vitest";
import { marketEngine } from "../marketEngine";
import { createDefaultPaperLedger } from "../paper/paperTradingEngine";
import { paperTradingRepository } from "../paper/paperTradingRepository";

describe("marketEngine", () => {
  beforeEach(async () => {
    localStorage.clear();
    await paperTradingRepository.saveLedger(createDefaultPaperLedger());
  });

  it("fills waiting orders when a market tick reaches the entry price", async () => {
    await marketEngine.placeOrder({
      kind: "spot-limit",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 110,
      limitPrice: 100,
    });

    await marketEngine.processMarketTick({ assetId: "BTCUSD", currentPrice: 99 });

    const ledger = await marketEngine.getLedger();
    expect(ledger.orders[0]).toMatchObject({ status: "filled", executionPrice: 99 });
  });

  it("processes paper orders when saving a market snapshot", async () => {
    await marketEngine.placeOrder({
      kind: "perp",
      assetId: "ETHUSD",
      symbol: "ETH",
      pair: "ETH/USD",
      side: "short",
      quantity: 1,
      currentPrice: 90,
      limitPrice: 100,
      leverage: 5,
    });

    await marketEngine.saveMarketSnapshot({
      provider: "binanceus",
      currency: "usd",
      markets: [
        {
          id: "ETHUSD",
          providerId: "ETHUSD",
          symbol: "ETH",
          name: "ETH/USD",
          image: "",
          currentPrice: 101,
          marketCap: null,
          marketCapRank: 1,
          totalVolume: null,
          high24h: null,
          low24h: null,
          priceChange24h: null,
          priceChangePercentage24h: null,
          lastUpdated: new Date().toISOString(),
        },
      ],
    });

    const ledger = await marketEngine.getLedger();
    expect(ledger.orders[0]).toMatchObject({ status: "filled", executionPrice: 101 });
  });
});
