import { describe, expect, it } from "vitest";
import {
  cancelPaperOrder,
  closePaperOrder,
  createDefaultPaperLedger,
  placePaperOrder,
  processOpenPaperOrders,
  togglePaperOrderChartVisibility,
  updatePaperOrder,
  updatePaperOrderRiskLimits,
} from "../paperTradingEngine";

describe("paperTradingEngine", () => {
  it("fills spot market buy orders immediately", () => {
    const ledger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-market",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 0.5,
      currentPrice: 100,
    });

    expect(ledger.account.cashBalance).toBe(99_950);
    expect(ledger.spotPositions[0]).toMatchObject({ assetId: "BTCUSD", quantity: 0.5, averagePrice: 100 });
    expect(ledger.orders[0]).toMatchObject({ status: "filled", executionPrice: 100 });
  });

  it("keeps limit orders open until the market crosses the target", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-limit",
      assetId: "ETHUSD",
      symbol: "ETH",
      pair: "ETH/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 110,
      limitPrice: 100,
    });

    expect(openLedger.orders[0].status).toBe("open");

    const filledLedger = processOpenPaperOrders(openLedger, { assetId: "ETHUSD", currentPrice: 99 });
    expect(filledLedger.orders[0]).toMatchObject({ status: "filled", executionPrice: 99 });
    expect(filledLedger.spotPositions[0]).toMatchObject({ quantity: 1, averagePrice: 99 });
  });

  it("opens paper perpetual positions with margin", () => {
    const ledger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "perp",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "short",
      quantity: 1,
      currentPrice: 100,
      leverage: 5,
    });

    expect(ledger.account.cashBalance).toBe(99_980);
    expect(ledger.perpPositions[0]).toMatchObject({ side: "short", quantity: 1, entryPrice: 100, leverage: 5, margin: 20 });
  });

  it("keeps perp long entry orders open until price falls to the target", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "perp",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "long",
      quantity: 1,
      currentPrice: 110,
      limitPrice: 100,
      leverage: 5,
    });

    expect(openLedger.orders[0]).toMatchObject({ status: "open", limitPrice: 100 });
    expect(openLedger.perpPositions).toEqual([]);

    const filledLedger = processOpenPaperOrders(openLedger, { assetId: "BTCUSD", currentPrice: 99 });

    expect(filledLedger.orders[0]).toMatchObject({ status: "filled", executionPrice: 99 });
    expect(filledLedger.perpPositions[0]).toMatchObject({ side: "long", entryPrice: 99 });
  });

  it("keeps perp short entry orders open until price rises to the target", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "perp",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "short",
      quantity: 1,
      currentPrice: 90,
      limitPrice: 100,
      leverage: 5,
    });

    expect(openLedger.orders[0]).toMatchObject({ status: "open", limitPrice: 100 });
    expect(openLedger.perpPositions).toEqual([]);

    const filledLedger = processOpenPaperOrders(openLedger, { assetId: "BTCUSD", currentPrice: 101 });

    expect(filledLedger.orders[0]).toMatchObject({ status: "filled", executionPrice: 101 });
    expect(filledLedger.perpPositions[0]).toMatchObject({ side: "short", entryPrice: 101 });
  });

  it("closes filled spot trades and records realized profit", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-market",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 100,
    });

    const closedLedger = closePaperOrder(openLedger, openLedger.orders[0].id, 125);

    expect(closedLedger.orders[0]).toMatchObject({ status: "closed", exitPrice: 125, profitAmount: 25, profitPercent: 25 });
    expect(closedLedger.account.cashBalance).toBe(100_025);
    expect(closedLedger.spotPositions).toEqual([]);
  });

  it("cancels open limit orders before execution", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-limit",
      assetId: "ETHUSD",
      symbol: "ETH",
      pair: "ETH/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 110,
      limitPrice: 100,
    });

    const cancelledLedger = cancelPaperOrder(openLedger, openLedger.orders[0].id);

    expect(cancelledLedger.orders[0]).toMatchObject({ status: "cancelled", message: "Cancelled." });
  });

  it("toggles persisted order chart visibility", () => {
    const ledger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-market",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 100,
    });

    const hiddenLedger = togglePaperOrderChartVisibility(ledger, ledger.orders[0].id);
    const visibleLedger = togglePaperOrderChartVisibility(hiddenLedger, ledger.orders[0].id);

    expect(hiddenLedger.orders[0].hiddenOnChart).toBe(true);
    expect(visibleLedger.orders[0].hiddenOnChart).toBe(false);
  });

  it("updates persisted risk limits for active orders", () => {
    const ledger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-market",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 100,
    });

    const updatedLedger = updatePaperOrderRiskLimits(ledger, ledger.orders[0].id, {
      stopLimitPrice: 90,
      profitLimitPrice: 125,
    });

    expect(updatedLedger.orders[0]).toMatchObject({
      stopLimitPrice: 90,
      profitLimitPrice: 125,
    });
  });

  it("stores exchange identity and edits unfilled entry orders", () => {
    const ledger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-limit",
      exchange: "OKX",
      assetId: "okx:BTC-USDT",
      symbol: "BTC",
      pair: "BTC/USDT",
      side: "buy",
      quantity: 1,
      currentPrice: 110,
      limitPrice: 100,
    });

    const updatedLedger = updatePaperOrder(ledger, {
      orderId: ledger.orders[0].id,
      quantity: 2,
      limitPrice: 95,
      stopLimitPrice: 90,
      profitLimitPrice: 125,
    });

    expect(updatedLedger.orders[0]).toMatchObject({
      exchange: "OKX",
      quantity: 2,
      limitPrice: 95,
      stopLimitPrice: 90,
      profitLimitPrice: 125,
    });
  });

  it("closes filled trades when attached profit limits trigger", () => {
    const openLedger = placePaperOrder(createDefaultPaperLedger(), {
      kind: "spot-market",
      assetId: "BTCUSD",
      symbol: "BTC",
      pair: "BTC/USD",
      side: "buy",
      quantity: 1,
      currentPrice: 100,
      profitLimitPrice: 120,
    });

    const closedLedger = processOpenPaperOrders(openLedger, { assetId: "BTCUSD", currentPrice: 121 });

    expect(closedLedger.orders[0]).toMatchObject({
      status: "closed",
      closeReason: "profit-limit",
      exitPrice: 121,
      profitAmount: 21,
    });
  });
});
