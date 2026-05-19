import type {
  PaperCloseReason,
  PaperLedger,
  PaperMarketTick,
  PaperOrder,
  PaperOrderKind,
  PerpPosition,
  PerpSide,
  PlacePaperOrderInput,
  SpotOrderSide,
  SpotPosition,
  UpdatePaperOrderInput,
} from "./types";

const startingCashBalance = 100_000;

export function createDefaultPaperLedger(): PaperLedger {
  const now = new Date().toISOString();

  return {
    account: {
      cashBalance: startingCashBalance,
      realizedPnl: 0,
      updatedAt: now,
    },
    spotPositions: [],
    perpPositions: [],
    orders: [],
  };
}

export function placePaperOrder(ledger: PaperLedger, input: PlacePaperOrderInput): PaperLedger {
  const normalizedInput = normalizeInput(input);
  const createdOrder = createOrder(normalizedInput);

  //log rejections
  if (createdOrder.status === "rejected") {
    return appendOrder(ledger, createdOrder);
  }

  if (shouldFillEntryOrder(createdOrder.kind, normalizedInput.side, normalizedInput.currentPrice, normalizedInput.limitPrice)) {
    return fillOrder(appendOrder(ledger, createdOrder), createdOrder.id, normalizedInput.currentPrice);
  }

  return appendOrder(ledger, { ...createdOrder, status: "open", message: "Waiting for entry." });
}

export function processOpenPaperOrders(ledger: PaperLedger, tick: PaperMarketTick): PaperLedger {
  let nextLedger = ledger;

  //fill then risk check
  for (const order of ledger.orders.filter((candidateOrder) => candidateOrder.status === "open" && candidateOrder.assetId === tick.assetId)) {
    if (shouldFillEntryOrder(order.kind, order.side, tick.currentPrice, order.limitPrice)) {
      nextLedger = fillOrder(nextLedger, order.id, tick.currentPrice);
    }
  }

  for (const order of nextLedger.orders.filter((candidateOrder) => candidateOrder.status === "filled" && candidateOrder.assetId === tick.assetId)) {
    nextLedger = updateOpenTradeProfit(nextLedger, order.id, tick.currentPrice);
    const refreshedOrder = nextLedger.orders.find((candidateOrder) => candidateOrder.id === order.id);

    if (!refreshedOrder || refreshedOrder.status !== "filled") {
      continue;
    }

    const closeReason = getTriggeredRiskCloseReason(refreshedOrder, tick.currentPrice);

    if (closeReason) {
      nextLedger = closePaperOrder(nextLedger, refreshedOrder.id, tick.currentPrice, closeReason);
    }
  }

  return nextLedger;
}

export function cancelPaperOrder(ledger: PaperLedger, orderId: string): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order || order.status !== "open") {
    return ledger;
  }

  return updateOrder(ledger, orderId, {
    status: "cancelled",
    message: "Cancelled.",
    updatedAt: new Date().toISOString(),
  });
}

export function togglePaperOrderChartVisibility(ledger: PaperLedger, orderId: string): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order) {
    return ledger;
  }

  return updateOrder(ledger, orderId, {
    hiddenOnChart: !order.hiddenOnChart,
    updatedAt: new Date().toISOString(),
  });
}

export function updatePaperOrderRiskLimits(
  ledger: PaperLedger,
  orderId: string,
  riskLimits: { stopLimitPrice?: number; profitLimitPrice?: number },
): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order || order.status === "closed" || order.status === "cancelled" || order.status === "rejected") {
    return ledger;
  }

  return updateOrder(ledger, orderId, {
    stopLimitPrice: normalizeRiskLimit(riskLimits.stopLimitPrice),
    profitLimitPrice: normalizeRiskLimit(riskLimits.profitLimitPrice),
    updatedAt: new Date().toISOString(),
  });
}

