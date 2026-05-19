export type MarketDataProviderId = "binanceus" | "coinbase" | "okx" | "mexc" | "phemex" | "bybit";
export type MarketType = "spot" | "swap" | "futures" | "indices";

export type TerminalRangePreset = "1m" | "5m" | "30m" | "1h" | "3h" | "6h" | "12h" | "1d" | "1w" | "1M" | "1y";

export interface MarketDataSettings {
  provider: MarketDataProviderId;
  baseCurrency: string;
  refreshEnabled: boolean;
  refreshIntervalSeconds: number;
  timeZone: string;
  dateTimeFormat: DateTimeFormatId;
}

export type DateTimeFormatId =
  | "date-time-medium"
  | "date-time-short"
  | "date-time-long"
  | "iso-local"
  | "month-day-time"
  | "numeric-date-time"
  | "date-only-medium"
  | "time-only-12h"
  | "time-only-24h";

export interface CandleRange {
  preset?: TerminalRangePreset;
  from?: number;
  to?: number;
}

export interface CoinMarket {
  id: string;
  provider?: MarketDataProviderId;
  exchange?: string;
  marketType?: MarketType;
  providerId?: string | number;
  symbol: string;
  name: string;
  image: string;
  currentPrice: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChange24h: number | null;
  priceChangePercentage24h: number | null;
  lastUpdated: string | null;
}

export interface CoinSearchResult {
  id: string;
  providerId?: string | number;
  name: string;
  symbol: string;
  marketCapRank: number | null;
  thumb: string;
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ProviderStatus {
  ok: boolean;
  checkedAt: string;
  message: string;
}
