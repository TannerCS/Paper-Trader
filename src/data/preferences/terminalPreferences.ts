import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRangePreset } from "../../types/marketData";
import type { PaperOrderKind } from "../paper/types";
import {
  createActiveIndicator,
  defaultIndicatorParams,
  type KLineActiveIndicator,
  type KLineIndicatorName,
} from "../../components/charts/klineTools";
import { getDatabase } from "../storage/database";

export interface ChartViewportPreferences {
  barSpace?: number;
  offsetRightDistance?: number;
  visibleFrom?: number;
  visibleTo?: number;
}

export interface ChartToolbarPositionPreferences {
  x: number;
  y: number;
}

export interface ChartOverlayPreferences {
  id: string;
  name: string;
  points: Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
  paneId?: string;
  visible?: boolean;
  extendData?: unknown;
  styles?: unknown;
}

export interface ChartStylePreferences {
  candleType: "candle_solid" | "candle_stroke" | "candle_up_stroke" | "candle_down_stroke" | "ohlc" | "area";
  upColor: string;
  downColor: string;
  gridVisible: boolean;
  gridColor: string;
  gridStyle: "solid" | "dashed";
  crosshairVisible: boolean;
  lastPriceLineVisible: boolean;
}

export interface TerminalPreferences {
  selectedCoinId: string;
  selectedRangePreset: TerminalRangePreset;
  orderTicketWidth: number;
  terminalPanelHeight: number;
  orderTicketHeight: number;
  purchaseBookMuted: boolean;
  orderTicketTab: PaperOrderKind;
  activeIndicators: KLineActiveIndicator[];
  chartViewport: ChartViewportPreferences;
  chartToolbarPosition: ChartToolbarPositionPreferences;
  chartOverlays: ChartOverlayPreferences[];
  chartOverlaysByCoinId: Record<string, ChartOverlayPreferences[]>;
  chartStyles: ChartStylePreferences;
}

export interface TerminalPreferencesRepository {
  getTerminalPreferences: () => Promise<TerminalPreferences>;
  saveTerminalPreferences: (preferences: TerminalPreferences) => Promise<void>;
}

const localStorageKey = "paper-trader.terminal-preferences";
const settingsKey = "terminalPreferences";

export const defaultTerminalPreferences: TerminalPreferences = {
  selectedCoinId: "BTCUSD",
  selectedRangePreset: "1d",
  orderTicketWidth: 360,
  terminalPanelHeight: 620,
  orderTicketHeight: 360,
  purchaseBookMuted: true,
  orderTicketTab: "spot-market",
  activeIndicators: [
    { id: "default-ma", name: "MA", calcParams: [5, 10, 30, 60] },
    { id: "default-vol", name: "VOL", calcParams: [5, 10, 20] },
    { id: "default-macd", name: "MACD", calcParams: [12, 26, 9] },
  ],
  chartViewport: {},
  chartToolbarPosition: { x: 12, y: 92 },
  chartOverlays: [],
  chartOverlaysByCoinId: {},
  chartStyles: {
    candleType: "candle_solid",
    upColor: "#2dc08e",
    downColor: "#f92855",
    gridVisible: true,
    gridColor: "#ededed",
    gridStyle: "dashed",
    crosshairVisible: true,
    lastPriceLineVisible: true,
  },
};

export class LocalStorageTerminalPreferencesRepository implements TerminalPreferencesRepository {
  async getTerminalPreferences() {
    const storedValue = globalThis.localStorage?.getItem(localStorageKey);

    if (!storedValue) {
      return defaultTerminalPreferences;
    }

    try {
      return sanitizeTerminalPreferences(JSON.parse(storedValue) as Partial<TerminalPreferences>);
    } catch {
      return defaultTerminalPreferences;
    }
  }

  async saveTerminalPreferences(preferences: TerminalPreferences) {
    globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(sanitizeTerminalPreferences(preferences)));
  }
}

