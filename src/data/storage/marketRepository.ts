import { isTauri } from "@tauri-apps/api/core";
import type { CoinMarket, MarketDataProviderId } from "../../types/marketData";
import { getDatabase } from "./database";
import { exchangeLabel, parseProviderIdentity } from "../marketDataProvider";

export interface MarketCacheKey {
  provider: MarketDataProviderId;
  currency: string;
}

export interface MarketRepository {
  getMarkets: (params: MarketCacheKey) => Promise<CoinMarket[]>;
  saveMarkets: (params: MarketCacheKey & { markets: CoinMarket[] }) => Promise<void>;
}

const localStoragePrefix = "paper-trader.markets";

export class LocalStorageMarketRepository implements MarketRepository {
  async getMarkets(params: MarketCacheKey) {
    const storedValue = globalThis.localStorage?.getItem(getStorageKey(params));

    if (!storedValue) {
      return [];
    }

    try {
      return JSON.parse(storedValue) as CoinMarket[];
    } catch {
      return [];
    }
  }

  async saveMarkets(params: MarketCacheKey & { markets: CoinMarket[] }) {
    globalThis.localStorage?.setItem(getStorageKey(params), JSON.stringify(params.markets));
  }
}

export class SqliteMarketRepository implements MarketRepository {
  async getMarkets({ provider, currency }: MarketCacheKey) {
    const database = await getDatabase();
    const rows = await database.select<
      Array<{
        id: string;
        providerId: string | null;
        symbol: string;
        name: string;
        image: string | null;
        marketCapRank: number | null;
        price: number | null;
        marketCap: number | null;
        volume24h: number | null;
        priceChangePercentage24h: number | null;
        updatedAt: string | null;
      }>
    >(
      `SELECT
         coins.id,
         coins.provider_id AS providerId,
         coins.symbol,
         coins.name,
         coins.image,
         coins.market_cap_rank AS marketCapRank,
         coin_markets.price,
         coin_markets.market_cap AS marketCap,
         coin_markets.volume_24h AS volume24h,
         coin_markets.price_change_percentage_24h AS priceChangePercentage24h,
         coin_markets.updated_at AS updatedAt
       FROM coin_markets
       INNER JOIN coins ON coins.id = coin_markets.coin_id
       WHERE coin_markets.provider = $1 AND coin_markets.vs_currency = $2
       ORDER BY coins.market_cap_rank ASC
       LIMIT 250`,
      [provider, currency],
    );

    return rows.map((row) => {
      const id = row.id.replace(`${provider}:`, "");
      const identity = parseProviderIdentity(id, provider);

      return {
        id,
        provider: identity.provider,
        exchange: exchangeLabel(identity.provider),
        marketType: "spot",
        providerId: row.providerId ?? undefined,
        symbol: row.symbol,
        name: row.name,
        image: row.image ?? "",
        currentPrice: row.price,
        marketCap: row.marketCap,
        marketCapRank: row.marketCapRank,
        totalVolume: row.volume24h,
        high24h: null,
        low24h: null,
        priceChange24h: null,
        priceChangePercentage24h: row.priceChangePercentage24h,
        lastUpdated: row.updatedAt,
      } satisfies CoinMarket;
    });
  }

  async saveMarkets({ provider, currency, markets }: MarketCacheKey & { markets: CoinMarket[] }) {
    if (markets.length === 0) {
      return;
    }

    const database = await getDatabase();
    const batchSize = 80;

    for (let startIndex = 0; startIndex < markets.length; startIndex += batchSize) {
      const batch = markets.slice(startIndex, startIndex + batchSize);
      const coinValuesSql = batch
        .map(
          (_market, marketIndex) =>
            `($${marketIndex * 7 + 1}, $${marketIndex * 7 + 2}, $${marketIndex * 7 + 3}, $${marketIndex * 7 + 4}, $${marketIndex * 7 + 5}, $${marketIndex * 7 + 6}, $${marketIndex * 7 + 7}, CURRENT_TIMESTAMP)`,
        )
        .join(", ");
      const coinParams = batch.flatMap((market) => [
        getStoredCoinId(provider, market.id),
        provider,
        market.providerId === undefined ? null : String(market.providerId),
        market.symbol,
        market.name,
        market.image,
        market.marketCapRank,
      ]);
      await database.execute(
        `INSERT INTO coins (id, provider, provider_id, symbol, name, image, market_cap_rank, updated_at)
         VALUES ${coinValuesSql}
         ON CONFLICT(id) DO UPDATE SET
           provider = excluded.provider,
           provider_id = excluded.provider_id,
           symbol = excluded.symbol,
           name = excluded.name,
           image = excluded.image,
           market_cap_rank = excluded.market_cap_rank,
           updated_at = CURRENT_TIMESTAMP`,
        coinParams,
      );

      const marketValuesSql = batch
        .map(
          (_market, marketIndex) =>
            `($${marketIndex * 7 + 1}, $${marketIndex * 7 + 2}, $${marketIndex * 7 + 3}, $${marketIndex * 7 + 4}, $${marketIndex * 7 + 5}, $${marketIndex * 7 + 6}, $${marketIndex * 7 + 7}, CURRENT_TIMESTAMP)`,
        )
        .join(", ");
      const marketParams = batch.flatMap((market) => [
        getStoredCoinId(provider, market.id),
        provider,
        currency,
        market.currentPrice,
        market.marketCap,
        market.totalVolume,
        market.priceChangePercentage24h,
      ]);
      await database.execute(
        `INSERT INTO coin_markets
           (coin_id, provider, vs_currency, price, market_cap, volume_24h, price_change_percentage_24h, updated_at)
         VALUES ${marketValuesSql}
         ON CONFLICT(coin_id, provider, vs_currency) DO UPDATE SET
           price = excluded.price,
           market_cap = excluded.market_cap,
           volume_24h = excluded.volume_24h,
           price_change_percentage_24h = excluded.price_change_percentage_24h,
           updated_at = CURRENT_TIMESTAMP`,
        marketParams,
      );
    }
  }
}

export function createMarketRepository(): MarketRepository {
  return isTauri() ? new SqliteMarketRepository() : new LocalStorageMarketRepository();
}

function getStorageKey({ provider, currency }: MarketCacheKey) {
  return `${localStoragePrefix}.${provider}.${currency}`;
}

function getStoredCoinId(provider: MarketDataProviderId, coinId: string) {
  return `${provider}:${coinId}`;
}

export const marketRepository = createMarketRepository();
