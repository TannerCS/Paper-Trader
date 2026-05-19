import { isTauri } from "@tauri-apps/api/core";
import { createDefaultPaperLedger } from "./paperTradingEngine";
import type { PaperLedger, PaperOrder, PerpPosition, SpotPosition } from "./types";
import { getDatabase } from "../storage/database";

export interface PaperTradingRepository {
  getLedger: () => Promise<PaperLedger>;
  saveLedger: (ledger: PaperLedger) => Promise<void>;
}

const ledgerSettingsKey = "paperLedger";
const localStorageKey = "paper-trader.paper-ledger";
const accountId = "primary";

export class LocalStoragePaperTradingRepository implements PaperTradingRepository {
  async getLedger() {
    const storedValue = globalThis.localStorage?.getItem(localStorageKey);

    if (!storedValue) {
      return createDefaultPaperLedger();
    }

    try {
      return sanitizeLedger(JSON.parse(storedValue) as Partial<PaperLedger>);
    } catch {
      return createDefaultPaperLedger();
    }
  }

  async saveLedger(ledger: PaperLedger) {
    globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(sanitizeLedger(ledger)));
  }
}

export class SqlitePaperTradingRepository implements PaperTradingRepository {
  async getLedger() {
    const database = await getDatabase();
    const accountRows = await database.select<Array<PaperAccountRow>>(
      `SELECT
         cash_balance AS cashBalance,
         realized_pnl AS realizedPnl,
         updated_at AS updatedAt
       FROM paper_account
       WHERE id = $1
       LIMIT 1`,
      [accountId],
    );

    if (accountRows.length === 0) {
      const migratedLedger = await this.getLegacyLedger();

      if (migratedLedger) {
        await this.saveLedger(migratedLedger);
        return migratedLedger;
      }

      const defaultLedger = createDefaultPaperLedger();
      await this.saveLedger(defaultLedger);
      return defaultLedger;
    }

    const [orderRows, spotRows, perpRows] = await Promise.all([
      database.select<PaperOrderRow[]>(
        `SELECT
           id,
           kind,
           status,
           exchange,
           asset_id AS assetId,
           symbol,
           pair,
           side,
           quantity,
           created_at AS createdAt,
           updated_at AS updatedAt,
           limit_price AS limitPrice,
           stop_limit_price AS stopLimitPrice,
           profit_limit_price AS profitLimitPrice,
           execution_price AS executionPrice,
           exit_price AS exitPrice,
           profit_amount AS profitAmount,
           profit_percent AS profitPercent,
           position_id AS positionId,
           leverage,
           margin,
           hidden_on_chart AS hiddenOnChart,
           closed_at AS closedAt,
           close_reason AS closeReason,
           message
         FROM paper_orders
         ORDER BY datetime(updated_at) DESC`,
      ),
      database.select<SpotPositionRow[]>(
        `SELECT
           asset_id AS assetId,
           symbol,
           quantity,
           average_price AS averagePrice,
           updated_at AS updatedAt
         FROM paper_spot_positions
         ORDER BY symbol ASC`,
      ),
      database.select<PerpPositionRow[]>(
        `SELECT
           id,
           asset_id AS assetId,
           symbol,
           side,
           quantity,
           entry_price AS entryPrice,
           leverage,
           margin,
           opened_at AS openedAt,
           updated_at AS updatedAt
         FROM paper_perp_positions
         ORDER BY datetime(opened_at) DESC`,
      ),
    ]);

    return sanitizeLedger({
      account: accountRows[0],
      orders: orderRows.map(mapOrderRow),
      spotPositions: spotRows,
      perpPositions: perpRows.map(mapPerpPositionRow),
    });
  }

