import {
  cancelPaperOrder,
  closePaperOrder,
  createDefaultPaperLedger,
  placePaperOrder,
  processOpenPaperOrders,
  togglePaperOrderChartVisibility,
  updatePaperOrder,
  updatePaperOrderRiskLimits,
} from "../paper/paperTradingEngine";
import type { PaperLedger, PaperOrder, UpdatePaperOrderInput } from "../paper/types";
import type { OhlcCandle } from "../../types/marketData";
import type {
  CreateReplaySessionInput,
  PlaceReplayOrderInput,
  ReplayEquityPoint,
  ReplayEvent,
  ReplaySession,
  ReplayStats,
} from "./types";

export function createReplaySession(input: CreateReplaySessionInput, candles: OhlcCandle[]): ReplaySession {
  const now = new Date().toISOString();
  const firstCandle = candles[0];
  const ledger = createDefaultPaperLedger();
  const startingCash = Math.max(1, input.startingCash);
  const session: ReplaySession = {
    id: createId("replay"),
    name: `${input.pair} ${input.rangePreset} replay`,
    assetId: input.assetId,
    symbol: input.symbol,
    pair: input.pair,
    exchange: input.exchange,
    rangePreset: input.rangePreset,
    from: input.from,
    to: input.to,
    startingCash,
    currentIndex: 0,
    playbackSpeed: 1,
    status: "paused",
    ledger: {
      ...ledger,
      account: {
        cashBalance: startingCash,
        realizedPnl: 0,
        updatedAt: firstCandle ? new Date(firstCandle.timestamp).toISOString() : now,
      },
    },
    equityPoints: [],
    events: [
      createReplayEvent(firstCandle?.timestamp ?? Date.now(), "session", `Started ${input.pair} replay.`),
    ],
    createdAt: now,
    updatedAt: now,
  };

  return recordReplayEquity(session, firstCandle);
}

export function advanceReplaySession(session: ReplaySession, candles: OhlcCandle[], steps = 1): ReplaySession {
  let nextSession = session;

  //feed candles into ledger
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    const nextIndex = Math.min(candles.length - 1, nextSession.currentIndex + 1);
    const candle = candles[nextIndex];

    if (!candle || nextIndex === nextSession.currentIndex) {
      return completeReplaySession(nextSession, candles[nextSession.currentIndex]);
    }

    const beforeOrders = nextSession.ledger.orders;
    const ledger = processOpenPaperOrders(nextSession.ledger, {
      assetId: nextSession.assetId,
      currentPrice: candle.close,
    });
    nextSession = recordReplayEquity({
      ...nextSession,
      currentIndex: nextIndex,
      ledger: retimeChangedLedger(ledger, beforeOrders, candle.timestamp),
      events: [
        ...nextSession.events,
        ...createOrderTransitionEvents(beforeOrders, ledger.orders, candle.timestamp),
      ].slice(-300),
      status: nextIndex >= candles.length - 1 ? "completed" : nextSession.status,
      updatedAt: new Date().toISOString(),
      completedAt: nextIndex >= candles.length - 1 ? new Date(candle.timestamp).toISOString() : nextSession.completedAt,
    }, candle);
  }

  return nextSession;
}

export function rewindReplaySession(session: ReplaySession, targetIndex = 0): ReplaySession {
  return {
    ...session,
    currentIndex: Math.max(0, Math.min(targetIndex, session.currentIndex)),
    status: "paused",
    updatedAt: new Date().toISOString(),
  };
}

