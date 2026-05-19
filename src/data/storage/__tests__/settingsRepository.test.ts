import { beforeEach, describe, expect, it } from "vitest";
import { defaultMarketDataSettings } from "../../../settings/marketDataSettings";
import { LocalStorageSettingsRepository } from "../settingsRepository";

describe("LocalStorageSettingsRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default settings when no settings are stored", async () => {
    const repository = new LocalStorageSettingsRepository();

    await expect(repository.getMarketDataSettings()).resolves.toEqual(defaultMarketDataSettings);
  });

  it("persists sanitized market data settings", async () => {
    const repository = new LocalStorageSettingsRepository();

    await repository.saveMarketDataSettings({
      provider: "coinbase",
      baseCurrency: "USD",
      refreshEnabled: true,
      refreshIntervalSeconds: 20,
      timeZone: "UTC",
      dateTimeFormat: "iso-local",
    });

    await expect(repository.getMarketDataSettings()).resolves.toEqual({
      provider: "coinbase",
      baseCurrency: "usd",
      refreshEnabled: true,
      refreshIntervalSeconds: 20,
      timeZone: "UTC",
      dateTimeFormat: "iso-local",
    });
  });
});
