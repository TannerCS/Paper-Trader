import type { CandleRange, CoinMarket, CoinSearchResult, OhlcCandle, ProviderStatus } from "../../types/marketData";
import { getAggregationBucketMilliseconds, resolveCandleRange } from "../chartRanges";
import { providerGetJson } from "../http/providerHttp";
import type { MarketDataProvider } from "../marketDataProvider";

export class OkxClient implements MarketDataProvider {
  async getStatus(): Promise<ProviderStatus> {
    try {
      await providerGetJson(`${okxBaseUrl}/api/v5/market/tickers?instType=SPOT`);
      return { ok: true, checkedAt: new Date().toISOString(), message: "OKX public market data is reachable." };
    } catch (error) {
      return { ok: false, checkedAt: new Date().toISOString(), message: getErrorMessage(error, "OKX connection failed.") };
    }
  }

  async getMarkets({ currency, page = 1, perPage = 50 }: MarketParams) {
    const response = await providerGetJson<{ data?: OkxTicker[] }>(`${okxBaseUrl}/api/v5/market/tickers?instType=SPOT`);
    const quoteAsset = currency.toUpperCase();
    const startIndex = (page - 1) * perPage;

    return (response.data ?? [])
      .filter((row) => row.instId.endsWith(`-${quoteAsset}`) || (quoteAsset === "USD" && row.instId.endsWith("-USDT")))
      .map(mapOkxTicker)
      .sort((leftMarket, rightMarket) => (rightMarket.totalVolume ?? 0) - (leftMarket.totalVolume ?? 0))
      .slice(startIndex, startIndex + perPage)
      .map((market, index) => ({ ...market, marketCapRank: startIndex + index + 1 }));
  }

  async searchCoins(query: string) {
    return searchMarkets(await this.getMarkets({ currency: "usd", perPage: 250 }), query);
  }

  async getOhlc({ coinId, range }: { coinId: string; currency: string; range: CandleRange }) {
    const resolvedRange = resolveCandleRange(range);
    const params = new URLSearchParams({
      instId: coinId,
      bar: getOkxBar(getAggregationBucketMilliseconds(range)),
      limit: "300",
    });

    if (resolvedRange.to > 0) {
      params.set("after", String(resolvedRange.to));
    }

    const rows: string[][] = [];
    let nextAfter = resolvedRange.to;

    //walk okx backward
    while (nextAfter > resolvedRange.from) {
      params.set("after", String(nextAfter));
      const response = await providerGetJson<{ data?: string[][] }>(`${okxBaseUrl}/api/v5/market/history-candles?${params.toString()}`);
      const pageRows = response.data ?? [];

      if (pageRows.length === 0) {
        break;
      }

      rows.push(...pageRows);
      const oldestTimestamp = Math.min(...pageRows.map((row) => Number(row[0])).filter(Number.isFinite));

      if (!Number.isFinite(oldestTimestamp) || oldestTimestamp >= nextAfter) {
        break;
      }

      nextAfter = oldestTimestamp - 1;

      if (pageRows.length < 300) {
        break;
      }
    }

    return dedupeCandles(rows.map(mapOkxCandle).filter((candle) => candle.timestamp >= resolvedRange.from && candle.timestamp <= resolvedRange.to))
      .sort((left, right) => left.timestamp - right.timestamp);
  }
}

export class BybitClient implements MarketDataProvider {
  async getStatus(): Promise<ProviderStatus> {
    try {
      await providerGetJson(`${bybitBaseUrl}/v5/market/tickers?category=spot`);
      return { ok: true, checkedAt: new Date().toISOString(), message: "Bybit public market data is reachable." };
    } catch (error) {
      return { ok: false, checkedAt: new Date().toISOString(), message: getErrorMessage(error, "Bybit connection failed.") };
    }
  }

  async getMarkets({ currency, page = 1, perPage = 50 }: MarketParams) {
    const response = await providerGetJson<{ result?: { list?: BybitTicker[] } }>(
      `${bybitBaseUrl}/v5/market/tickers?category=spot`,
    );
    const quoteAsset = currency.toUpperCase();
    const startIndex = (page - 1) * perPage;

    return (response.result?.list ?? [])
      .filter((row) => row.symbol.endsWith(quoteAsset) || (quoteAsset === "USD" && row.symbol.endsWith("USDT")))
      .map(mapBybitTicker)
      .sort((leftMarket, rightMarket) => (rightMarket.totalVolume ?? 0) - (leftMarket.totalVolume ?? 0))
      .slice(startIndex, startIndex + perPage)
      .map((market, index) => ({ ...market, marketCapRank: startIndex + index + 1 }));
  }