export function updatePaperOrder(ledger: PaperLedger, input: UpdatePaperOrderInput): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === input.orderId);

  if (!order || order.status === "closed" || order.status === "cancelled" || order.status === "rejected") {
    return ledger;
  }

  const nextOrder: Partial<PaperOrder> = {
    updatedAt: new Date().toISOString(),
    stopLimitPrice: normalizeRiskLimit(input.stopLimitPrice),
    profitLimitPrice: normalizeRiskLimit(input.profitLimitPrice),
  };

  if (order.status === "open") {
    const nextQuantity = normalizePositiveNumber(input.quantity);
    const nextLimitPrice = normalizeRiskLimit(input.limitPrice);
    const nextLeverage = normalizePositiveNumber(input.leverage);

    if (nextQuantity) {
      nextOrder.quantity = nextQuantity;
    }

    nextOrder.limitPrice = order.kind === "spot-market" ? undefined : nextLimitPrice;

    if (order.kind === "perp" && nextLeverage) {
      nextOrder.leverage = Math.max(1, nextLeverage);
    }
  }

  return updateOrder(ledger, input.orderId, nextOrder);
}

export function closePaperOrder(
  ledger: PaperLedger,
  orderId: string,
  currentPrice: number,
  closeReason: PaperCloseReason = "manual",
): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order || order.status !== "filled" || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return ledger;
  }

  if (order.kind === "perp") {
    return closePerpOrder(ledger, order, currentPrice, closeReason);
  }

  if (order.side !== "buy") {
    return updateOrder(ledger, order.id, {
      status: "closed",
      exitPrice: currentPrice,
      closedAt: new Date().toISOString(),
      closeReason,
      message: "Sold.",
    });
  }

  return closeSpotBuyOrder(ledger, order, currentPrice, closeReason);
}

function fillOrder(ledger: PaperLedger, orderId: string, executionPrice: number): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order) {
    return ledger;
  }

  if (order.kind === "perp") {
    return fillPerpOrder(ledger, order, executionPrice);
  }

  return fillSpotOrder(ledger, order, executionPrice);
}

function fillSpotOrder(ledger: PaperLedger, order: PaperOrder, executionPrice: number): PaperLedger {
  const side = order.side as SpotOrderSide;
  const now = new Date().toISOString();
  const notional = order.quantity * executionPrice;

  if (side === "buy") {
    if (ledger.account.cashBalance < notional) {
      return updateOrder(ledger, order.id, {
        status: "rejected",
        message: "Insufficient paper cash.",
        updatedAt: now,
      });
    }

    const existingPosition = ledger.spotPositions.find((position) => position.assetId === order.assetId);
    const nextPositions = upsertSpotPosition(ledger.spotPositions, {
      assetId: order.assetId,
      symbol: order.symbol,
      quantity: (existingPosition?.quantity ?? 0) + order.quantity,
      averagePrice: weightedAveragePrice(existingPosition, order.quantity, executionPrice),
      updatedAt: now,
    });

    return updateOrder(
      {
        ...ledger,
        account: {
          ...ledger.account,
          cashBalance: ledger.account.cashBalance - notional,
          updatedAt: now,
        },
        spotPositions: nextPositions,
      },
      order.id,
      {
        status: "filled",
        executionPrice,
        profitAmount: 0,
        profitPercent: 0,
        message: "Filled.",
        updatedAt: now,
      },
    );
  }

  const existingPosition = ledger.spotPositions.find((position) => position.assetId === order.assetId);

  if (!existingPosition || existingPosition.quantity < order.quantity) {
    return updateOrder(ledger, order.id, {
      status: "rejected",
      message: "Insufficient spot position.",
      updatedAt: now,
    });
  }

  const realizedPnl = (executionPrice - existingPosition.averagePrice) * order.quantity;
  const remainingQuantity = existingPosition.quantity - order.quantity;
  const nextPositions =
    remainingQuantity <= 0
      ? ledger.spotPositions.filter((position) => position.assetId !== order.assetId)
      : upsertSpotPosition(ledger.spotPositions, { ...existingPosition, quantity: remainingQuantity, updatedAt: now });

  return updateOrder(
    {
      ...ledger,
      account: {
        ...ledger.account,
        cashBalance: ledger.account.cashBalance + notional,
        realizedPnl: ledger.account.realizedPnl + realizedPnl,
        updatedAt: now,
      },
      spotPositions: nextPositions,
    },
    order.id,
    {
      status: "closed",
      executionPrice,
      exitPrice: executionPrice,
      profitAmount: realizedPnl,
      profitPercent: existingPosition.averagePrice > 0 ? (realizedPnl / (existingPosition.averagePrice * order.quantity)) * 100 : 0,
      closedAt: now,
      closeReason: "manual",
      message: "Sold.",
      updatedAt: now,
    },
  );
}

