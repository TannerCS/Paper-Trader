import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageChartDrawingRepository } from "../chartDrawingRepository";

describe("LocalStorageChartDrawingRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists chart drawings by market id", async () => {
    const repository = new LocalStorageChartDrawingRepository();
    const drawings = [
      {
        id: "line-1",
        name: "segment",
        paneId: "candle_pane",
        points: [
          { timestamp: 1, value: 100 },
          { timestamp: 2, value: 120 },
        ],
        visible: true,
        styles: {
          line: { color: "#ff0000", size: 2, style: "solid", dashedValue: [2, 2], smooth: false },
        },
      },
    ];

    await repository.saveChartDrawings("binanceus:BTCUSDT", drawings);

    await expect(repository.getChartDrawings("binanceus:BTCUSDT")).resolves.toEqual(drawings);
    await expect(repository.getChartDrawings("okx:BTC-USDT")).resolves.toEqual([]);
  });

  it("keeps price-only drawings like horizontal lines", async () => {
    const repository = new LocalStorageChartDrawingRepository();
    const drawings = [
      {
        id: "horizontal-1",
        name: "horizontalStraightLine",
        paneId: "candle_pane",
        points: [{ value: 78000 }],
        visible: true,
      },
    ];

    await repository.saveChartDrawings("binanceus:BTCUSDT", drawings);

    await expect(repository.getChartDrawings("binanceus:BTCUSDT")).resolves.toEqual([
      {
        ...drawings[0],
        extendData: undefined,
        styles: undefined,
      },
    ]);
  });
});
