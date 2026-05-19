import { isTauri } from "@tauri-apps/api/core";
import { createMarketDataProvider } from "../marketDataProvider";
import { parseProviderIdentity } from "../marketDataProvider";
import { candleRepository } from "../storage/candleRepository";
import type { MarketDataSettings } from "../../settings/marketDataSettings";
import type { CandleRange, CoinMarket, TerminalRangePreset } from "../../types/marketData";
import {
  historySyncRepository,
  type HistorySyncJob,
  type HistorySyncJobItem,
  type HistorySyncSnapshot,
} from "./historySyncRepository";

const maximumAttemptsPerItem = 3;
const retryBackoffBaseMilliseconds = 800;
const maximumBrowserSyncMarkets = 25;
//backfill start
const defaultHistorySyncFrom = Date.UTC(2016, 0, 1);
const historySyncPresets: TerminalRangePreset[] = ["1d", "1w", "1M"];

let activeSync: Promise<HistorySyncSnapshot> | null = null;
let pauseRequested = false;

export interface StartHistorySyncParams {
  settings: MarketDataSettings;
  markets: CoinMarket[];
  onUpdate?: (snapshot: HistorySyncSnapshot) => void;
}

export function startHistorySync({ settings, markets, onUpdate }: StartHistorySyncParams) {
  pauseRequested = false;

  if (activeSync) {
    return activeSync;
  }

  activeSync = runHistorySync({ settings, markets, onUpdate }).finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export async function pauseHistorySync() {
  pauseRequested = true;
  const snapshot = await historySyncRepository.getLatestSnapshot();

  if (snapshot.job?.status === "running") {
    await historySyncRepository.updateJob({
      id: snapshot.job.id,
      status: "paused",
      updatedAt: new Date().toISOString(),
    });
  }

  return historySyncRepository.getLatestSnapshot();
}

async function runHistorySync({ settings, markets, onUpdate }: StartHistorySyncParams) {
  //desktop gets full sync
  const syncMarkets = isTauri() ? markets : markets.slice(0, maximumBrowserSyncMarkets);
  const syncRequests = createSyncRequests(syncMarkets);
  const timestamp = new Date().toISOString();
  const job: HistorySyncJob = {
    id: crypto.randomUUID(),
    provider: settings.provider,
    baseCurrency: settings.baseCurrency,
    status: "running",
    totalItems: syncRequests.length,
    completedItems: 0,
    failedItems: 0,
    attempts: 0,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
  const items = syncRequests.map<HistorySyncJobItem>((request) => ({
    jobId: job.id,
    coinId: request.itemId,
    symbol: request.symbol,
    exchange: request.exchange,
    rangeKey: request.rangeKey,
    requestedFrom: request.range.from ?? defaultHistorySyncFrom,
    requestedTo: request.range.to ?? Date.now(),
    status: "queued",
    attempts: 0,
    candleCount: 0,
    earliestCandle: null,
    latestCandle: null,
    lastError: null,
    updatedAt: timestamp,
    completedAt: null,
  }));

  await historySyncRepository.createJob(job, items);
  await emit(onUpdate);

  const marketDataSource = createMarketDataProvider(settings);
  let completedItems = 0;
  let failedItems = 0;
  let totalAttempts = 0;

  for (const request of syncRequests) {
    //pause between items
    if (pauseRequested) {
      await historySyncRepository.updateJob({
        id: job.id,
        status: "paused",
        completedItems,
        failedItems,
        attempts: totalAttempts,
        updatedAt: new Date().toISOString(),
      });
      return emit(onUpdate);
    }

    const cacheKey = {
      provider: settings.provider,
      coinId: request.marketId,
      currency: settings.baseCurrency,
      rangeKey: request.rangeKey,
    };
    const cachedCandles = await candleRepository.getCandles(cacheKey);

    //skip cached candles
    if (cachedCandles.length > 0) {
      completedItems += 1;
      await historySyncRepository.updateItem({
        jobId: job.id,
        coinId: request.itemId,
        status: "skipped",
        candleCount: cachedCandles.length,
        earliestCandle: getEarliestCandle(cachedCandles),
        latestCandle: getLatestCandle(cachedCandles),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      await historySyncRepository.updateJob({
        id: job.id,
        completedItems,
        failedItems,
        attempts: totalAttempts,
        updatedAt: new Date().toISOString(),
      });
      await emit(onUpdate);
      continue;
    }

    let itemSynced = false;
    let itemAttempts = 0;

    while (!itemSynced && itemAttempts < maximumAttemptsPerItem) {
      itemAttempts += 1;
      totalAttempts += 1;
      await historySyncRepository.updateItem({
        jobId: job.id,
        coinId: request.itemId,
        status: "running",
        attempts: itemAttempts,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });
      await historySyncRepository.updateJob({
        id: job.id,
        attempts: totalAttempts,
        updatedAt: new Date().toISOString(),
      });
      await emit(onUpdate);

      try {
        const candles = await marketDataSource.getOhlc({
          coinId: request.marketId,
          currency: settings.baseCurrency,
          range: request.range,
        });
        await candleRepository.saveCandles({ ...cacheKey, candles });
        completedItems += 1;
        itemSynced = true;
        await historySyncRepository.updateItem({
          jobId: job.id,
          coinId: request.itemId,
          status: "complete",
          attempts: itemAttempts,
          candleCount: candles.length,
          earliestCandle: getEarliestCandle(candles),
          latestCandle: getLatestCandle(candles),
          lastError: null,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "History sync failed.";

        if (itemAttempts >= maximumAttemptsPerItem) {
          failedItems += 1;
          await historySyncRepository.updateItem({
            jobId: job.id,
            coinId: request.itemId,
            status: "error",
            attempts: itemAttempts,
            lastError: message,
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });
          await historySyncRepository.updateJob({
            id: job.id,
            lastError: message,
            updatedAt: new Date().toISOString(),
          });
        } else {
          await delay(retryBackoffBaseMilliseconds * itemAttempts);
        }
      }
    }

    await historySyncRepository.updateJob({
      id: job.id,
      completedItems,
      failedItems,
      attempts: totalAttempts,
      updatedAt: new Date().toISOString(),
    });
    await emit(onUpdate);
  }

  await historySyncRepository.updateJob({
    id: job.id,
    status: failedItems > 0 ? "error" : "complete",
    completedItems,
    failedItems,
    attempts: totalAttempts,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  return emit(onUpdate);
}

async function emit(onUpdate?: (snapshot: HistorySyncSnapshot) => void) {
  const snapshot = await historySyncRepository.getLatestSnapshot();
  onUpdate?.(snapshot);
  return snapshot;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

interface HistorySyncRequest {
  itemId: string;
  marketId: string;
  symbol: string;
  exchange: string;
  rangeKey: string;
  range: CandleRange;
}

function createSyncRequests(markets: CoinMarket[]): HistorySyncRequest[] {
  const to = Date.now();

  //queue each timeframe
  return markets.flatMap((market) => {
    const identity = parseProviderIdentity(market.id, market.provider ?? "binanceus");
    const exchange = market.exchange ?? identity.provider;
    const symbol = `${market.symbol.toUpperCase()}/${getQuoteFromMarketId(market.id)}`;

    return historySyncPresets.map((preset) => ({
      itemId: `${market.id}:${preset}`,
      marketId: market.id,
      symbol,
      exchange,
      rangeKey: preset,
      range: { preset, from: defaultHistorySyncFrom, to },
    }));
  });
}

function getQuoteFromMarketId(marketId: string) {
  const rawSymbol = marketId.split(":").pop() ?? marketId;

  if (rawSymbol.includes("-")) {
    return rawSymbol.split("-").pop()?.toUpperCase() ?? "USD";
  }

  const quote = ["USDT", "USDC", "USD"].find((candidateQuote) => rawSymbol.toUpperCase().endsWith(candidateQuote));
  return quote ?? "USD";
}

function getEarliestCandle(candles: Array<{ timestamp: number }>) {
  return candles.length > 0 ? Math.min(...candles.map((candle) => candle.timestamp)) : null;
}

function getLatestCandle(candles: Array<{ timestamp: number }>) {
  return candles.length > 0 ? Math.max(...candles.map((candle) => candle.timestamp)) : null;
}
