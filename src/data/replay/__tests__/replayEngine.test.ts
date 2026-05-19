import { describe, expect, it } from "vitest";
import {
  advanceReplaySession,
  calculateReplayStats,
  closeReplayOrder,
  createReplaySession,
  placeReplayOrder,
  setReplaySpeed,
} from "../replayEngine";
import type { OhlcCandle } from "../../../types/marketData";

const candles: OhlcCandle[] = [
  { timestamp: Date.UTC(2026, 0, 1, 0, 0), open: 100, high: 102, low: 98, close: 100, volume: 10 },
  { timestamp: Date.UTC(2026, 0, 1, 0, 5), open: 100, high: 101, low: 93, close: 94, volume: 12 },
  { timestamp: Date.UTC(2026, 0, 1, 0, 10), open: 94, high: 121, low: 94, close: 120, volume: 15 },
];

function createSession() {
  return createReplaySession(
    {
      assetId: "binanceus:BTCUSDT",
      symbol: "BTC",
      pair: "BTC/USDT",
      exchange: "Binance.US",
      rangePreset: "5m",
      from: candles[0].timestamp,
      to: candles[candles.length - 1]?.timestamp ?? candles[0].timestamp,
      startingCash: 1_000,
    },
    candles,
  );
}

describe("replayEngine", () => {
  it("creates a paused replay session with starting equity", () => {
    const session = createSession();

    expect(session).toMatchObject({
      assetId: "binanceus:BTCUSDT",
      pair: "BTC/USDT",
      exchange: "Binance.US",
      currentIndex: 0,
      status: "paused",
      startingCash: 1_000,
    });
    expect(session.ledger.account.cashBalance).toBe(1_000);
    expect(session.equityPoints[0]).toMatchObject({ timestamp: candles[0].timestamp, equity: 1_000 });
  });

  it("places replay market orders at the replay candle time", () => {
    const session = placeReplayOrder(
      createSession(),
      {
        kind: "spot-market",
        side: "buy",
        quantity: 1,
        currentPrice: candles[0].close,
      },
      candles[0],
    );
    const order = session.ledger.orders[0];

    expect(order).toMatchObject({ status: "filled", executionPrice: 100, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(session.ledger.spotPositions[0]).toMatchObject({ quantity: 1, averagePrice: 100 });
    expect(session.ledger.account.cashBalance).toBe(900);
  });

  it("advances the replay clock through limit fills and attached profit targets", () => {
    const withLimitOrder = placeReplayOrder(
      createSession(),
      {
        kind: "spot-limit",
        side: "buy",
        quantity: 1,
        currentPrice: candles[0].close,
        limitPrice: 95,
        profitLimitPrice: 110,
      },
      candles[0],
    );

    const filledSession = advanceReplaySession(withLimitOrder, candles);
    const closedSession = advanceReplaySession(filledSession, candles);
    const stats = calculateReplayStats(closedSession);

    expect(filledSession.ledger.orders[0]).toMatchObject({
      status: "filled",
      executionPrice: 94,
      updatedAt: "2026-01-01T00:05:00.000Z",
    });
    expect(closedSession.ledger.orders[0]).toMatchObject({
      status: "closed",
      closeReason: "profit-limit",
      exitPrice: 120,
      closedAt: "2026-01-01T00:10:00.000Z",
      profitAmount: 26,
    });
    expect(stats).toMatchObject({ netPnl: 26, closedTrades: 1, openTrades: 0, winRate: 100 });
  });

  it("supports replay speed changes and manual close stats", () => {
    const session = placeReplayOrder(
      createSession(),
      {
        kind: "spot-market",
        side: "buy",
        quantity: 1,
        currentPrice: candles[0].close,
      },
      candles[0],
    );
    const closedSession = closeReplayOrder(setReplaySpeed(session, 25), session.ledger.orders[0].id, 120, candles[2]);
    const stats = calculateReplayStats(closedSession);

    expect(closedSession.playbackSpeed).toBe(25);
    expect(closedSession.ledger.orders[0]).toMatchObject({ status: "closed", exitPrice: 120, profitAmount: 20 });
    expect(stats.returnPercent).toBe(2);
  });
});
