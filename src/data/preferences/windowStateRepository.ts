import { isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../storage/database";

export interface DesktopWindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface WindowStateRepository {
  getWindowState: () => Promise<DesktopWindowState | null>;
  saveWindowState: (state: DesktopWindowState) => Promise<void>;
}

const settingsKey = "desktopWindowState";
const localStorageKey = "paper-trader.desktop-window-state";

export class LocalStorageWindowStateRepository implements WindowStateRepository {
  async getWindowState() {
    const storedValue = globalThis.localStorage?.getItem(localStorageKey);

    if (!storedValue) {
      return null;
    }

    try {
      return sanitizeWindowState(JSON.parse(storedValue));
    } catch {
      return null;
    }
  }

  async saveWindowState(state: DesktopWindowState) {
    const sanitizedState = sanitizeWindowState(state);

    if (sanitizedState) {
      globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(sanitizedState));
    }
  }
}

export class SqliteWindowStateRepository implements WindowStateRepository {
  async getWindowState() {
    const database = await getDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [settingsKey],
    );

    if (rows.length === 0) {
      return null;
    }

    try {
      return sanitizeWindowState(JSON.parse(rows[0].value));
    } catch {
      return null;
    }
  }

  async saveWindowState(state: DesktopWindowState) {
    const sanitizedState = sanitizeWindowState(state);

    if (!sanitizedState) {
      return;
    }

    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [settingsKey, JSON.stringify(sanitizedState)],
    );
  }
}

export function sanitizeWindowState(value: unknown): DesktopWindowState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<DesktopWindowState>;
  const width = clampWindowDimension(state.width);
  const height = clampWindowDimension(state.height);

  if (width === null || height === null) {
    return null;
  }

  return {
    width,
    height,
    x: sanitizeWindowCoordinate(state.x),
    y: sanitizeWindowCoordinate(state.y),
    maximized: typeof state.maximized === "boolean" ? state.maximized : false,
  };
}

export function createWindowStateRepository(): WindowStateRepository {
  return isTauri() ? new SqliteWindowStateRepository() : new LocalStorageWindowStateRepository();
}

function clampWindowDimension(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.round(Math.min(7680, Math.max(720, numericValue)));
}

function sanitizeWindowCoordinate(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  return Math.round(Math.min(50_000, Math.max(-50_000, numericValue)));
}

export const windowStateRepository = createWindowStateRepository();
