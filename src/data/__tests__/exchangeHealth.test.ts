import { beforeEach, describe, expect, it } from "vitest";
import { getVenuePuritySnapshot, rememberExchangeHeartbeat } from "../exchangeHealth";

describe("exchangeHealth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps chart, tape, and fills on the selected venue", () => {
    const snapshot = getVenuePuritySnapshot({
      exchange: "OKX",
      provider: "okx",
      tickConnected: true,
      tickUpdatedAt: new Date().toISOString(),
    });

    expect(snapshot).toMatchObject({
      chartSource: "OKX",
      tapeSource: "OKX",
      executionSource: "OKX",
      liveStatus: "live",
    });
  });

  it("records websocket heartbeats per exchange provider", () => {
    rememberExchangeHeartbeat("binanceus", 1_771_000_000_000);

    expect(localStorage.getItem("paper-trader.websocket-heartbeat.binanceus")).toBe("1771000000000");
  });
});
