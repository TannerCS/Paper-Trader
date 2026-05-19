import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageMarketRepository } from "../marketRepository";

describe("LocalStorageMarketRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists cached market rows by exchange source and currency", async () => {
    const repository = new LocalStorageMarketRepository();
    const cacheKey = { provider: "binanceus" as const, currency: "usd" };
    const markets = [
      {
        id: "bitcoin",
        providerId: 1,
        symbol: "BTC",
        name: "Bitcoin",
        image: "",
        currentPrice: 100,
        marketCap: 1_000_000,
        marketCapRank: 1,
        totalVolume: 50_000,
        high24h: null,
        low24h: null,
        priceChange24h: null,
        priceChangePercentage24h: 2.5,
        lastUpdated: "2026-05-17T00:00:00Z",
      },
    ];

    await repository.saveMarkets({ ...cacheKey, markets });

    await expect(repository.getMarkets(cacheKey)).resolves.toEqual(markets);
  });
});
