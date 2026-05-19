import { describe, expect, it } from "vitest";
import { sanitizeReplaySessions } from "../replayRepository";

describe("replayRepository", () => {
  it("sanitizes persisted replay sessions", () => {
    const sessions = sanitizeReplaySessions([
      {
        id: "replay-1",
        name: "BTC replay",
        assetId: "binanceus:BTCUSDT",
        symbol: "BTC",
        pair: "BTC/USDT",
        exchange: "Binance.US",
        rangePreset: "5m",
        from: 1,
        to: 2,
        startingCash: 1000,
        currentIndex: 3.6,
        playbackSpeed: 10,
        status: "paused",
        ledger: {
          account: { cashBalance: 900, realizedPnl: 25, updatedAt: "2026-01-01T00:00:00.000Z" },
          spotPositions: [],
          perpPositions: [],
          orders: [
            {
              id: "order-1",
              kind: "spot-market",
              status: "closed",
              exchange: "Binance.US",
              assetId: "binanceus:BTCUSDT",
              symbol: "BTC",
              pair: "BTC/USDT",
              side: "buy",
              quantity: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:10:00.000Z",
              profitAmount: 25,
            },
          ],
        },
        equityPoints: [{ timestamp: 1, equity: 1025, cash: 1025, realizedPnl: 25, unrealizedPnl: 0 }],
        events: [{ id: "event-1", timestamp: 1, type: "close", message: "Trade closed." }],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:10:00.000Z",
      },
      { id: "bad" },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "replay-1",
      currentIndex: 3,
      playbackSpeed: 10,
      ledger: {
        account: { cashBalance: 900, realizedPnl: 25 },
        orders: [{ id: "order-1", profitAmount: 25 }],
      },
    });
  });
});
