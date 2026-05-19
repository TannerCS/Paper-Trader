import type { DateTimeFormatId, MarketDataProviderId, MarketDataSettings } from "../types/marketData";

export type { MarketDataProviderId, MarketDataSettings };

export const dateTimeFormatOptions: Array<{ id: DateTimeFormatId; label: string }> = [
  { id: "date-time-medium", label: "May 17, 2026, 4:17 AM" },
  { id: "date-time-short", label: "5/17/26, 4:17 AM" },
  { id: "date-time-long", label: "May 17, 2026 at 4:17:32 AM CDT" },
  { id: "iso-local", label: "2026-05-17 04:17:32" },
  { id: "month-day-time", label: "May 17, 4:17 AM" },
  { id: "numeric-date-time", label: "05/17/2026 04:17" },
  { id: "date-only-medium", label: "May 17, 2026" },
  { id: "time-only-12h", label: "4:17 AM" },
  { id: "time-only-24h", label: "04:17" },
];

export const defaultMarketDataSettings: MarketDataSettings = {
  provider: "binanceus",
  baseCurrency: "usd",
  refreshEnabled: true,
  refreshIntervalSeconds: 1,
  timeZone: getBrowserTimeZone(),
  dateTimeFormat: "date-time-medium",
};

export function sanitizeMarketDataSettings(settings: Partial<MarketDataSettings>): MarketDataSettings {
  const refreshIntervalSeconds =
    typeof settings.refreshIntervalSeconds === "number" && settings.refreshIntervalSeconds >= 1
      ? Math.round(settings.refreshIntervalSeconds)
      : defaultMarketDataSettings.refreshIntervalSeconds;

  return {
    provider: sanitizeProvider(settings.provider),
    baseCurrency: settings.baseCurrency?.trim().toLowerCase() || defaultMarketDataSettings.baseCurrency,
    refreshEnabled:
      typeof settings.refreshEnabled === "boolean" ? settings.refreshEnabled : defaultMarketDataSettings.refreshEnabled,
    refreshIntervalSeconds,
    timeZone: sanitizeTimeZone(settings.timeZone),
    dateTimeFormat: sanitizeDateTimeFormat(settings.dateTimeFormat),
  };
}

function sanitizeProvider(provider: unknown): MarketDataProviderId {
  if (provider === "coinbase") return "coinbase";
  if (provider === "okx") return "okx";
  if (provider === "mexc") return "mexc";
  if (provider === "phemex") return "phemex";
  if (provider === "bybit") return "bybit";
  return "binanceus";
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function sanitizeTimeZone(timeZone: unknown) {
  const candidateTimeZone = typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : getBrowserTimeZone();

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidateTimeZone }).format(new Date());
    return candidateTimeZone;
  } catch {
    return getBrowserTimeZone();
  }
}

function sanitizeDateTimeFormat(value: unknown): DateTimeFormatId {
  return dateTimeFormatOptions.some((option) => option.id === value) ? (value as DateTimeFormatId) : "date-time-medium";
}
