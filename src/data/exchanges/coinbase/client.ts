import type { CandleRange, CoinMarket, CoinSearchResult, OhlcCandle, ProviderStatus } from "../../../types/marketData";
import { getAggregationBucketMilliseconds, resolveCandleRange } from "../../chartRanges";
import { providerGetJson } from "../../http/providerHttp";
import type { CoinbaseCandle, CoinbaseProduct, CoinbaseProductsResponse, CoinbaseCandlesResponse } from "./types";

const baseUrl = "https://api.coinbase.com/api/v3/brokerage/market";

export class CoinbaseClient {
  async getStatus(): Promise<ProviderStatus> {
    try {
      await providerGetJson<CoinbaseProductsResponse>(`${baseUrl}/products?limit=1&product_type=SPOT`);
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        message: "Coinbase public market data is reachable.",
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Coinbase connection failed.",
      };
    }
  }

  async getMarkets({
    currency,
    page = 1,
    perPage = 50,
  }: {
    currency: string;
    page?: number;
    perPage?: number;
    ids?: string[];
  }): Promise<CoinMarket[]> {
    const params = new URLSearchParams({
      limit: String(perPage),
      offset: String((page - 1) * perPage),
      product_type: "SPOT",
      products_sort_order: "PRODUCTS_SORT_ORDER_VOLUME_24H_DESCENDING",
    });
    const response = await providerGetJson<CoinbaseProductsResponse>(`${baseUrl}/products?${params.toString()}`);
    const quoteCurrency = currency.toUpperCase();

    return response.products
      .filter((product) => product.quote_currency_id === quoteCurrency && !product.trading_disabled && !product.is_disabled)
      .map(mapCoinbaseProduct)
      .map((market, index) => ({ ...market, marketCapRank: (page - 1) * perPage + index + 1 }));
  }

  async searchCoins(query: string): Promise<CoinSearchResult[]> {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return [];
    }

    const response = await providerGetJson<CoinbaseProductsResponse>(`${baseUrl}/products?limit=250&product_type=SPOT`);

    return response.products
      .map(mapCoinbaseProduct)
      .filter(
        (market) =>
          market.id.toLowerCase().includes(trimmedQuery) ||
          market.symbol.toLowerCase().includes(trimmedQuery) ||
          market.name.toLowerCase().includes(trimmedQuery),
      )
      .slice(0, 25)
      .map((market) => ({
        id: market.id,
        name: market.name,
        symbol: market.symbol,
        marketCapRank: market.marketCapRank,
        thumb: market.image,
      }));
  }

  async getOhlc({
    coinId,
    range,
  }: {
    coinId: string;
    currency: string;
    range: CandleRange;
  }): Promise<OhlcCandle[]> {
    const resolvedRange = resolveCandleRange(range);
    const bucketSize = getAggregationBucketMilliseconds(range);
    //make 3h from 1h
    const sourceBucketSize = bucketSize === 3 * 60 * 60 * 1000 ? 60 * 60 * 1000 : bucketSize;
    const candles = await getCoinbaseCandlesInPages({
      coinId,
      from: resolvedRange.from,
      to: resolvedRange.to,
      bucketSize: sourceBucketSize,
    });

    return sourceBucketSize === bucketSize ? candles : aggregateCandles(candles, bucketSize);
  }
}

async function getCoinbaseCandlesInPages({
  bucketSize,
  coinId,
  from,
  to,
}: {
  bucketSize: number;
  coinId: string;
  from: number;
  to: number;
}) {
  const pageMilliseconds = bucketSize * 300;
  const candles: OhlcCandle[] = [];

  //page candles
  for (let pageFrom = from; pageFrom < to; pageFrom += pageMilliseconds) {
    const pageTo = Math.min(to, pageFrom + pageMilliseconds);
    const params = new URLSearchParams({
      start: String(Math.floor(pageFrom / 1000)),
      end: String(Math.floor(pageTo / 1000)),
      granularity: getCoinbaseGranularity(bucketSize),
      limit: "350",
    });
    const response = await providerGetJson<CoinbaseCandlesResponse>(
      `${baseUrl}/products/${encodeURIComponent(coinId)}/candles?${params.toString()}`,
    );
    candles.push(...response.candles.map(mapCoinbaseCandle));
  }

  return dedupeCandles(candles).sort((left, right) => left.timestamp - right.timestamp);
}

export function mapCoinbaseProduct(product: CoinbaseProduct): CoinMarket {
  return {
    id: product.product_id,
    symbol: product.base_currency_id ?? product.base_display_symbol ?? product.product_id.split("-")[0],
    name: product.base_name ?? product.base_currency_id ?? product.product_id,
    image: product.icon_url ?? "",
    currentPrice: numericOrNull(product.price),
    marketCap: numericOrNull(product.market_cap),
    marketCapRank: null,
    totalVolume: numericOrNull(product.approximate_quote_24h_volume ?? product.volume_24h),
    high24h: null,
    low24h: null,
    priceChange24h: null,
    priceChangePercentage24h: numericOrNull(stripPercent(product.price_percentage_change_24h)),
    lastUpdated: new Date().toISOString(),
  };
}

function mapCoinbaseCandle(candle: CoinbaseCandle): OhlcCandle {
  return {
    timestamp: Number(candle.start) * 1000,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
  };
}

function getCoinbaseGranularity(bucketSizeMilliseconds: number) {
  const oneMinute = 60 * 1000;
  const minutes = bucketSizeMilliseconds / oneMinute;

  if (minutes <= 1) return "ONE_MINUTE";
  if (minutes <= 5) return "FIVE_MINUTE";
  if (minutes <= 30) return "THIRTY_MINUTE";
  if (minutes <= 60) return "ONE_HOUR";
  if (minutes <= 120) return "TWO_HOUR";
  if (minutes <= 360) return "SIX_HOUR";
  return "ONE_DAY";
}

function dedupeCandles(candles: OhlcCandle[]) {
  return [...new Map(candles.map((candle) => [candle.timestamp, candle])).values()];
}

function aggregateCandles(candles: OhlcCandle[], bucketSize: number) {
  const groupedCandles = new Map<number, OhlcCandle[]>();

  for (const candle of candles) {
    const bucketTimestamp = Math.floor(candle.timestamp / bucketSize) * bucketSize;
    groupedCandles.set(bucketTimestamp, [...(groupedCandles.get(bucketTimestamp) ?? []), candle]);
  }

  return [...groupedCandles.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([timestamp, bucketCandles]) => {
      const sortedCandles = bucketCandles.sort((left, right) => left.timestamp - right.timestamp);
      return {
        timestamp,
        open: sortedCandles[0].open,
        high: Math.max(...sortedCandles.map((candle) => candle.high)),
        low: Math.min(...sortedCandles.map((candle) => candle.low)),
        close: sortedCandles[sortedCandles.length - 1].close,
        volume: sortedCandles.reduce((totalVolume, candle) => totalVolume + (candle.volume ?? 0), 0),
      };
    });
}

function numericOrNull(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function stripPercent(value: string | undefined) {
  return value?.replace("%", "");
}