export class SqliteTerminalPreferencesRepository implements TerminalPreferencesRepository {
  async getTerminalPreferences() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [settingsKey],
    );

    if (rows.length === 0) {
      return defaultTerminalPreferences;
    }

    try {
      return sanitizeTerminalPreferences(JSON.parse(rows[0].value) as Partial<TerminalPreferences>);
    } catch {
      return defaultTerminalPreferences;
    }
  }

  async saveTerminalPreferences(preferences: TerminalPreferences) {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [settingsKey, JSON.stringify(sanitizeTerminalPreferences(preferences))],
    );
  }
}

export function createTerminalPreferencesRepository(): TerminalPreferencesRepository {
  return isTauri() ? new SqliteTerminalPreferencesRepository() : new LocalStorageTerminalPreferencesRepository();
}

export function sanitizeTerminalPreferences(preferences: Partial<TerminalPreferences>): TerminalPreferences {
  return {
    selectedCoinId: preferences.selectedCoinId?.trim() || defaultTerminalPreferences.selectedCoinId,
    selectedRangePreset: isTerminalRangePreset(preferences.selectedRangePreset)
      ? preferences.selectedRangePreset
      : defaultTerminalPreferences.selectedRangePreset,
    orderTicketWidth: clampNumber(preferences.orderTicketWidth, 300, 640, defaultTerminalPreferences.orderTicketWidth),
    terminalPanelHeight: clampNumber(
      preferences.terminalPanelHeight,
      420,
      980,
      defaultTerminalPreferences.terminalPanelHeight,
    ),
    orderTicketHeight: clampNumber(
      preferences.orderTicketHeight,
      180,
      900,
      defaultTerminalPreferences.orderTicketHeight,
    ),
    purchaseBookMuted:
      typeof preferences.purchaseBookMuted === "boolean"
        ? preferences.purchaseBookMuted
        : defaultTerminalPreferences.purchaseBookMuted,
    orderTicketTab: isPaperOrderKind(preferences.orderTicketTab)
      ? preferences.orderTicketTab
      : defaultTerminalPreferences.orderTicketTab,
    activeIndicators: Array.isArray(preferences.activeIndicators)
      ? preferences.activeIndicators.map(sanitizeActiveIndicator).filter(isActiveIndicator)
      : defaultTerminalPreferences.activeIndicators,
    chartViewport: {
      barSpace: positiveNumber(preferences.chartViewport?.barSpace),
      offsetRightDistance: finiteNumber(preferences.chartViewport?.offsetRightDistance),
      visibleFrom: finiteNumber(preferences.chartViewport?.visibleFrom),
      visibleTo: finiteNumber(preferences.chartViewport?.visibleTo),
    },
    chartToolbarPosition: {
      x: clampNumber(
        preferences.chartToolbarPosition?.x,
        0,
        2000,
        defaultTerminalPreferences.chartToolbarPosition.x,
      ),
      y: clampNumber(
        preferences.chartToolbarPosition?.y,
        0,
        1200,
        defaultTerminalPreferences.chartToolbarPosition.y,
      ),
    },
    chartOverlays: Array.isArray(preferences.chartOverlays)
      ? preferences.chartOverlays.map(sanitizeChartOverlayPreference).filter(isChartOverlay)
      : defaultTerminalPreferences.chartOverlays,
    chartOverlaysByCoinId: sanitizeChartOverlayMap(preferences.chartOverlaysByCoinId),
    chartStyles: sanitizeChartStyles(preferences.chartStyles),
  };
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numericValue));
}

function positiveNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

function finiteNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function isTerminalRangePreset(value: unknown): value is TerminalRangePreset {
  return ["1m", "5m", "30m", "1h", "3h", "6h", "12h", "1d", "1w", "1M", "1y"].includes(String(value));
}

function isPaperOrderKind(value: unknown): value is PaperOrderKind {
  return ["spot-market", "spot-limit", "perp"].includes(String(value));
}

