export type PaperOrderKind = "spot-market" | "spot-limit" | "perp";
export type PaperOrderStatus = "open" | "filled" | "closed" | "rejected" | "cancelled";
export type PaperCloseReason = "manual" | "stop-limit" | "profit-limit";
export type SpotOrderSide = "buy" | "sell";
export type PerpSide = "long" | "short";

export interface PaperAccount {
  cashBalance: number;
  realizedPnl: number;
  updatedAt: string;
}

export interface SpotPosition {
  assetId: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  updatedAt: string;
}

export interface PerpPosition {
  id: string;
  assetId: string;
  symbol: string;
  side: PerpSide;
  quantity: number;
  entryPrice: number;
  leverage: number;
  margin: number;
  openedAt: string;
  updatedAt: string;
}

export interface PaperOrder {
  id: string;
  kind: PaperOrderKind;
  status: PaperOrderStatus;
  exchange: string;
  assetId: string;
  symbol: string;
  pair: string;
  side: SpotOrderSide | PerpSide;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  limitPrice?: number;
  stopLimitPrice?: number;
  profitLimitPrice?: number;
  executionPrice?: number;
  exitPrice?: number;
  profitAmount?: number;
  profitPercent?: number;
  positionId?: string;
  leverage?: number;
  margin?: number;
  hiddenOnChart?: boolean;
  closedAt?: string;
  closeReason?: PaperCloseReason;
  message?: string;
}

export interface PaperLedger {
  account: PaperAccount;
  spotPositions: SpotPosition[];
  perpPositions: PerpPosition[];
  orders: PaperOrder[];
}

export interface PlacePaperOrderInput {
  kind: PaperOrderKind;
  exchange?: string;
  assetId: string;
  symbol: string;
  pair: string;
  side: SpotOrderSide | PerpSide;
  quantity: number;
  currentPrice: number;
  limitPrice?: number;
  stopLimitPrice?: number;
  profitLimitPrice?: number;
  leverage?: number;
}

export interface PaperMarketTick {
  assetId: string;
  currentPrice: number;
}

export interface UpdatePaperOrderInput {
  orderId: string;
  quantity?: number;
  limitPrice?: number;
  stopLimitPrice?: number;
  profitLimitPrice?: number;
  leverage?: number;
}
