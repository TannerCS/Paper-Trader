import { isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../storage/database";
import type { PaperLedger, PaperOrder, PerpPosition, SpotPosition } from "../paper/types";
import { createDefaultPaperLedger } from "../paper/paperTradingEngine";
import type { ReplayEquityPoint, ReplayEvent, ReplaySession } from "./types";

export interface ReplayRepository {
  listSessions: () => Promise<ReplaySession[]>;
  saveSession: (session: ReplaySession) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const localStorageKey = "paper-trader.strategy-replay-sessions";
const settingsKey = "strategyReplaySessions";
const maximumStoredSessions = 40;

export class LocalStorageReplayRepository implements ReplayRepository {
  async listSessions() {
    return readLocalSessions();
  }

  async saveSession(session: ReplaySession) {
    writeLocalSessions(upsertSession(await readLocalSessions(), session));
  }

  async deleteSession(sessionId: string) {
    writeLocalSessions((await readLocalSessions()).filter((session) => session.id !== sessionId));
  }
}

export class SqliteReplayRepository implements ReplayRepository {
  async listSessions() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [settingsKey],
    );

    if (rows.length === 0) {
      return [];
    }

    try {
      return sanitizeReplaySessions(JSON.parse(rows[0].value));
    } catch {
      return [];
    }
  }

  async saveSession(session: ReplaySession) {
    await this.writeSessions(upsertSession(await this.listSessions(), session));
  }

  async deleteSession(sessionId: string) {
    await this.writeSessions((await this.listSessions()).filter((session) => session.id !== sessionId));
  }

  private async writeSessions(sessions: ReplaySession[]) {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [settingsKey, JSON.stringify(sanitizeReplaySessions(sessions))],
    );
  }
}

export function createReplayRepository(): ReplayRepository {
  return isTauri() ? new SqliteReplayRepository() : new LocalStorageReplayRepository();
}

export function sanitizeReplaySessions(value: unknown): ReplaySession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sanitizeReplaySession)
    .filter((session): session is ReplaySession => session !== null)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, maximumStoredSessions);
}

function readLocalSessions() {
  const storedValue = globalThis.localStorage?.getItem(localStorageKey);

  if (!storedValue) {
    return Promise.resolve([]);
  }

  try {
    return Promise.resolve(sanitizeReplaySessions(JSON.parse(storedValue)));
  } catch {
    return Promise.resolve([]);
  }
}

function writeLocalSessions(sessions: ReplaySession[]) {
  globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(sanitizeReplaySessions(sessions)));
}

function upsertSession(sessions: ReplaySession[], session: ReplaySession) {
  return [session, ...sessions.filter((candidateSession) => candidateSession.id !== session.id)]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, maximumStoredSessions);
}

function sanitizeReplaySession(value: unknown): ReplaySession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const session = value as Partial<ReplaySession>;
  const now = new Date().toISOString();

  if (!session.id || !session.assetId || !session.pair) {
    return null;
  }

  return {
    id: String(session.id),
    name: String(session.name ?? session.pair),
    assetId: String(session.assetId),
    symbol: String(session.symbol ?? ""),
    pair: String(session.pair),
    exchange: String(session.exchange ?? "Binance.US"),
    rangePreset: isReplayRangePreset(session.rangePreset) ? session.rangePreset : "5m",
    from: finiteNumber(session.from, Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: finiteNumber(session.to, Date.now()),
    startingCash: finiteNumber(session.startingCash, 100_000),
    currentIndex: Math.max(0, Math.floor(finiteNumber(session.currentIndex, 0))),
    playbackSpeed: Math.max(1, finiteNumber(session.playbackSpeed, 1)),
    status: isReplayStatus(session.status) ? session.status : "paused",
    ledger: sanitizeReplayLedger(session.ledger),
    equityPoints: Array.isArray(session.equityPoints) ? session.equityPoints.map(sanitizeEquityPoint).filter(isEquityPoint) : [],
    events: Array.isArray(session.events) ? session.events.map(sanitizeReplayEvent).filter(isReplayEvent).slice(-300) : [],
    createdAt: String(session.createdAt ?? now),
    updatedAt: String(session.updatedAt ?? now),
    completedAt: session.completedAt ? String(session.completedAt) : undefined,
  };
}