  async searchCoins(query: string) {
    return searchMarkets(await this.getMarkets({ currency: "usd", perPage: 250 }), query);
  }

  async getOhlc({ coinId, range }: { coinId: string; currency: string; range: CandleRange }) {
    const resolvedRange = resolveCandleRange(range);
    const params = new URLSearchParams({
      category: "spot",
      symbol: coinId,
      interval: getBybitInterval(getAggregationBucketMilliseconds(range)),
      start: String(resolvedRange.from),
      end: String(resolvedRange.to),
      limit: "1000",
    });
    const response = await providerGetJson<{ result?: { list?: string[][] } }>(
      `${bybitBaseUrl}/v5/market/kline?${params.toString()}`,
    );

    return (response.result?.list ?? []).map(mapBybitCandle).sort((left, right) => left.timestamp - right.timestamp);
  }
}

export class MexcClient implements MarketDataProvider {
  async getStatus(): Promise<ProviderStatus> {
    try {
      await providerGetJson(`${mexcBaseUrl}/api/v3/ping`);
      return { ok: true, checkedAt: new Date().toISOString(), message: "MEXC public market data is reachable." };
    } catch (error) {
      return { ok: false, checkedAt: new Date().toISOString(), message: getErrorMessage(error, "MEXC connection failed.") };
    }
  }

  async getMarkets({ currency, page = 1, perPage = 50 }: MarketParams) {
    const rows = await providerGetJson<MexcTicker[]>(`${mexcBaseUrl}/api/v3/ticker/24hr`);
    const quoteAsset = currency.toUpperCase();
    const startIndex = (page - 1) * perPage;

    return rows
      .filter((row) => row.symbol.endsWith(quoteAsset) || (quoteAsset === "USD" && row.symbol.endsWith("USDT")))
      .map(mapMexcTicker)
      .sort((leftMarket, rightMarket) => (rightMarket.totalVolume ?? 0) - (leftMarket.totalVolume ?? 0))
      .slice(startIndex, startIndex + perPage)
      .map((market, index) => ({ ...market, marketCapRank: startIndex + index + 1 }));
  }

  async searchCoins(query: string) {
    return searchMarkets(await this.getMarkets({ currency: "usd", perPage: 250 }), query);
  }

  async getOhlc({ coinId, range }: { coinId: string; currency: string; range: CandleRange }) {
    const resolvedRange = resolveCandleRange(range);
    const bucketSize = getAggregationBucketMilliseconds(range);
    const rows = await getMexcKlinesInPages({
      symbol: coinId,
      interval: getMexcInterval(bucketSize),
      from: resolvedRange.from,
      to: resolvedRange.to,
      bucketSize,
    });
    return rows.map(mapMexcCandle);
  }
}

const okxBaseUrl = "https://www.okx.com";
const bybitBaseUrl = "https://api.bybit.com";
const mexcBaseUrl = "https://api.mexc.com";

interface MarketParams {
  currency: string;
  page?: number;
  perPage?: number;
  ids?: string[];
}

interface OkxTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  ts: string;
}

interface BybitTicker {
  symbol: string;
  lastPrice: string;
  prevPrice24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  turnover24h: string;
}

interface MexcTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
  closeTime: number;
}

function mapOkxTicker(row: OkxTicker): CoinMarket {
  const [baseAsset] = row.instId.split("-");
  const price = numericOrNull(row.last);
  const open24h = numericOrNull(row.open24h);

  return {
    id: row.instId,
    providerId: row.instId,
    symbol: baseAsset,
    name: baseAsset,
    image: "",
    currentPrice: price,
    marketCap: null,
    marketCapRank: null,
    totalVolume: numericOrNull(row.volCcy24h),
    high24h: numericOrNull(row.high24h),
    low24h: numericOrNull(row.low24h),
    priceChange24h: price && open24h ? price - open24h : null,
    priceChangePercentage24h: price && open24h ? ((price - open24h) / open24h) * 100 : null,
    lastUpdated: row.ts ? new Date(Number(row.ts)).toISOString() : new Date().toISOString(),
  };
}

