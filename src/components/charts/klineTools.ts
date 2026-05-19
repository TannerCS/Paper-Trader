export const kLineIndicatorNames = [
  "AVP",
  "AO",
  "BIAS",
  "BOLL",
  "BRAR",
  "BBI",
  "CCI",
  "CR",
  "DMA",
  "DMI",
  "EMV",
  "EMA",
  "MTM",
  "MA",
  "MACD",
  "OBV",
  "PVT",
  "PSY",
  "ROC",
  "RSI",
  "SMA",
  "KDJ",
  "SAR",
  "TRIX",
  "VOL",
  "VR",
  "WR",
] as const;

export const kLineOverlayNames = [
  "fibonacciLine",
  "horizontalRayLine",
  "horizontalSegment",
  "horizontalStraightLine",
  "parallelStraightLine",
  "priceChannelLine",
  "priceLine",
  "rayLine",
  "segment",
  "straightLine",
  "verticalRayLine",
  "verticalSegment",
  "verticalStraightLine",
  "simpleAnnotation",
  "simpleTag",
] as const;

export type KLineIndicatorName = (typeof kLineIndicatorNames)[number];
export type KLineOverlayName = (typeof kLineOverlayNames)[number];

export interface KLineActiveIndicator {
  id: string;
  name: KLineIndicatorName;
  calcParams?: number[];
}

export const defaultIndicatorParams: Partial<Record<KLineIndicatorName, number[]>> = {
  AO: [5, 34],
  BIAS: [6, 12, 24],
  BOLL: [20, 2],
  BRAR: [26],
  CCI: [20],
  CR: [26, 10, 20, 40, 60],
  DMA: [10, 50, 10],
  DMI: [14, 6],
  EMA: [6, 12, 20],
  KDJ: [9, 3, 3],
  MA: [5, 10, 30, 60],
  MACD: [12, 26, 9],
  MTM: [12, 6],
  RSI: [6, 12, 24],
  SMA: [12, 2],
  TRIX: [12, 20],
  VOL: [5, 10, 20],
  VR: [24, 30],
  WR: [13, 34, 89],
};

export function createActiveIndicator(name: KLineIndicatorName): KLineActiveIndicator {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    calcParams: defaultIndicatorParams[name],
  };
}
