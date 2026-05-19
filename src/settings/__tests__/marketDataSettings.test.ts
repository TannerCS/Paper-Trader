import { describe, expect, it } from "vitest";
import { defaultMarketDataSettings, sanitizeMarketDataSettings } from "../marketDataSettings";

describe("sanitizeMarketDataSettings", () => {
  it("keeps valid exchange settings", () => {
    expect(
      sanitizeMarketDataSettings({
        provider: "coinbase",
        baseCurrency: "EUR",
        refreshEnabled: false,
        refreshIntervalSeconds: 45,
        timeZone: "UTC",
        dateTimeFormat: "iso-local",
      }),
    ).toEqual({
      provider: "coinbase",
      baseCurrency: "eur",
      refreshEnabled: false,
      refreshIntervalSeconds: 45,
      timeZone: "UTC",
      dateTimeFormat: "iso-local",
    });
  });

  it("falls back to defaults for invalid settings", () => {
    expect(
      sanitizeMarketDataSettings({
        provider: "enterprise" as never,
        refreshIntervalSeconds: 0,
      }),
    ).toEqual(defaultMarketDataSettings);
  });
});