function sanitizeReplayLedger(value: unknown): PaperLedger {
  const defaultLedger = createDefaultPaperLedger();

  if (!value || typeof value !== "object") {
    return defaultLedger;
  }

  const ledger = value as Partial<PaperLedger>;

  return {
    account: {
      cashBalance: finiteNumber(ledger.account?.cashBalance, defaultLedger.account.cashBalance),
      realizedPnl: finiteNumber(ledger.account?.realizedPnl, 0),
      updatedAt: String(ledger.account?.updatedAt ?? defaultLedger.account.updatedAt),
    },
    spotPositions: Array.isArray(ledger.spotPositions) ? ledger.spotPositions.map(sanitizeSpotPosition) : [],
    perpPositions: Array.isArray(ledger.perpPositions) ? ledger.perpPositions.map(sanitizePerpPosition) : [],
    orders: Array.isArray(ledger.orders) ? ledger.orders.map(sanitizePaperOrder) : [],
  };
}

function sanitizePaperOrder(order: Partial<PaperOrder>): PaperOrder {
  const now = new Date().toISOString();
  return {
    id: String(order.id ?? `order-${now}`),
    kind: order.kind ?? "spot-market",
    status: order.status ?? "rejected",
    exchange: String(order.exchange ?? "Binance.US"),
    assetId: String(order.assetId ?? ""),
    symbol: String(order.symbol ?? ""),
    pair: String(order.pair ?? order.symbol ?? ""),
    side: order.side ?? "buy",
    quantity: finiteNumber(order.quantity, 0),
    createdAt: String(order.createdAt ?? now),
    updatedAt: String(order.updatedAt ?? now),
    limitPrice: optionalNumber(order.limitPrice),
    stopLimitPrice: optionalNumber(order.stopLimitPrice),
    profitLimitPrice: optionalNumber(order.profitLimitPrice),
    executionPrice: optionalNumber(order.executionPrice),
    exitPrice: optionalNumber(order.exitPrice),
    profitAmount: optionalNumber(order.profitAmount),
    profitPercent: optionalNumber(order.profitPercent),
    positionId: order.positionId,
    leverage: optionalNumber(order.leverage),
    margin: optionalNumber(order.margin),
    hiddenOnChart: Boolean(order.hiddenOnChart),
    closedAt: order.closedAt,
    closeReason: order.closeReason,
    message: order.message,
  };
}

function sanitizeSpotPosition(position: Partial<SpotPosition>): SpotPosition {
  return {
    assetId: String(position.assetId ?? ""),
    symbol: String(position.symbol ?? ""),
    quantity: finiteNumber(position.quantity, 0),
    averagePrice: finiteNumber(position.averagePrice, 0),
    updatedAt: String(position.updatedAt ?? new Date().toISOString()),
  };
}

function sanitizePerpPosition(position: Partial<PerpPosition>): PerpPosition {
  return {
    id: String(position.id ?? `position-${Date.now()}`),
    assetId: String(position.assetId ?? ""),
    symbol: String(position.symbol ?? ""),
    side: position.side === "short" ? "short" : "long",
    quantity: finiteNumber(position.quantity, 0),
    entryPrice: finiteNumber(position.entryPrice, 0),
    leverage: finiteNumber(position.leverage, 1),
    margin: finiteNumber(position.margin, 0),
    openedAt: String(position.openedAt ?? new Date().toISOString()),
    updatedAt: String(position.updatedAt ?? new Date().toISOString()),
  };
}

function sanitizeEquityPoint(point: Partial<ReplayEquityPoint>): ReplayEquityPoint | null {
  const timestamp = finiteNumber(point.timestamp, Number.NaN);
  const equity = finiteNumber(point.equity, Number.NaN);

  if (!Number.isFinite(timestamp) || !Number.isFinite(equity)) {
    return null;
  }

  return {
    timestamp,
    equity,
    cash: finiteNumber(point.cash, 0),
    realizedPnl: finiteNumber(point.realizedPnl, 0),
    unrealizedPnl: finiteNumber(point.unrealizedPnl, 0),
  };
}

function sanitizeReplayEvent(event: Partial<ReplayEvent>): ReplayEvent | null {
  if (!event.id || !event.message) {
    return null;
  }

  return {
    id: String(event.id),
    timestamp: finiteNumber(event.timestamp, Date.now()),
    type: event.type ?? "session",
    message: String(event.message),
  };
}

function isReplayRangePreset(value: unknown): value is ReplaySession["rangePreset"] {
  return ["1m", "5m", "30m", "1h", "3h", "6h", "12h", "1d", "1w", "1M", "1y"].includes(String(value));
}

function isReplayStatus(value: unknown): value is ReplaySession["status"] {
  return ["draft", "running", "paused", "completed"].includes(String(value));
}

function isEquityPoint(value: ReplayEquityPoint | null): value is ReplayEquityPoint {
  return value !== null;
}

function isReplayEvent(value: ReplayEvent | null): value is ReplayEvent {
  return value !== null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function finiteNumber(value: unknown, fallback: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export const replayRepository = createReplayRepository();