export function setReplayStatus(session: ReplaySession, status: ReplaySession["status"]): ReplaySession {
  return {
    ...session,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function setReplaySpeed(session: ReplaySession, playbackSpeed: number): ReplaySession {
  return {
    ...session,
    playbackSpeed: Math.max(1, playbackSpeed),
    updatedAt: new Date().toISOString(),
  };
}

export function placeReplayOrder(session: ReplaySession, input: PlaceReplayOrderInput, candle: OhlcCandle): ReplaySession {
  const beforeOrders = session.ledger.orders;
  const ledger = placePaperOrder(session.ledger, {
    kind: input.kind,
    exchange: session.exchange,
    assetId: session.assetId,
    symbol: session.symbol,
    pair: session.pair,
    side: input.side,
    quantity: input.quantity,
    currentPrice: input.currentPrice,
    limitPrice: input.limitPrice,
    stopLimitPrice: input.stopLimitPrice,
    profitLimitPrice: input.profitLimitPrice,
    leverage: input.leverage,
  });
  const replayLedger = retimeChangedLedger(ledger, beforeOrders, candle.timestamp);
  const createdOrder = replayLedger.orders[0];

  return recordReplayEquity({
    ...session,
    ledger: replayLedger,
    events: [
      ...session.events,
      createReplayEvent(candle.timestamp, "order", `${orderLabel(createdOrder)} ${createdOrder.status}.`),
    ].slice(-300),
    updatedAt: new Date().toISOString(),
  }, candle);
}

export function cancelReplayOrder(session: ReplaySession, orderId: string, candle: OhlcCandle): ReplaySession {
  const ledger = retimeChangedLedger(cancelPaperOrder(session.ledger, orderId), session.ledger.orders, candle.timestamp);
  return recordReplayEquity({
    ...session,
    ledger,
    events: [...session.events, createReplayEvent(candle.timestamp, "cancel", "Order cancelled.")].slice(-300),
    updatedAt: new Date().toISOString(),
  }, candle);
}

export function closeReplayOrder(session: ReplaySession, orderId: string, price: number, candle: OhlcCandle): ReplaySession {
  const ledger = retimeChangedLedger(closePaperOrder(session.ledger, orderId, price), session.ledger.orders, candle.timestamp);
  return recordReplayEquity({
    ...session,
    ledger,
    events: [...session.events, createReplayEvent(candle.timestamp, "close", "Trade closed.")].slice(-300),
    updatedAt: new Date().toISOString(),
  }, candle);
}

export function toggleReplayOrderVisibility(session: ReplaySession, orderId: string): ReplaySession {
  return {
    ...session,
    ledger: togglePaperOrderChartVisibility(session.ledger, orderId),
    updatedAt: new Date().toISOString(),
  };
}

export function updateReplayOrderRiskLimits(
  session: ReplaySession,
  orderId: string,
  riskLimits: { stopLimitPrice?: number; profitLimitPrice?: number },
  candle: OhlcCandle,
): ReplaySession {
  const ledger = retimeChangedLedger(
    updatePaperOrderRiskLimits(session.ledger, orderId, riskLimits),
    session.ledger.orders,
    candle.timestamp,
  );
  return recordReplayEquity({ ...session, ledger, updatedAt: new Date().toISOString() }, candle);
}

export function updateReplayOrder(session: ReplaySession, input: UpdatePaperOrderInput, candle: OhlcCandle): ReplaySession {
  const ledger = retimeChangedLedger(updatePaperOrder(session.ledger, input), session.ledger.orders, candle.timestamp);
  return recordReplayEquity({ ...session, ledger, updatedAt: new Date().toISOString() }, candle);
}

export function calculateReplayStats(session: ReplaySession): ReplayStats {
  const closedOrders = session.ledger.orders.filter((order) => order.status === "closed");
  const activeOrders = session.ledger.orders.filter((order) => order.status === "filled" || order.status === "open");
  const wins = closedOrders.filter((order) => (order.profitAmount ?? 0) > 0);
  const losses = closedOrders.filter((order) => (order.profitAmount ?? 0) < 0);
  const grossProfit = wins.reduce((total, order) => total + (order.profitAmount ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((total, order) => total + (order.profitAmount ?? 0), 0));
  const finalEquity = session.equityPoints[session.equityPoints.length - 1]?.equity ?? session.startingCash;
  const netPnl = finalEquity - session.startingCash;

  return {
    netPnl,
    returnPercent: session.startingCash > 0 ? (netPnl / session.startingCash) * 100 : 0,
    winRate: closedOrders.length > 0 ? (wins.length / closedOrders.length) * 100 : 0,
    totalTrades: session.ledger.orders.length,
    closedTrades: closedOrders.length,
    openTrades: activeOrders.length,
    averageWin: wins.length > 0 ? grossProfit / wins.length : 0,
    averageLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    maxDrawdown: calculateMaxDrawdown(session.equityPoints),
    bestTrade: Math.max(0, ...closedOrders.map((order) => order.profitAmount ?? 0)),
    worstTrade: Math.min(0, ...closedOrders.map((order) => order.profitAmount ?? 0)),
  };
}

export function calculateReplayEquity(ledger: PaperLedger, currentPrice: number) {
  const spotValue = ledger.spotPositions.reduce((total, position) => total + position.quantity * currentPrice, 0);
  const perpValue = ledger.perpPositions.reduce((total, position) => {
    const profit = position.side === "long"
      ? (currentPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - currentPrice) * position.quantity;
    return total + position.margin + profit;
  }, 0);
  const equity = ledger.account.cashBalance + spotValue + perpValue;

  return {
    equity,
    cash: ledger.account.cashBalance,
    realizedPnl: ledger.account.realizedPnl,
    unrealizedPnl: equity - ledger.account.cashBalance - ledger.account.realizedPnl,
  };
}

function completeReplaySession(session: ReplaySession, candle: OhlcCandle | undefined): ReplaySession {
  return {
    ...session,
    status: "completed",
    completedAt: candle ? new Date(candle.timestamp).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function recordReplayEquity(session: ReplaySession, candle: OhlcCandle | undefined): ReplaySession {
  if (!candle) {
    return session;
  }

  //snapshot equity
  const point = createEquityPoint(session.ledger, candle.timestamp, candle.close);
  const existingPoints = session.equityPoints.filter((equityPoint) => equityPoint.timestamp !== point.timestamp);

  return {
    ...session,
    equityPoints: [...existingPoints, point].sort((left, right) => left.timestamp - right.timestamp).slice(-2_000),
  };
}

function createEquityPoint(ledger: PaperLedger, timestamp: number, currentPrice: number): ReplayEquityPoint {
  return {
    timestamp,
    ...calculateReplayEquity(ledger, currentPrice),
  };
}

function retimeChangedLedger(ledger: PaperLedger, previousOrders: PaperOrder[], timestamp: number): PaperLedger {
  const replayTime = new Date(timestamp).toISOString();
  const previousById = new Map(previousOrders.map((order) => [order.id, JSON.stringify(order)]));

  //pin fills to replay time
  return {
    ...ledger,
    account: { ...ledger.account, updatedAt: replayTime },
    spotPositions: ledger.spotPositions.map((position) => ({ ...position, updatedAt: replayTime })),
    perpPositions: ledger.perpPositions.map((position) => ({ ...position, updatedAt: replayTime })),
    orders: ledger.orders.map((order) => {
      const wasChanged = previousById.get(order.id) !== JSON.stringify(order);

      if (!wasChanged) {
        return order;
      }

      return {
        ...order,
        createdAt: previousById.has(order.id) ? order.createdAt : replayTime,
        updatedAt: replayTime,
        closedAt: order.status === "closed" ? replayTime : order.closedAt,
      };
    }),
  };
}

function createOrderTransitionEvents(previousOrders: PaperOrder[], nextOrders: PaperOrder[], timestamp: number): ReplayEvent[] {
  const previousById = new Map(previousOrders.map((order) => [order.id, order]));

  return nextOrders.flatMap((order) => {
    const previousOrder = previousById.get(order.id);

    if (!previousOrder || previousOrder.status === order.status) {
      return [];
    }

    if (order.status === "filled") {
      return [createReplayEvent(timestamp, "fill", `${orderLabel(order)} filled at ${order.executionPrice ?? "market"}.`)];
    }

    if (order.status === "closed") {
      return [createReplayEvent(timestamp, order.closeReason === "manual" ? "close" : "risk", `${orderLabel(order)} closed.`)];
    }

    if (order.status === "rejected" || order.status === "cancelled") {
      return [createReplayEvent(timestamp, "cancel", `${orderLabel(order)} ${order.status}.`)];
    }

    return [];
  });
}

function createReplayEvent(timestamp: number, type: ReplayEvent["type"], message: string): ReplayEvent {
  return {
    id: createId("event"),
    timestamp,
    type,
    message,
  };
}

function calculateMaxDrawdown(points: ReplayEquityPoint[]) {
  let peak = points[0]?.equity ?? 0;
  let maximumDrawdown = 0;

  for (const point of points) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      maximumDrawdown = Math.max(maximumDrawdown, ((peak - point.equity) / peak) * 100);
    }
  }

  return maximumDrawdown;
}

function orderLabel(order: PaperOrder | undefined) {
  if (!order) {
    return "Order";
  }

  if (order.kind === "perp") {
    return `${order.side} perp`;
  }

  return `${order.side} ${order.kind === "spot-limit" ? "limit" : "market"}`;
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
