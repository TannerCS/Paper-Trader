import {
  activeMarketDataProviderIds,
  createSingleMarketDataProvider,
  exchangeLabel,
  plannedMarketDataProviderIds,
} from "./marketDataProvider";
import type { MarketDataProviderId } from "../types/marketData";

export type ExchangeHealthStatus = "live" | "stale" | "rate_limited" | "region_blocked" | "offline" | "disabled";

export interface ExchangeHealthRow {
  provider: MarketDataProviderId;
  exchange: string;
  enabled: boolean;
  restStatus: ExchangeHealthStatus;
  websocketStatus: ExchangeHealthStatus;
  checkedAt: string;
  lastTickAt: string | null;
  cooldownUntil: string | null;
  latencyMilliseconds: number | null;
  message: string;
}

export interface VenuePuritySnapshot {
  provider: MarketDataProviderId | null;
  exchange: string;
  chartSource: string;
  tapeSource: string;
  executionSource: string;
  liveStatus: ExchangeHealthStatus;
  message: string;
}

const websocketHeartbeatKeyPrefix = "paper-trader.websocket-heartbeat";
const websocketCooldownKeyPrefix = "paper-trader.websocket-cooldown";
const staleThresholdMilliseconds = 30_000;

export async function getExchangeHealthRows(): Promise<ExchangeHealthRow[]> {
  //check active venues
  const enabledRows = await Promise.all(activeMarketDataProviderIds.map(checkActiveExchangeHealth));
  const disabledRows = plannedMarketDataProviderIds.map((provider) => {
    const exchange = exchangeLabel(provider);

    return {
      provider,
      exchange,
      enabled: false,
      restStatus: "disabled" as const,
      websocketStatus: "disabled" as const,
      checkedAt: new Date().toISOString(),
      lastTickAt: null,
      cooldownUntil: null,
      latencyMilliseconds: null,
      message: `${exchange} is kept in the adapter list but disabled for now.`,
    };
  });

  return [...enabledRows, ...disabledRows];
}

export function rememberExchangeHeartbeat(provider: MarketDataProviderId, timestamp = Date.now()) {
  globalThis.localStorage?.setItem(getHeartbeatKey(provider), String(timestamp));
}

export function getVenuePuritySnapshot({
  exchange,
  provider,
  tickConnected,
  tickUpdatedAt,
}: {
  exchange?: string;
  provider?: MarketDataProviderId;
  tickConnected: boolean;
  tickUpdatedAt: string | null;
}): VenuePuritySnapshot {
  //never fail over
  const venueName = exchange ?? (provider ? exchangeLabel(provider) : "Selected venue");
  const lastTickAge = tickUpdatedAt ? Date.now() - new Date(tickUpdatedAt).getTime() : Number.POSITIVE_INFINITY;
  const liveStatus: ExchangeHealthStatus = tickConnected
    ? "live"
    : lastTickAge <= staleThresholdMilliseconds
      ? "stale"
      : "offline";

  return {
    provider: provider ?? null,
    exchange: venueName,
    chartSource: venueName,
    tapeSource: venueName,
    executionSource: venueName,
    liveStatus,
    message:
      liveStatus === "live"
        ? `${venueName} is authoritative for chart, tape, and paper fills.`
        : `${venueName} live feed is not healthy. Trading stays venue-pure; switch venues explicitly if needed.`,
  };
}

async function checkActiveExchangeHealth(provider: MarketDataProviderId): Promise<ExchangeHealthRow> {
  const exchange = exchangeLabel(provider);
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();

  try {
    const status = await createSingleMarketDataProvider(provider).getStatus();
    const latencyMilliseconds = Math.round(performance.now() - startedAt);
    const cooldownUntilTimestamp = getCooldownUntil(provider);

    return {
      provider,
      exchange,
      enabled: true,
      restStatus: status.ok ? "live" : classifyStatus(status.message),
      websocketStatus: classifyWebsocketStatus(provider),
      checkedAt,
      lastTickAt: getLastTickAt(provider),
      cooldownUntil: cooldownUntilTimestamp ? new Date(cooldownUntilTimestamp).toISOString() : null,
      latencyMilliseconds,
      message: status.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${exchange} health check failed.`;
    const cooldownUntilTimestamp = getCooldownUntil(provider);

    return {
      provider,
      exchange,
      enabled: true,
      restStatus: classifyStatus(message),
      websocketStatus: classifyWebsocketStatus(provider),
      checkedAt,
      lastTickAt: getLastTickAt(provider),
      cooldownUntil: cooldownUntilTimestamp ? new Date(cooldownUntilTimestamp).toISOString() : null,
      latencyMilliseconds: null,
      message,
    };
  }
}

function classifyWebsocketStatus(provider: MarketDataProviderId): ExchangeHealthStatus {
  const cooldownUntil = getCooldownUntil(provider);

  //cooldown wins
  if (cooldownUntil && cooldownUntil > Date.now()) {
    return "rate_limited";
  }

  const heartbeat = getHeartbeatTimestamp(provider);

  if (!heartbeat) {
    return "stale";
  }

  return Date.now() - heartbeat <= staleThresholdMilliseconds ? "live" : "stale";
}

function classifyStatus(message: string): ExchangeHealthStatus {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("429") || normalizedMessage.includes("rate") || normalizedMessage.includes("too many")) {
    return "rate_limited";
  }

  if (
    normalizedMessage.includes("403") ||
    normalizedMessage.includes("451") ||
    normalizedMessage.includes("region") ||
    normalizedMessage.includes("country") ||
    normalizedMessage.includes("blocked")
  ) {
    return "region_blocked";
  }

  if (normalizedMessage.includes("stale")) {
    return "stale";
  }

  return "offline";
}

function getLastTickAt(provider: MarketDataProviderId) {
  const timestamp = getHeartbeatTimestamp(provider);
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function getHeartbeatTimestamp(provider: MarketDataProviderId) {
  const timestamp = Number(globalThis.localStorage?.getItem(getHeartbeatKey(provider)));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function getCooldownUntil(provider: MarketDataProviderId) {
  const timestamp = Number(globalThis.localStorage?.getItem(`${websocketCooldownKeyPrefix}.${provider}`));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function getHeartbeatKey(provider: MarketDataProviderId) {
  return `${websocketHeartbeatKeyPrefix}.${provider}`;
}
