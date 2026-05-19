import { isTauri } from "@tauri-apps/api/core";
import type { MarketDataProviderId, OhlcCandle } from "../../types/marketData";
import { getDatabase } from "./database";

export interface CandleRepository {
  getCandles: (params: CandleCacheKey) => Promise<OhlcCandle[]>;
  saveCandles: (params: CandleCacheKey & { candles: OhlcCandle[] }) => Promise<void>;
  getSummary: () => Promise<CandleHistorySummary>;
}

export interface CandleCacheKey {
  provider: MarketDataProviderId;
  coinId: string;
  currency: string;
  rangeKey: string;
}

export interface CandleHistorySummary {
  coinCount: number;
  candleCount: number;
}

const localStoragePrefix = "paper-trader.ohlc";
const maximumLocalCandlesPerMarket = 1500;
const emergencyLocalCandlesPerMarket = 500;

export class LocalStorageCandleRepository implements CandleRepository {
  async getCandles(params: CandleCacheKey) {
    const storedValue = globalThis.localStorage?.getItem(getStorageKey(params));

    if (!storedValue) {
      return [];
    }

    try {
      return JSON.parse(storedValue) as OhlcCandle[];
    } catch {
      return [];
    }
  }

  async saveCandles(params: CandleCacheKey & { candles: OhlcCandle[] }) {
    const storageKey = getStorageKey(params);
    const candles = params.candles.slice(-maximumLocalCandlesPerMarket);

    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(candles));
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        throw error;
      }

      clearOtherLocalCandleEntries(storageKey);

      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(candles.slice(-emergencyLocalCandlesPerMarket)));
      } catch {
        globalThis.localStorage?.removeItem(storageKey);
      }
    }
  }

  async getSummary() {
    let coinCount = 0;
    let candleCount = 0;
    const coinIds = new Set<string>();

    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);

      if (!key?.startsWith(`${localStoragePrefix}.`)) {
        continue;
      }

      const [, , , coinId] = key.split(".");
      coinIds.add(coinId);
      const storedValue = globalThis.localStorage.getItem(key);

      if (storedValue) {
        try {
          candleCount += (JSON.parse(storedValue) as OhlcCandle[]).length;
        } catch {
          //skip bad cache
        }
      }
    }

    coinCount = coinIds.size;
    return { coinCount, candleCount };
  }
}

export class SqliteCandleRepository implements CandleRepository {
  async getCandles({ provider, coinId, currency, rangeKey }: CandleCacheKey) {
    const database = await getDatabase();
    const rows = await database.select<
      Array<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number | null;
      }>
    >(
      `SELECT timestamp, open, high, low, close, volume
       FROM ohlc_candles
       WHERE coin_id = $1 AND vs_currency = $2 AND days = $3
       ORDER BY timestamp ASC`,
      [`${provider}:${coinId}`, currency, rangeKey],
    );

    return rows.map((row) => ({
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume ?? undefined,
    }));
  }

  async saveCandles({ provider, coinId, currency, rangeKey, candles }: CandleCacheKey & { candles: OhlcCandle[] }) {
    if (candles.length === 0) {
      return;
    }

    const database = await getDatabase();
    const storedCoinId = `${provider}:${coinId}`;
    const batchSize = 120;

    for (let startIndex = 0; startIndex < candles.length; startIndex += batchSize) {
      const batch = candles.slice(startIndex, startIndex + batchSize);
      const valuesSql = batch
        .map(
          (_candle, candleIndex) =>
            `($${candleIndex * 9 + 1}, $${candleIndex * 9 + 2}, $${candleIndex * 9 + 3}, $${candleIndex * 9 + 4}, $${candleIndex * 9 + 5}, $${candleIndex * 9 + 6}, $${candleIndex * 9 + 7}, $${candleIndex * 9 + 8}, $${candleIndex * 9 + 9}, CURRENT_TIMESTAMP)`,
        )
        .join(", ");
      const params = batch.flatMap((candle) => [
        storedCoinId,
        currency,
        rangeKey,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume ?? null,
      ]);

      await database.execute(
        `INSERT INTO ohlc_candles (coin_id, vs_currency, days, timestamp, open, high, low, close, volume, updated_at)
         VALUES ${valuesSql}
         ON CONFLICT(coin_id, vs_currency, days, timestamp)
         DO UPDATE SET
           open = excluded.open,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close,
           volume = excluded.volume,
           updated_at = CURRENT_TIMESTAMP`,
        params,
      );
    }
  }

  async getSummary() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ coinCount: number; candleCount: number }>>(
      `SELECT
         COUNT(DISTINCT coin_id) AS coinCount,
         COUNT(*) AS candleCount
       FROM ohlc_candles`,
    );

    return rows[0] ?? { coinCount: 0, candleCount: 0 };
  }
}

export function createCandleRepository(): CandleRepository {
  return isTauri() ? new SqliteCandleRepository() : new LocalStorageCandleRepository();
}

function getStorageKey({ provider, coinId, currency, rangeKey }: CandleCacheKey) {
  return `${localStoragePrefix}.${provider}.${coinId}.${currency}.${rangeKey}`;
}

function clearOtherLocalCandleEntries(currentStorageKey: string) {
  const keysToRemove: string[] = [];

  for (let index = 0; index < globalThis.localStorage.length; index += 1) {
    const key = globalThis.localStorage.key(index);

    if (key?.startsWith(`${localStoragePrefix}.`) && key !== currentStorageKey) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    globalThis.localStorage.removeItem(key);
  }
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export const candleRepository = createCandleRepository();