function mapBybitTicker(row: BybitTicker): CoinMarket {
  const baseAsset = row.symbol.replace(/(USDT|USDC|USD)$/u, "");
  const price = numericOrNull(row.lastPrice);
  const previousPrice = numericOrNull(row.prevPrice24h);

  return {
    id: row.symbol,
    providerId: row.symbol,
    symbol: baseAsset,
    name: baseAsset,
    image: "",
    currentPrice: price,
    marketCap: null,
    marketCapRank: null,
    totalVolume: numericOrNull(row.turnover24h),
    high24h: numericOrNull(row.highPrice24h),
    low24h: numericOrNull(row.lowPrice24h),
    priceChange24h: price && previousPrice ? price - previousPrice : null,
    priceChangePercentage24h: numericOrNull(row.price24hPcnt) === null ? null : Number(row.price24hPcnt) * 100,
    lastUpdated: new Date().toISOString(),
  };
}

function mapMexcTicker(row: MexcTicker): CoinMarket {
  const baseAsset = row.symbol.replace(/(USDT|USDC|USD)$/u, "");

  return {
    id: row.symbol,
    providerId: row.symbol,
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
    lastUpdated: row.closeTime ? new Date(row.closeTime).toISOString() : new Date().toISOString(),
  };
}

function mapOkxCandle(row: string[]): OhlcCandle {
  return {
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6] ?? row[5]),
  };
}

function mapBybitCandle(row: string[]): OhlcCandle {
  return {
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6] ?? row[5]),
  };
}

function mapMexcCandle(row: string[]): OhlcCandle {
  return {
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[7] ?? row[5]),
  };
}

function searchMarkets(markets: CoinMarket[], query: string): CoinSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return markets
    .filter(
      (market) =>
        market.id.toLowerCase().includes(normalizedQuery) ||
        market.symbol.toLowerCase().includes(normalizedQuery) ||
        market.name.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 25)
    .map((market) => ({
      id: market.id,
      providerId: market.providerId,
      name: market.name,
      symbol: market.symbol,
      marketCapRank: market.marketCapRank,
      thumb: market.image,
    }));
}

async function getMexcKlinesInPages({
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
  const rows: string[][] = [];
  const pageMilliseconds = bucketSize * 1000;
  let pageFrom = Math.max(0, from);

  //page by time
  while (pageFrom < to) {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: String(pageFrom),
      endTime: String(Math.min(to, pageFrom + pageMilliseconds)),
      limit: "1000",
    });
    const pageRows = await providerGetJson<string[][]>(`${mexcBaseUrl}/api/v3/klines?${params.toString()}`);

    if (pageRows.length === 0) {
      pageFrom += pageMilliseconds;
      continue;
    }

    rows.push(...pageRows);
    const lastTimestamp = Number(pageRows[pageRows.length - 1]?.[0]);
    pageFrom = Number.isFinite(lastTimestamp) ? lastTimestamp + bucketSize : pageFrom + pageMilliseconds;
  }

  return [...new Map(rows.map((row) => [row[0], row])).values()].sort((left, right) => Number(left[0]) - Number(right[0]));
}

function dedupeCandles(candles: OhlcCandle[]) {
  return [...new Map(candles.map((candle) => [candle.timestamp, candle])).values()];
}

function getOkxBar(bucketSizeMilliseconds: number) {
  const minutes = bucketSizeMilliseconds / 60_000;

  if (minutes <= 1) return "1m";
  if (minutes <= 5) return "5m";
  if (minutes <= 30) return "30m";
  if (minutes <= 60) return "1H";
  if (minutes <= 180) return "3H";
  if (minutes <= 360) return "6H";
  if (minutes <= 720) return "12H";
  if (minutes <= 1440) return "1D";
  if (minutes <= 10080) return "1W";
  return "1M";
}

function getBybitInterval(bucketSizeMilliseconds: number) {
  const minutes = bucketSizeMilliseconds / 60_000;

  if (minutes <= 1) return "1";
  if (minutes <= 5) return "5";
  if (minutes <= 30) return "30";
  if (minutes <= 60) return "60";
  if (minutes <= 180) return "180";
  if (minutes <= 360) return "360";
  if (minutes <= 720) return "720";
  if (minutes <= 1440) return "D";
  if (minutes <= 10080) return "W";
  return "M";
}

function getMexcInterval(bucketSizeMilliseconds: number) {
  const minutes = bucketSizeMilliseconds / 60_000;

  if (minutes <= 1) return "1m";
  if (minutes <= 5) return "5m";
  if (minutes <= 30) return "30m";
  if (minutes <= 60) return "60m";
  if (minutes <= 240) return "4h";
  if (minutes <= 480) return "8h";
  if (minutes <= 1440) return "1d";
  if (minutes <= 10080) return "1W";
  return "1M";
}

function numericOrNull(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
