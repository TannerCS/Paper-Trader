import type { CandleRange, TerminalRangePreset } from "../types/marketData";

export interface ResolvedCandleRange {
  from: number;
  to: number;
  cacheKey: string;
}

export interface KLinePeriod {
  type: "minute" | "hour" | "day" | "week" | "month" | "year";
  span: number;
}

export const terminalRangePresets: TerminalRangePreset[] = [
  "1m",
  "5m",
  "30m",
  "1h",
  "3h",
  "6h",
  "12h",
  "1d",
  "1w",
  "1M",
  "1y",
];

const lookbackDurationsMilliseconds: Record<TerminalRangePreset, number> = {
  "1m": 24 * 60 * 60 * 1000,
  "5m": 3 * 24 * 60 * 60 * 1000,
  "30m": 14 * 24 * 60 * 60 * 1000,
  "1h": 30 * 24 * 60 * 60 * 1000,
  "3h": 90 * 24 * 60 * 60 * 1000,
  "6h": 180 * 24 * 60 * 60 * 1000,
  "12h": 365 * 24 * 60 * 60 * 1000,
  "1d": 365 * 24 * 60 * 60 * 1000,
  "1w": 5 * 365 * 24 * 60 * 60 * 1000,
  "1M": 10 * 365 * 24 * 60 * 60 * 1000,
  "1y": 25 * 365 * 24 * 60 * 60 * 1000,
};

const bucketDurationsMilliseconds: Record<TerminalRangePreset, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

export function resolveCandleRange(range: CandleRange, now = Date.now()): ResolvedCandleRange {
  if (range.from && range.to) {
    const bucketSize = getAggregationBucketMilliseconds(range);
    return {
      from: range.from,
      to: range.to,
      cacheKey: `${range.from}-${range.to}-${bucketSize}`,
    };
  }

  const preset = range.preset ?? "1d";
  const duration = lookbackDurationsMilliseconds[preset];

  return {
    from: now - duration,
    to: now,
    cacheKey: preset === "3h" ? "3h-v2" : preset,
  };
}

export function getAggregationBucketMilliseconds(range: CandleRange) {
  if (range.preset) {
    return bucketDurationsMilliseconds[range.preset];
  }

  if (!range.from || !range.to) {
    return bucketDurationsMilliseconds["1d"];
  }

  return bucketDurationsMilliseconds[getPresetForCustomRange(range.from, range.to)];
}

export function getKLinePeriod(range: CandleRange): KLinePeriod {
  const preset = range.preset ?? (range.from && range.to ? getPresetForCustomRange(range.from, range.to) : "1d");

  if (preset === "1m") return { type: "minute", span: 1 };
  if (preset === "5m") return { type: "minute", span: 5 };
  if (preset === "30m") return { type: "minute", span: 30 };
  if (preset === "1h") return { type: "hour", span: 1 };
  if (preset === "3h") return { type: "hour", span: 3 };
  if (preset === "6h") return { type: "hour", span: 6 };
  if (preset === "12h") return { type: "hour", span: 12 };
  if (preset === "1d") return { type: "day", span: 1 };
  if (preset === "1w") return { type: "week", span: 1 };
  if (preset === "1M") return { type: "month", span: 1 };
  return { type: "year", span: 1 };
}

export function getPresetForCustomRange(from: number, to: number): TerminalRangePreset {
  const duration = Math.max(0, to - from);
  const oneDay = 24 * 60 * 60 * 1000;

  if (duration <= 2 * oneDay) return "1m";
  if (duration <= 7 * oneDay) return "5m";
  if (duration <= 30 * oneDay) return "30m";
  if (duration <= 90 * oneDay) return "1h";
  if (duration <= 180 * oneDay) return "3h";
  if (duration <= 365 * oneDay) return "6h";
  if (duration <= 2 * 365 * oneDay) return "1d";
  if (duration <= 8 * 365 * oneDay) return "1w";
  return "1M";
}