  async saveLedger(ledger: PaperLedger) {
    const database = await getDatabase();
    const sanitizedLedger = sanitizeLedger(ledger);

    await database.execute(
      `INSERT INTO paper_account (id, cash_balance, realized_pnl, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET
         cash_balance = excluded.cash_balance,
         realized_pnl = excluded.realized_pnl,
         updated_at = excluded.updated_at`,
      [
        accountId,
        sanitizedLedger.account.cashBalance,
        sanitizedLedger.account.realizedPnl,
        sanitizedLedger.account.updatedAt,
      ],
    );
    await database.execute("DELETE FROM paper_orders");
    await database.execute("DELETE FROM paper_spot_positions");
    await database.execute("DELETE FROM paper_perp_positions");

    for (const order of sanitizedLedger.orders) {
      await database.execute(
        `INSERT INTO paper_orders (
             id,
             kind,
             status,
             exchange,
             asset_id,
             symbol,
             pair,
             side,
             quantity,
             created_at,
             updated_at,
             limit_price,
             stop_limit_price,
             profit_limit_price,
             execution_price,
             exit_price,
             profit_amount,
             profit_percent,
             position_id,
             leverage,
             margin,
             hidden_on_chart,
             closed_at,
             close_reason,
             message
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
        [
          order.id,
          order.kind,
          order.status,
          order.exchange,
          order.assetId,
          order.symbol,
          order.pair,
          order.side,
          order.quantity,
          order.createdAt,
          order.updatedAt,
          order.limitPrice ?? null,
          order.stopLimitPrice ?? null,
          order.profitLimitPrice ?? null,
          order.executionPrice ?? null,
          order.exitPrice ?? null,
          order.profitAmount ?? null,
          order.profitPercent ?? null,
          order.positionId ?? null,
          order.leverage ?? null,
          order.margin ?? null,
          order.hiddenOnChart ? 1 : 0,
          order.closedAt ?? null,
          order.closeReason ?? null,
          order.message ?? null,
        ],
      );
    }

    for (const position of sanitizedLedger.spotPositions) {
      await database.execute(
        `INSERT INTO paper_spot_positions (asset_id, symbol, quantity, average_price, updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
        [position.assetId, position.symbol, position.quantity, position.averagePrice, position.updatedAt],
      );
    }

    for (const position of sanitizedLedger.perpPositions) {
      await database.execute(
        `INSERT INTO paper_perp_positions (
             id,
             asset_id,
             symbol,
             side,
             quantity,
             entry_price,
             leverage,
             margin,
             opened_at,
             updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          position.id,
          position.assetId,
          position.symbol,
          position.side,
          position.quantity,
          position.entryPrice,
          position.leverage,
          position.margin,
          position.openedAt,
          position.updatedAt,
        ],
      );
    }

    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [ledgerSettingsKey, JSON.stringify(sanitizedLedger)],
    );
  }

  private async getLegacyLedger() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [ledgerSettingsKey],
    );

    if (rows.length === 0) {
      return null;
    }

    try {
      return sanitizeLedger(JSON.parse(rows[0].value) as Partial<PaperLedger>);
    } catch {
      return null;
    }
  }
}

export function createPaperTradingRepository(): PaperTradingRepository {
  return isTauri() ? new SqlitePaperTradingRepository() : new LocalStoragePaperTradingRepository();
}

function sanitizeLedger(ledger: Partial<PaperLedger>): PaperLedger {
  const defaultLedger = createDefaultPaperLedger();

  return {
    account: {
      cashBalance:
        typeof ledger.account?.cashBalance === "number" ? ledger.account.cashBalance : defaultLedger.account.cashBalance,
      realizedPnl:
        typeof ledger.account?.realizedPnl === "number" ? ledger.account.realizedPnl : defaultLedger.account.realizedPnl,
      updatedAt: ledger.account?.updatedAt ?? defaultLedger.account.updatedAt,
    },
    spotPositions: Array.isArray(ledger.spotPositions) ? ledger.spotPositions.map(sanitizeSpotPosition) : [],
    perpPositions: Array.isArray(ledger.perpPositions) ? ledger.perpPositions.map(sanitizePerpPosition) : [],
    orders: Array.isArray(ledger.orders) ? ledger.orders.map(sanitizeOrder) : [],
  };
}

export const paperTradingRepository = createPaperTradingRepository();

interface PaperAccountRow {
  cashBalance: number;
  realizedPnl: number;
  updatedAt: string;
}

interface PaperOrderRow extends Omit<PaperOrder, "hiddenOnChart"> {
  hiddenOnChart: number | boolean | null;
}

interface SpotPositionRow extends SpotPosition {}

interface PerpPositionRow extends PerpPosition {}

function mapOrderRow(row: PaperOrderRow): PaperOrder {
  return sanitizeOrder({
    ...row,
    hiddenOnChart: Boolean(row.hiddenOnChart),
  });
}

function mapPerpPositionRow(row: PerpPositionRow): PerpPosition {
  return sanitizePerpPosition(row);
}

function sanitizeOrder(order: Partial<PaperOrder>): PaperOrder {
  const now = new Date().toISOString();

  return {
    id: order.id ?? `order-${now}`,
    kind: order.kind ?? "spot-market",
    status: order.status ?? "rejected",
    exchange: order.exchange ?? "Binance.US",
    assetId: order.assetId ?? "",
    symbol: order.symbol ?? "",
    pair: order.pair ?? order.symbol ?? "",
    side: order.side ?? "buy",
    quantity: finiteNumber(order.quantity, 0),
    createdAt: order.createdAt ?? now,
    updatedAt: order.updatedAt ?? now,
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
    assetId: position.assetId ?? "",
    symbol: position.symbol ?? "",
    quantity: finiteNumber(position.quantity, 0),
    averagePrice: finiteNumber(position.averagePrice, 0),
    updatedAt: position.updatedAt ?? new Date().toISOString(),
  };
}

function sanitizePerpPosition(position: Partial<PerpPosition>): PerpPosition {
  return {
    id: position.id ?? `position-${Date.now()}`,
    assetId: position.assetId ?? "",
    symbol: position.symbol ?? "",
    side: position.side ?? "long",
    quantity: finiteNumber(position.quantity, 0),
    entryPrice: finiteNumber(position.entryPrice, 0),
    leverage: finiteNumber(position.leverage, 1),
    margin: finiteNumber(position.margin, 0),
    openedAt: position.openedAt ?? new Date().toISOString(),
    updatedAt: position.updatedAt ?? new Date().toISOString(),
  };
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