function sanitizeActiveIndicator(value: unknown): KLineActiveIndicator | null {
  if (isKLineIndicatorName(value)) {
    return createActiveIndicator(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const indicator = value as Partial<KLineActiveIndicator>;

  if (!isKLineIndicatorName(indicator.name)) {
    return null;
  }

  return {
    id: indicator.id?.trim() || createActiveIndicator(indicator.name).id,
    name: indicator.name,
    calcParams: Array.isArray(indicator.calcParams)
      ? indicator.calcParams.map(Number).filter((calcParam) => Number.isFinite(calcParam) && calcParam > 0)
      : defaultIndicatorParams[indicator.name],
  };
}

function isActiveIndicator(value: KLineActiveIndicator | null): value is KLineActiveIndicator {
  return Boolean(value);
}

function isKLineIndicatorName(value: unknown): value is KLineIndicatorName {
  return [
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
  ].includes(String(value));
}

export function sanitizeChartOverlayPreference(value: unknown): ChartOverlayPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const overlay = value as Partial<ChartOverlayPreferences>;

  if (!overlay.id || !overlay.name || !Array.isArray(overlay.points)) {
    return null;
  }

  return {
    id: String(overlay.id),
    name: String(overlay.name),
    points: overlay.points
      .map((point) => ({
        timestamp: finiteNumber(point?.timestamp),
        dataIndex: finiteNumber(point?.dataIndex),
        value: finiteNumber(point?.value),
      }))
      .filter((point) => point.timestamp !== undefined || point.dataIndex !== undefined || point.value !== undefined),
    paneId: typeof overlay.paneId === "string" ? overlay.paneId : undefined,
    visible: typeof overlay.visible === "boolean" ? overlay.visible : true,
    extendData: overlay.extendData,
    styles: overlay.styles,
  };
}

function isChartOverlay(value: ChartOverlayPreferences | null): value is ChartOverlayPreferences {
  return Boolean(value);
}

function sanitizeChartOverlayMap(value: unknown): Record<string, ChartOverlayPreferences[]> {
  if (!value || typeof value !== "object") {
    return defaultTerminalPreferences.chartOverlaysByCoinId;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([coinId, overlays]) => [
        coinId,
        Array.isArray(overlays) ? overlays.map(sanitizeChartOverlayPreference).filter(isChartOverlay) : [],
      ])
      .filter(([coinId]) => String(coinId).trim().length > 0),
  );
}

function sanitizeChartStyles(styles: Partial<ChartStylePreferences> | undefined): ChartStylePreferences {
  const fallback = defaultTerminalPreferences.chartStyles;

  return {
    candleType: isCandleType(styles?.candleType) ? styles.candleType : fallback.candleType,
    upColor: sanitizeHexColor(styles?.upColor, fallback.upColor),
    downColor: sanitizeHexColor(styles?.downColor, fallback.downColor),
    gridVisible: typeof styles?.gridVisible === "boolean" ? styles.gridVisible : fallback.gridVisible,
    gridColor: sanitizeHexColor(styles?.gridColor, fallback.gridColor),
    gridStyle: styles?.gridStyle === "solid" ? "solid" : fallback.gridStyle,
    crosshairVisible: typeof styles?.crosshairVisible === "boolean" ? styles.crosshairVisible : fallback.crosshairVisible,
    lastPriceLineVisible:
      typeof styles?.lastPriceLineVisible === "boolean" ? styles.lastPriceLineVisible : fallback.lastPriceLineVisible,
  };
}

function isCandleType(value: unknown): value is ChartStylePreferences["candleType"] {
  return ["candle_solid", "candle_stroke", "candle_up_stroke", "candle_down_stroke", "ohlc", "area"].includes(String(value));
}

function sanitizeHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export const terminalPreferencesRepository = createTerminalPreferencesRepository();
