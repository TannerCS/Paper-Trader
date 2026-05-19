import { isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../storage/database";
import {
  sanitizeChartOverlayPreference,
  type ChartOverlayPreferences,
} from "./terminalPreferences";

export interface ChartDrawingRepository {
  getChartDrawings: (marketId: string) => Promise<ChartOverlayPreferences[]>;
  saveChartDrawings: (marketId: string, drawings: ChartOverlayPreferences[]) => Promise<void>;
}

const localStoragePrefix = "paper-trader.chart-drawings";
const settingsPrefix = "chartDrawings";

export class LocalStorageChartDrawingRepository implements ChartDrawingRepository {
  async getChartDrawings(marketId: string) {
    const storedValue = globalThis.localStorage?.getItem(getLocalStorageKey(marketId));

    if (!storedValue) {
      return [];
    }

    try {
      return sanitizeChartDrawings(JSON.parse(storedValue));
    } catch {
      return [];
    }
  }

  async saveChartDrawings(marketId: string, drawings: ChartOverlayPreferences[]) {
    globalThis.localStorage?.setItem(getLocalStorageKey(marketId), JSON.stringify(sanitizeChartDrawings(drawings)));
  }
}

export class SqliteChartDrawingRepository implements ChartDrawingRepository {
  async getChartDrawings(marketId: string) {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [getSettingsKey(marketId)],
    );

    if (rows.length === 0) {
      return [];
    }

    try {
      return sanitizeChartDrawings(JSON.parse(rows[0].value));
    } catch {
      return [];
    }
  }

  async saveChartDrawings(marketId: string, drawings: ChartOverlayPreferences[]) {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [getSettingsKey(marketId), JSON.stringify(sanitizeChartDrawings(drawings))],
    );
  }
}

export function sanitizeChartDrawings(value: unknown) {
  return Array.isArray(value) ? value.map(sanitizeChartOverlayPreference).filter(isChartOverlay) : [];
}

export function createChartDrawingRepository(): ChartDrawingRepository {
  return isTauri() ? new SqliteChartDrawingRepository() : new LocalStorageChartDrawingRepository();
}

function getLocalStorageKey(marketId: string) {
  return `${localStoragePrefix}.${marketId}`;
}

function getSettingsKey(marketId: string) {
  return `${settingsPrefix}:${marketId}`;
}

function isChartOverlay(value: ChartOverlayPreferences | null): value is ChartOverlayPreferences {
  return Boolean(value);
}

export const chartDrawingRepository = createChartDrawingRepository();