function fillPerpOrder(ledger: PaperLedger, order: PaperOrder, executionPrice: number): PaperLedger {
  const side = order.side as PerpSide;
  const now = new Date().toISOString();
  const leverage = order.leverage ?? 1;
  const margin = (order.quantity * executionPrice) / leverage;
  const positionId = createId();

  //reserve margin
  if (ledger.account.cashBalance < margin) {
    return updateOrder(ledger, order.id, {
      status: "rejected",
      message: "Insufficient paper cash for margin.",
      updatedAt: now,
    });
  }

  return updateOrder(
    {
      ...ledger,
      account: {
        ...ledger.account,
        cashBalance: ledger.account.cashBalance - margin,
        updatedAt: now,
      },
      perpPositions: [
        ...ledger.perpPositions,
        {
          id: positionId,
          assetId: order.assetId,
          symbol: order.symbol,
          side,
          quantity: order.quantity,
          entryPrice: executionPrice,
          leverage,
          margin,
          openedAt: now,
          updatedAt: now,
        },
      ],
    },
    order.id,
    {
      status: "filled",
      executionPrice,
      profitAmount: 0,
      profitPercent: 0,
      positionId,
      margin,
      message: "Perp opened.",
      updatedAt: now,
    },
  );
}

function closeSpotBuyOrder(
  ledger: PaperLedger,
  order: PaperOrder,
  currentPrice: number,
  closeReason: PaperCloseReason,
): PaperLedger {
  const now = new Date().toISOString();
  const existingPosition = ledger.spotPositions.find((position) => position.assetId === order.assetId);

  if (!existingPosition || existingPosition.quantity < order.quantity || !order.executionPrice) {
    return ledger;
  }

  const realizedPnl = (currentPrice - order.executionPrice) * order.quantity;
  const remainingQuantity = existingPosition.quantity - order.quantity;
  const nextPositions =
    remainingQuantity <= 0
      ? ledger.spotPositions.filter((position) => position.assetId !== order.assetId)
      : upsertSpotPosition(ledger.spotPositions, { ...existingPosition, quantity: remainingQuantity, updatedAt: now });

  return updateOrder(
    {
      ...ledger,
      account: {
        ...ledger.account,
        cashBalance: ledger.account.cashBalance + order.quantity * currentPrice,
        realizedPnl: ledger.account.realizedPnl + realizedPnl,
        updatedAt: now,
      },
      spotPositions: nextPositions,
    },
    order.id,
    {
      status: "closed",
      exitPrice: currentPrice,
      profitAmount: realizedPnl,
      profitPercent: calculateSpotProfitPercent(order, currentPrice),
      closedAt: now,
      closeReason,
      message: closeReason === "manual" ? "Sold." : closeReason === "stop-limit" ? "Stop limit filled." : "Profit limit filled.",
      updatedAt: now,
    },
  );
}

