import { BinanceUsClient } from "./exchanges/binanceus/client";
import { CoinbaseClient } from "./exchanges/coinbase/client";
import { BybitClient, MexcClient, OkxClient } from "./exchanges/genericSpotClients";
import type { CandleRange, CoinMarket, CoinSearchResult, MarketDataProviderId, OhlcCandle, ProviderStatus } from "../types/marketData";
import type { MarketDataSettings } from "../settings/marketDataSettings";

export interface MarketDataProvider {
  getStatus: () => Promise<ProviderStatus>;
  getMarkets: (params: { currency: string; page?: number; perPage?: number; ids?: string[] }) => Promise<CoinMarket[]>;
  searchCoins: (query: string) => Promise<CoinSearchResult[]>;
  getOhlc: (params: { coinId: string; currency: string; range: CandleRange }) => Promise<OhlcCandle[]>;
}

export function createMarketDataProvider(settings: MarketDataSettings): MarketDataProvider {
  return new AggregatedMarketDataProvider(settings);
}

export function createSingleMarketDataProvider(provider: MarketDataProviderId): MarketDataProvider {
  if (provider === "coinbase") return new CoinbaseClient();
  if (provider === "okx") return new OkxClient();
  if (provider === "bybit") return new BybitClient();
  if (provider === "mexc") return new MexcClient();

  return new BinanceUsClient();
}

export const activeMarketDataProviderIds: MarketDataProviderId[] = ["binanceus", "coinbase", "okx", "mexc"];
export const plannedMarketDataProviderIds: MarketDataProviderId[] = ["bybit", "phemex"];

export function exchangeLabel(provider: MarketDataProviderId) {
  if (provider === "coinbase") return "Coinbase";
  if (provider === "okx") return "OKX";
  if (provider === "mexc") return "MEXC";
  if (provider === "phemex") return "Phemex";
  if (provider === "bybit") return "Bybit";
  return "Binance.US";
}

class AggregatedMarketDataProvider implements MarketDataProvider {
  constructor(private readonly settings: MarketDataSettings) {}

  async getStatus() {
    const results = await Promise.allSettled(
      activeMarketDataProviderIds.map((provider) => createSingleMarketDataProvider(provider).getStatus()),
    );
    const healthyCount = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;

    return {
      ok: healthyCount > 0,
      checkedAt: new Date().toISOString(),
      message: `${healthyCount}/${activeMarketDataProviderIds.length} exchanges reachable.`,
    };
  }

  async getMarkets(params: { currency: string; page?: number; perPage?: number; ids?: string[] }) {
    //mix exchange rows
    const perProviderLimit = Math.max(30, params.perPage ?? 50);
    const results = await Promise.allSettled(
      activeMarketDataProviderIds.map(async (provider) => {
        const providerClient = createSingleMarketDataProvider(provider);
        const markets = dedupeMarkets(
          (
            await Promise.allSettled(
              getQuoteCurrenciesForProvider(provider, params.currency).map((currency) =>
                providerClient.getMarkets({
                  ...params,
                  currency,
                  perPage: perProviderLimit,
                }),
              ),
            )
          ).flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
        );
        return markets.map((market) => withProviderIdentity(provider, market));
      }),
    );

    return interleaveProviderMarkets(results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])))
      .slice(0, params.perPage ?? 250)
      .map((market, index) => ({ ...market, marketCapRank: index + 1 }));
  }

  async getAllMarkets(params: { currency: string; perPage?: number }) {
    const results = await Promise.allSettled(
      activeMarketDataProviderIds.map(async (provider) => {
        const markets = await createSingleMarketDataProvider(provider).getMarkets({
          currency: params.currency,
          perPage: params.perPage ?? 80,
        });
        return markets.map((market) => withProviderIdentity(provider, market));
      }),
    );

    return results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .sort((leftMarket, rightMarket) => (rightMarket.totalVolume ?? 0) - (leftMarket.totalVolume ?? 0))
      .map((market, index) => ({ ...market, marketCapRank: index + 1 }));
  }

  async searchCoins(query: string): Promise<CoinSearchResult[]> {
    const markets = await this.getMarkets({ currency: this.settings.baseCurrency, perPage: 200 });
    const normalizedQuery = query.trim().toLowerCase();

    return markets
      .filter(
        (market) =>
          market.id.toLowerCase().includes(normalizedQuery) ||
          market.symbol.toLowerCase().includes(normalizedQuery) ||
          market.name.toLowerCase().includes(normalizedQuery) ||
          (market.exchange ?? "").toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 40)
      .map((market) => ({
        id: market.id,
        providerId: market.providerId,
        name: `${market.name} (${market.exchange})`,
        symbol: market.symbol,
        marketCapRank: market.marketCapRank,
        thumb: market.image,
      }));
  }

  async getOhlc(params: { coinId: string; currency: string; range: CandleRange }): Promise<OhlcCandle[]> {
    //keep venue pure
    const identity = parseProviderIdentity(params.coinId, this.settings.provider);
    return createSingleMarketDataProvider(identity.provider).getOhlc({
      ...params,
      coinId: identity.symbol,
    });
  }
}

export function parseProviderIdentity(coinId: string, fallbackProvider: MarketDataProviderId = "binanceus") {
  const [maybeProvider, ...symbolParts] = coinId.split(":");

  if (isMarketDataProviderId(maybeProvider) && symbolParts.length > 0) {
    return { provider: maybeProvider, symbol: symbolParts.join(":") };
  }

  return { provider: fallbackProvider, symbol: coinId };
}

function withProviderIdentity(provider: MarketDataProviderId, market: CoinMarket): CoinMarket {
  return {
    ...market,
    id: `${provider}:${market.id}`,
    provider,
    exchange: exchangeLabel(provider),
    marketType: "spot",
  };
}

function interleaveProviderMarkets(providerMarkets: CoinMarket[][]) {
  //balance exchanges
  const markets: CoinMarket[] = [];
  const maximumLength = Math.max(...providerMarkets.map((marketsForProvider) => marketsForProvider.length), 0);

  for (let marketIndex = 0; marketIndex < maximumLength; marketIndex += 1) {
    for (const marketsForProvider of providerMarkets) {
      const market = marketsForProvider[marketIndex];

      if (market) {
        markets.push(market);
      }
    }
  }

  return markets;
}

function getQuoteCurrenciesForProvider(provider: MarketDataProviderId, requestedCurrency: string) {
  const requested = requestedCurrency.toLowerCase();
  const currencySet = new Set([requested]);

  if (provider === "coinbase") {
    currencySet.add("usd");
    currencySet.add("usdc");
  } else {
    currencySet.add("usdt");
    currencySet.add("usd");
    currencySet.add("usdc");
  }

  return [...currencySet];
}

function dedupeMarkets(markets: CoinMarket[]) {
  return [...new Map(markets.map((market) => [market.id, market])).values()];
}

function isMarketDataProviderId(value: string): value is MarketDataProviderId {
  return ["binanceus", "coinbase", "okx", "mexc", "phemex", "bybit"].includes(value);
}
