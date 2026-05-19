import type { CandleRange, CoinMarket, CoinSearchResult, OhlcCandle, ProviderStatus } from "../../../types/marketData";
import { getAggregationBucketMilliseconds, resolveCandleRange } from "../../chartRanges";
import { providerGetJson } from "../../http/providerHttp";
import type { BinanceUsKlineRow, BinanceUsTickerRow } from "./types";

const baseUrl = "https://api.binance.us";
const quoteAssets = ["USD", "USDT", "USDC"];

export class BinanceUsClient {
  async getStatus(): Promise<ProviderStatus> {
    try {
      await providerGetJson(`${baseUrl}/api/v3/ping`);
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        message: "Binance.US public market data is reachable.",
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Binance.US connection failed.",
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
    const rows = await providerGetJson<BinanceUsTickerRow[]>(`${baseUrl}/api/v3/ticker/24hr`);
    const preferredQuote = currency.toUpperCase();
    const startIndex = (page - 1) * perPage;

    return rows
      .filter((row) => getQuoteAsset(row.symbol) === preferredQuote || (preferredQuote === "USD" && getQuoteAsset(row.symbol) === "USDT"))
      .map(mapBinanceUsTicker)
      .sort((leftMarket, rightMarket) => (rightMarket.totalVolume ?? 0) - (leftMarket.totalVolume ?? 0))
      .slice(startIndex, startIndex + perPage)
      .map((market, index) => ({ ...market, marketCapRank: startIndex + index + 1 }));
  }

  async searchCoins(query: string): Promise<CoinSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const rows = await providerGetJson<BinanceUsTickerRow[]>(`${baseUrl}/api/v3/ticker/24hr`);

    return rows
      .map(mapBinanceUsTicker)
      .filter(
        (market) =>
          market.id.toLowerCase().includes(normalizedQuery) ||
          market.symbol.toLowerCase().includes(normalizedQuery) ||
          market.name.toLowerCase().includes(normalizedQuery),
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
    const interval = getBinanceInterval(bucketSize);
    const rows = await getBinanceKlinesInPages({
      symbol: coinId.toUpperCase(),
      interval,
      from: resolvedRange.from,
      to: resolvedRange.to,
      bucketSize,
    });

    return rows.map((row) => ({
      timestamp: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
  }
}

async function getBinanceKlinesInPages({
  bucketSize,
  from,
  interval,
  symbol,
  to,
}: {
  bucketSize: number;
  from: number;
  interval: string;
  symbol: string;
  to: number;
}) {
  const rows: BinanceUsKlineRow[] = [];
  const pageMilliseconds = bucketSize * 1000;
  let pageFrom = Math.max(0, from);

  //page klines
  while (pageFrom < to) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: "1000",
      startTime: String(pageFrom),
      endTime: String(Math.min(to, pageFrom + pageMilliseconds)),
    });
    const pageRows = await providerGetJson<BinanceUsKlineRow[]>(`${baseUrl}/api/v3/klines?${params.toString()}`);

    if (pageRows.length === 0) {
      pageFrom += pageMilliseconds;
      continue;
    }

    rows.push(...pageRows);
    const lastTimestamp = Number(pageRows[pageRows.length - 1]?.[0]);
    pageFrom = Number.isFinite(lastTimestamp) ? lastTimestamp + bucketSize : pageFrom + pageMilliseconds;

    //skip gaps
    if (pageRows.length < 1000) {
      pageFrom = Math.max(pageFrom, Math.min(to, pageFrom + pageMilliseconds));
    }
  }

  return [...new Map(rows.map((row) => [row[0], row])).values()].sort((left, right) => left[0] - right[0]);
}

export function mapBinanceUsTicker(row: BinanceUsTickerRow): CoinMarket {
  const quoteAsset = getQuoteAsset(row.symbol);
  const baseAsset = quoteAsset ? row.symbol.slice(0, -quoteAsset.length) : row.symbol;

  return {
    id: row.symbol,
    symbol: baseAsset,
    name: baseAsset,
    image: "",
    currentPrice: numericOrNull(row.lastPrice),
    marketCap: null,
    marketCapRank: null,
    totalVolume: numericOrNull(row.quoteVolume),
    high24h: numericOrNull(row.highPrice),
    low24h: numericOrNull(row.lowPrice),
    priceChange24h: numericOrNull(row.priceChange),
    priceChangePercentage24h: numericOrNull(row.priceChangePercent),
    lastUpdated: new Date(row.closeTime).toISOString(),
  };
}

export function getQuoteAsset(symbol: string) {
  return quoteAssets.find((quoteAsset) => symbol.endsWith(quoteAsset)) ?? "";
}

function getBinanceInterval(bucketSizeMilliseconds: number) {
  const oneMinute = 60 * 1000;
  const minutes = bucketSizeMilliseconds / oneMinute;

  if (minutes <= 1) return "1m";
  if (minutes <= 5) return "5m";
  if (minutes <= 30) return "30m";
  if (minutes <= 60) return "1h";
  if (minutes <= 180) return "3h";
  if (minutes <= 360) return "6h";
  if (minutes <= 720) return "12h";
  if (minutes <= 1440) return "1d";
  if (minutes <= 10080) return "1w";
  return "1M";
}

function numericOrNull(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