function closePerpOrder(
  ledger: PaperLedger,
  order: PaperOrder,
  currentPrice: number,
  closeReason: PaperCloseReason,
): PaperLedger {
  const now = new Date().toISOString();
  const position = findPerpPosition(ledger, order);

  if (!position) {
    return ledger;
  }

  const profitAmount = calculatePerpProfit(position, currentPrice);

  return updateOrder(
    {
      ...ledger,
      account: {
        ...ledger.account,
        cashBalance: ledger.account.cashBalance + position.margin + profitAmount,
        realizedPnl: ledger.account.realizedPnl + profitAmount,
        updatedAt: now,
      },
      perpPositions: ledger.perpPositions.filter((candidatePosition) => candidatePosition.id !== position.id),
    },
    order.id,
    {
      status: "closed",
      exitPrice: currentPrice,
      profitAmount,
      profitPercent: position.margin > 0 ? (profitAmount / position.margin) * 100 : 0,
      closedAt: now,
      closeReason,
      message: closeReason === "manual" ? "Closed." : closeReason === "stop-limit" ? "Stop limit filled." : "Profit limit filled.",
      updatedAt: now,
    },
  );
}

function updateOpenTradeProfit(ledger: PaperLedger, orderId: string, currentPrice: number): PaperLedger {
  const order = ledger.orders.find((candidateOrder) => candidateOrder.id === orderId);

  if (!order || order.status !== "filled") {
    return ledger;
  }

  if (order.kind === "perp") {
    const position = findPerpPosition(ledger, order);

    if (!position) {
      return ledger;
    }

    const profitAmount = calculatePerpProfit(position, currentPrice);

    return updateOrder(ledger, order.id, {
      profitAmount,
      profitPercent: position.margin > 0 ? (profitAmount / position.margin) * 100 : 0,
      updatedAt: new Date().toISOString(),
    });
  }

  if (order.side !== "buy") {
    return ledger;
  }

  return updateOrder(ledger, order.id, {
    profitAmount: calculateSpotProfitAmount(order, currentPrice),
    profitPercent: calculateSpotProfitPercent(order, currentPrice),
    updatedAt: new Date().toISOString(),
  });
}

function normalizeInput(input: PlacePaperOrderInput): PlacePaperOrderInput {
  return {
    ...input,
    quantity: Number(input.quantity),
    currentPrice: Number(input.currentPrice),
    limitPrice: input.limitPrice === undefined ? undefined : Number(input.limitPrice),
    stopLimitPrice: input.stopLimitPrice === undefined ? undefined : Number(input.stopLimitPrice),
    profitLimitPrice: input.profitLimitPrice === undefined ? undefined : Number(input.profitLimitPrice),
    leverage: input.leverage === undefined ? undefined : Math.max(1, Number(input.leverage)),
  };
}

function createOrder(input: PlacePaperOrderInput): PaperOrder {
  const now = new Date().toISOString();
  const rejectionMessage = validateInput(input);

  return {
    id: createId(),
    kind: input.kind,
    status: rejectionMessage ? "rejected" : "open",
    exchange: input.exchange ?? "Binance.US",
    assetId: input.assetId,
    symbol: input.symbol,
    pair: input.pair,
    side: input.side,
    quantity: input.quantity,
    limitPrice: input.limitPrice,
    stopLimitPrice: input.stopLimitPrice,
    profitLimitPrice: input.profitLimitPrice,
    leverage: input.leverage,
    createdAt: now,
    updatedAt: now,
    message: rejectionMessage ?? "Accepted.",
    hiddenOnChart: false,
  };
}

function validateInput(input: PlacePaperOrderInput) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Quantity must be greater than zero.";
  }

  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    return "Current market price is unavailable.";
  }

  if (input.kind === "spot-limit" && (!input.limitPrice || input.limitPrice <= 0)) {
    return "Limit price must be greater than zero.";
  }

  if (input.kind === "perp" && input.limitPrice !== undefined && (!Number.isFinite(input.limitPrice) || input.limitPrice <= 0)) {
    return "Entry price must be greater than zero.";
  }

  if (input.stopLimitPrice !== undefined && (!Number.isFinite(input.stopLimitPrice) || input.stopLimitPrice <= 0)) {
    return "Stop limit must be greater than zero.";
  }

  if (input.profitLimitPrice !== undefined && (!Number.isFinite(input.profitLimitPrice) || input.profitLimitPrice <= 0)) {
    return "Profit limit must be greater than zero.";
  }

  if (input.kind === "perp" && (!input.leverage || input.leverage < 1)) {
    return "Leverage must be at least 1x.";
  }

  return null;
}

