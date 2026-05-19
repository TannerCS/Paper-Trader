import type { PaperLedger, PaperOrderKind, PerpSide, SpotOrderSide } from "../paper/types";
import type { TerminalRangePreset } from "../../types/marketData";

export type ReplayStatus = "draft" | "running" | "paused" | "completed";

export interface ReplayEquityPoint {
  timestamp: number;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface ReplayEvent {
  id: string;
  timestamp: number;
  type: "session" | "order" | "fill" | "close" | "cancel" | "risk";
  message: string;
}

export interface ReplaySession {
  id: string;
  name: string;
  assetId: string;
  symbol: string;
  pair: string;
  exchange: string;
  rangePreset: TerminalRangePreset;
  from: number;
  to: number;
  startingCash: number;
  currentIndex: number;
  playbackSpeed: number;
  status: ReplayStatus;
  ledger: PaperLedger;
  equityPoints: ReplayEquityPoint[];
  events: ReplayEvent[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateReplaySessionInput {
  assetId: string;
  symbol: string;
  pair: string;
  exchange: string;
  rangePreset: TerminalRangePreset;
  from: number;
  to: number;
  startingCash: number;
}

export interface PlaceReplayOrderInput {
  kind: PaperOrderKind;
  side: SpotOrderSide | PerpSide;
  quantity: number;
  currentPrice: number;
  limitPrice?: number;
  stopLimitPrice?: number;
  profitLimitPrice?: number;
  leverage?: number;
}

export interface ReplayStats {
  netPnl: number;
  returnPercent: number;
  winRate: number;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
}
