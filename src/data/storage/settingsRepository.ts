import { isTauri } from "@tauri-apps/api/core";
import {
  defaultMarketDataSettings,
  sanitizeMarketDataSettings,
  type MarketDataSettings,
} from "../../settings/marketDataSettings";
import { getDatabase } from "./database";

export interface SettingsRepository {
  getMarketDataSettings: () => Promise<MarketDataSettings>;
  saveMarketDataSettings: (settings: MarketDataSettings) => Promise<void>;
}

const marketDataSettingsKey = "marketDataSettings";
const localStorageKey = "paper-trader.market-data-settings";

export class LocalStorageSettingsRepository implements SettingsRepository {
  async getMarketDataSettings() {
    const storedValue = globalThis.localStorage?.getItem(localStorageKey);

    if (!storedValue) {
      return defaultMarketDataSettings;
    }

    try {
      return sanitizeMarketDataSettings(JSON.parse(storedValue) as Partial<MarketDataSettings>);
    } catch {
      return defaultMarketDataSettings;
    }
  }

  async saveMarketDataSettings(settings: MarketDataSettings) {
    globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(sanitizeMarketDataSettings(settings)));
  }
}

export class SqliteSettingsRepository implements SettingsRepository {
  async getMarketDataSettings() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [marketDataSettingsKey],
    );

    if (rows.length === 0) {
      return defaultMarketDataSettings;
    }

    try {
      return sanitizeMarketDataSettings(JSON.parse(rows[0].value) as Partial<MarketDataSettings>);
    } catch {
      return defaultMarketDataSettings;
    }
  }

  async saveMarketDataSettings(settings: MarketDataSettings) {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [marketDataSettingsKey, JSON.stringify(sanitizeMarketDataSettings(settings))],
    );
  }
}

export function createSettingsRepository(): SettingsRepository {
  return isTauri() ? new SqliteSettingsRepository() : new LocalStorageSettingsRepository();
}

export const settingsRepository = createSettingsRepository();
