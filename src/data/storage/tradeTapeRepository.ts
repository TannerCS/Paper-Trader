import { isTauri } from "@tauri-apps/api/core";
import type { LiveMarketTrade } from "../exchanges/liveMarketStream";
import { getDatabase } from "./database";

export interface TradeTapeCacheKey {
  exchange: string;
  assetId: string;
}

export interface TradeTapeRepository {
  getTrades: (params: TradeTapeCacheKey) => Promise<LiveMarketTrade[]>;
  saveTrades: (params: TradeTapeCacheKey & { trades: LiveMarketTrade[] }) => Promise<void>;
}

const localStoragePrefix = "paper-trader.trade-tape";
const maximumCachedTrades = 300;

export class LocalStorageTradeTapeRepository implements TradeTapeRepository {
  async getTrades(params: TradeTapeCacheKey) {
    const storedValue = globalThis.localStorage?.getItem(getStorageKey(params));

    if (!storedValue) {
      return [];
    }

    try {
      return JSON.parse(storedValue) as LiveMarketTrade[];
    } catch {
      return [];
    }
  }

  async saveTrades(params: TradeTapeCacheKey & { trades: LiveMarketTrade[] }) {
    const existingTrades = await this.getTrades(params);
    const mergedTrades = mergeTrades(existingTrades, params.trades);
    globalThis.localStorage?.setItem(getStorageKey(params), JSON.stringify(mergedTrades));
  }
}

export class SqliteTradeTapeRepository implements TradeTapeRepository {
  async getTrades({ assetId, exchange }: TradeTapeCacheKey) {
    const database = await getDatabase();
    const rows = await database.select<LiveMarketTrade[]>(
      `SELECT
         id,
         side,
         price,
         quantity,
         notional,
         traded_at AS tradedAt
       FROM live_trade_tape
       WHERE exchange = $1 AND asset_id = $2
       ORDER BY datetime(traded_at) DESC
       LIMIT 120`,
      [exchange, assetId],
    );

    return rows;
  }

  async saveTrades({ assetId, exchange, trades }: TradeTapeCacheKey & { trades: LiveMarketTrade[] }) {
    if (trades.length === 0) {
      return;
    }

    const database = await getDatabase();
    const batch = trades.slice(0, 80);
    const valuesSql = batch
      .map(
        (_trade, tradeIndex) =>
          `($${tradeIndex * 8 + 1}, $${tradeIndex * 8 + 2}, $${tradeIndex * 8 + 3}, $${tradeIndex * 8 + 4}, $${tradeIndex * 8 + 5}, $${tradeIndex * 8 + 6}, $${tradeIndex * 8 + 7}, $${tradeIndex * 8 + 8})`,
      )
      .join(", ");
    const params = batch.flatMap((trade) => [
      trade.id,
      exchange,
      assetId,
      trade.side,
      trade.price,
      trade.quantity,
      trade.notional,
      trade.tradedAt,
    ]);

    await database.execute(
      `INSERT INTO live_trade_tape
         (id, exchange, asset_id, side, price, quantity, notional, traded_at)
       VALUES ${valuesSql}
       ON CONFLICT(id, exchange, asset_id) DO UPDATE SET
         side = excluded.side,
         price = excluded.price,
         quantity = excluded.quantity,
         notional = excluded.notional,
         traded_at = excluded.traded_at`,
      params,
    );
    await database.execute(
      `DELETE FROM live_trade_tape
       WHERE rowid IN (
         SELECT rowid FROM live_trade_tape
         WHERE exchange = $1 AND asset_id = $2
         ORDER BY datetime(traded_at) DESC
         LIMIT -1 OFFSET $3
       )`,
      [exchange, assetId, maximumCachedTrades],
    );
  }
}

export function createTradeTapeRepository(): TradeTapeRepository {
  return isTauri() ? new SqliteTradeTapeRepository() : new LocalStorageTradeTapeRepository();
}

export const tradeTapeRepository = createTradeTapeRepository();

function mergeTrades(existingTrades: LiveMarketTrade[], nextTrades: LiveMarketTrade[]) {
  const tradeMap = new Map<string, LiveMarketTrade>();

  for (const trade of [...nextTrades, ...existingTrades]) {
    tradeMap.set(trade.id, trade);
  }

  return [...tradeMap.values()]
    .sort((leftTrade, rightTrade) => new Date(rightTrade.tradedAt).getTime() - new Date(leftTrade.tradedAt).getTime())
    .slice(0, maximumCachedTrades);
}

function getStorageKey({ assetId, exchange }: TradeTapeCacheKey) {
  return `${localStoragePrefix}.${exchange}.${assetId}`;
}
