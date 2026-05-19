import type { OhlcCandle } from "../types/marketData";

export function aggregatePricesToOhlc(prices: Array<[number, number]>, bucketSizeMilliseconds: number): OhlcCandle[] {
  if (prices.length === 0) {
    return [];
  }

  const buckets = new Map<number, number[]>();

  for (const [timestamp, price] of prices) {
    const bucketTimestamp = Math.floor(timestamp / bucketSizeMilliseconds) * bucketSizeMilliseconds;
    const bucketPrices = buckets.get(bucketTimestamp) ?? [];
    bucketPrices.push(price);
    buckets.set(bucketTimestamp, bucketPrices);
  }

  return Array.from(buckets.entries())
    .sort(([leftTimestamp], [rightTimestamp]) => leftTimestamp - rightTimestamp)
    .map(([timestamp, bucketPrices]) => {
      const open = bucketPrices[0];
      const close = bucketPrices[bucketPrices.length - 1];
      const high = Math.max(...bucketPrices);
      const low = Math.min(...bucketPrices);

      return { timestamp, open, high, low, close };
    });
}

export function mergeLivePriceIntoOhlc(
  candles: OhlcCandle[],
  price: number | null | undefined,
  timestamp: string | number | null | undefined,
  bucketSizeMilliseconds: number,
): OhlcCandle[] {
  if (!price || !Number.isFinite(price) || bucketSizeMilliseconds <= 0) {
    return candles;
  }

  const numericTimestamp = typeof timestamp === "number" ? timestamp : timestamp ? new Date(timestamp).getTime() : Date.now();

  if (!Number.isFinite(numericTimestamp)) {
    return candles;
  }

  const bucketTimestamp = Math.floor(numericTimestamp / bucketSizeMilliseconds) * bucketSizeMilliseconds;
  const nextCandles = [...candles];
  const lastCandle = nextCandles[nextCandles.length - 1];

  if (!lastCandle || bucketTimestamp > lastCandle.timestamp) {
    nextCandles.push({
      timestamp: bucketTimestamp,
      open: lastCandle?.close ?? price,
      high: price,
      low: price,
      close: price,
    });
    return nextCandles;
  }

  if (bucketTimestamp === lastCandle.timestamp) {
    nextCandles[nextCandles.length - 1] = {
      ...lastCandle,
      high: Math.max(lastCandle.high, price),
      low: Math.min(lastCandle.low, price),
      close: price,
    };
  }

  return nextCandles;
}
