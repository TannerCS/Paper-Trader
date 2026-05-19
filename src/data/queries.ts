import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMarketDataProvider } from "./marketDataProvider";
import { getExchangeHealthRows } from "./exchangeHealth";
import { resolveCandleRange } from "./chartRanges";
import { candleRepository } from "./storage/candleRepository";
import { marketRepository } from "./storage/marketRepository";
import { settingsRepository } from "./storage/settingsRepository";
import { marketEngine } from "./marketEngine";
import type { MarketDataSettings } from "../settings/marketDataSettings";
import type { CandleRange } from "../types/marketData";

export const queryKeys = {
  marketDataSettings: ["marketDataSettings"] as const,
  exchangeHealth: ["exchangeHealth"] as const,
  providerStatus: ["providerStatus"] as const,
  markets: (provider: string, currency: string, refreshEnabled: boolean, refreshIntervalSeconds: number) =>
    ["markets", provider, currency, refreshEnabled, refreshIntervalSeconds] as const,
  coinSearch: (provider: string, query: string) => ["coinSearch", provider, query] as const,
  ohlc: (provider: string, coinId: string, currency: string, rangeKey: string) =>
    ["ohlc", provider, coinId, currency, rangeKey] as const,
};

const backgroundCandleRefreshAt = new Map<string, number>();
const backgroundMarketRefreshAt = new Map<string, number>();
const candleRefreshCooldownMilliseconds = 5 * 60_000;
const marketRefreshCooldownMilliseconds = 30_000;

export function useMarketDataSettings() {
  return useQuery({
    queryKey: queryKeys.marketDataSettings,
    queryFn: () => settingsRepository.getMarketDataSettings(),
  });
}

export function useSaveMarketDataSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: MarketDataSettings) => settingsRepository.saveMarketDataSettings(settings),
    onSuccess: async (_result, settings) => {
      queryClient.setQueryData(queryKeys.marketDataSettings, settings);
      await queryClient.invalidateQueries({ queryKey: queryKeys.providerStatus });
      await queryClient.invalidateQueries({ queryKey: ["markets"] });
      await queryClient.invalidateQueries({ queryKey: ["ohlc"] });
    },
  });
}

export function useProviderStatus(settings: MarketDataSettings | undefined) {
  return useQuery({
    queryKey: queryKeys.providerStatus,
    queryFn: () => createMarketDataProvider(settings!).getStatus(),
    enabled: Boolean(settings),
    staleTime: 30_000,
  });
}

export function useExchangeHealth() {
  return useQuery({
    queryKey: queryKeys.exchangeHealth,
    queryFn: getExchangeHealthRows,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useCoinMarkets(settings: MarketDataSettings | undefined) {
  return useQuery({
    queryKey: settings
      ? queryKeys.markets(
          settings.provider,
          settings.baseCurrency,
          settings.refreshEnabled,
          settings.refreshIntervalSeconds,
        )
      : ["markets", "pending"],
    queryFn: async () => {
      const cacheKey = { provider: settings!.provider, currency: settings!.baseCurrency };
      const cachedMarkets = await marketRepository.getMarkets(cacheKey);

      if (cachedMarkets.length > 0 && hasEnoughExchangeDiversity(cachedMarkets)) {
        const refreshKey = `${cacheKey.provider}:${cacheKey.currency}`;
        const lastRefreshAt = backgroundMarketRefreshAt.get(refreshKey) ?? 0;

        if (Date.now() - lastRefreshAt > marketRefreshCooldownMilliseconds) {
          backgroundMarketRefreshAt.set(refreshKey, Date.now());
          void createMarketDataProvider(settings!)
            .getMarkets({
              currency: settings!.baseCurrency,
              perPage: 250,
            })
            .then((markets) => marketEngine.saveMarketSnapshot({ ...cacheKey, markets }))
            .catch((error) => reportBackgroundCacheError("market snapshot refresh", error));
        }

        return cachedMarkets;
      }

      const markets = await createMarketDataProvider(settings!).getMarkets({
        currency: settings!.baseCurrency,
        perPage: 250,
      });
      await marketEngine
        .saveMarketSnapshot({ ...cacheKey, markets })
        .catch((error) => reportBackgroundCacheError("market snapshot cache", error));
      return markets;
    },
    enabled: Boolean(settings),
    refetchInterval: settings?.refreshEnabled ? Math.max(30_000, settings.refreshIntervalSeconds * 1000) : false,
    staleTime: 15_000,
  });
}

export function useCoinSearch(settings: MarketDataSettings | undefined, query: string) {
  return useQuery({
    queryKey: settings ? queryKeys.coinSearch(settings.provider, query) : ["coinSearch", "pending", query],
    queryFn: () => createMarketDataProvider(settings!).searchCoins(query),
    enabled: Boolean(settings && query.trim().length >= 2),
    staleTime: 60_000,
  });
}

export function useCoinOhlc(settings: MarketDataSettings | undefined, coinId: string, range: CandleRange) {
  const resolvedRange = resolveCandleRange(range);

  return useQuery({
    queryKey: settings
      ? queryKeys.ohlc(settings.provider, coinId, settings.baseCurrency, resolvedRange.cacheKey)
      : ["ohlc", "pending"],
    queryFn: async () => {
      const cacheKey = {
        provider: settings!.provider,
        coinId,
        currency: settings!.baseCurrency,
        rangeKey: resolvedRange.cacheKey,
      };
      const cachedCandles = await candleRepository.getCandles(cacheKey);

      if (cachedCandles.length >= 20) {
        const refreshKey = `${cacheKey.provider}:${cacheKey.coinId}:${cacheKey.currency}:${cacheKey.rangeKey}`;
        const lastRefreshAt = backgroundCandleRefreshAt.get(refreshKey) ?? 0;

        if (Date.now() - lastRefreshAt > candleRefreshCooldownMilliseconds) {
          backgroundCandleRefreshAt.set(refreshKey, Date.now());
          void createMarketDataProvider(settings!)
            .getOhlc({ coinId, currency: settings!.baseCurrency, range })
            .then((candles) => candleRepository.saveCandles({ ...cacheKey, candles }))
            .catch((error) => reportBackgroundCacheError("candle refresh", error));
        }

        return cachedCandles;
      }

      const candles = await createMarketDataProvider(settings!).getOhlc({
        coinId,
        currency: settings!.baseCurrency,
        range,
      });
      await candleRepository
        .saveCandles({ ...cacheKey, candles })
        .catch((error) => reportBackgroundCacheError("candle cache", error));
      return candles;
    },
    enabled: Boolean(settings && coinId),
    refetchInterval: false,
    staleTime: 60_000,
  });
}

function reportBackgroundCacheError(context: string, error: unknown) {
  console.warn(`Paper Trader ${context} failed`, error);
}

function hasEnoughExchangeDiversity(markets: Array<{ provider?: string; exchange?: string }>) {
  const exchanges = new Set(markets.map((market) => market.provider ?? market.exchange).filter(Boolean));
  return exchanges.size >= 3;
}