function shouldFillEntryOrder(kind: PaperOrderKind, side: PaperOrder["side"], currentPrice: number, limitPrice?: number) {
  if (kind === "spot-market" || (kind === "perp" && !limitPrice)) {
    return true;
  }

  const isBuyLike = side === "buy" || side === "long";
  return isBuyLike ? currentPrice <= (limitPrice ?? 0) : currentPrice >= (limitPrice ?? Number.MAX_VALUE);
}

function getTriggeredRiskCloseReason(order: PaperOrder, currentPrice: number): PaperCloseReason | null {
  if (!order.stopLimitPrice && !order.profitLimitPrice) {
    return null;
  }

  //shorts invert limits
  const isShort = order.side === "short";

  if (order.stopLimitPrice) {
    const stopTriggered = isShort ? currentPrice >= order.stopLimitPrice : currentPrice <= order.stopLimitPrice;

    if (stopTriggered) {
      return "stop-limit";
    }
  }

  if (order.profitLimitPrice) {
    const profitTriggered = isShort ? currentPrice <= order.profitLimitPrice : currentPrice >= order.profitLimitPrice;

    if (profitTriggered) {
      return "profit-limit";
    }
  }

  return null;
}

function calculateSpotProfitAmount(order: PaperOrder, currentPrice: number) {
  return order.executionPrice ? (currentPrice - order.executionPrice) * order.quantity : 0;
}

function calculateSpotProfitPercent(order: PaperOrder, currentPrice: number) {
  const costBasis = (order.executionPrice ?? 0) * order.quantity;
  return costBasis > 0 ? (calculateSpotProfitAmount(order, currentPrice) / costBasis) * 100 : 0;
}

function calculatePerpProfit(position: PerpPosition, currentPrice: number) {
  return position.side === "long"
    ? (currentPrice - position.entryPrice) * position.quantity
    : (position.entryPrice - currentPrice) * position.quantity;
}

function findPerpPosition(ledger: PaperLedger, order: PaperOrder) {
  if (order.positionId) {
    return ledger.perpPositions.find((position) => position.id === order.positionId);
  }

  return ledger.perpPositions.find(
    (position) =>
      position.assetId === order.assetId &&
      position.side === order.side &&
      position.quantity === order.quantity &&
      position.entryPrice === order.executionPrice,
  );
}

function appendOrder(ledger: PaperLedger, order: PaperOrder): PaperLedger {
  return { ...ledger, orders: [order, ...ledger.orders] };
}

function updateOrder(ledger: PaperLedger, orderId: string, update: Partial<PaperOrder>): PaperLedger {
  return {
    ...ledger,
    orders: ledger.orders.map((order) => (order.id === orderId ? { ...order, ...update } : order)),
  };
}

function upsertSpotPosition(positions: SpotPosition[], nextPosition: SpotPosition) {
  const existingIndex = positions.findIndex((position) => position.assetId === nextPosition.assetId);

  if (existingIndex === -1) {
    return [...positions, nextPosition];
  }

  return positions.map((position, index) => (index === existingIndex ? nextPosition : position));
}

function weightedAveragePrice(existingPosition: SpotPosition | undefined, nextQuantity: number, nextPrice: number) {
  if (!existingPosition) {
    return nextPrice;
  }

  const totalQuantity = existingPosition.quantity + nextQuantity;
  const currentCostBasis = existingPosition.quantity * existingPosition.averagePrice;
  const nextCostBasis = nextQuantity * nextPrice;

  return (currentCostBasis + nextCostBasis) / totalQuantity;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRiskLimit(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : undefined;
}

function normalizePositiveNumber(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : undefined;
}
