import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageCandleRepository } from "../candleRepository";

describe("LocalStorageCandleRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty candle list when no history is stored", async () => {
    const repository = new LocalStorageCandleRepository();

    await expect(
      repository.getCandles({ provider: "binanceus", coinId: "BTCUSD", currency: "usd", rangeKey: "all" }),
    ).resolves.toEqual([]);
  });

  it("persists all-history candles by coin, currency, and range", async () => {
    const repository = new LocalStorageCandleRepository();
    const cacheKey = { provider: "binanceus" as const, coinId: "BTCUSD", currency: "usd", rangeKey: "all" };
    const candles = [{ timestamp: 1, open: 10, high: 12, low: 9, close: 11 }];

    await repository.saveCandles({ ...cacheKey, candles });

    await expect(repository.getCandles(cacheKey)).resolves.toEqual(candles);
    await expect(repository.getSummary()).resolves.toEqual({ coinCount: 1, candleCount: 1 });
  });

  it("bounds browser candle cache entries to avoid localStorage quota failures", async () => {
    const repository = new LocalStorageCandleRepository();
    const cacheKey = { provider: "binanceus" as const, coinId: "BTCUSD", currency: "usd", rangeKey: "all" };
    const candles = Array.from({ length: 1600 }, (_item, index) => ({
      timestamp: index,
      open: index,
      high: index + 1,
      low: index - 1,
      close: index,
    }));

    await repository.saveCandles({ ...cacheKey, candles });

    const storedCandles = await repository.getCandles(cacheKey);
    expect(storedCandles).toHaveLength(1500);
    expect(storedCandles[0]?.timestamp).toBe(100);
  });

  it("trims harder after a browser quota exception", async () => {
    const repository = new LocalStorageCandleRepository();
    const cacheKey = { provider: "binanceus" as const, coinId: "BTCUSD", currency: "usd", rangeKey: "all" };
    const candles = Array.from({ length: 1600 }, (_item, index) => ({
      timestamp: index,
      open: index,
      high: index + 1,
      low: index - 1,
      close: index,
    }));
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;

    Storage.prototype.setItem = function setItemWithSingleQuotaFailure(key: string, value: string) {
      calls += 1;

      if (calls === 1) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }

      return originalSetItem.call(this, key, value);
    };

    try {
      await repository.saveCandles({ ...cacheKey, candles });
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }

    const storedCandles = await repository.getCandles(cacheKey);
    expect(storedCandles).toHaveLength(500);
    expect(storedCandles[0]?.timestamp).toBe(1100);
  });
});
