import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageHistorySyncRepository, type HistorySyncJob, type HistorySyncJobItem } from "../historySyncRepository";

describe("LocalStorageHistorySyncRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the latest job and per-asset progress rows", async () => {
    const repository = new LocalStorageHistorySyncRepository();
    const timestamp = "2026-05-17T10:00:00.000Z";
    const job: HistorySyncJob = {
      id: "job-1",
      provider: "binanceus",
      baseCurrency: "usd",
      status: "running",
      totalItems: 1,
      completedItems: 0,
      failedItems: 0,
      attempts: 0,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    const items: HistorySyncJobItem[] = [
      {
        jobId: job.id,
        coinId: "BTCUSD",
        symbol: "BTC/USD",
        exchange: "Binance.US",
        rangeKey: "1d",
        requestedFrom: 1,
        requestedTo: 2,
        status: "queued",
        attempts: 0,
        candleCount: 0,
        earliestCandle: null,
        latestCandle: null,
        lastError: null,
        updatedAt: timestamp,
        completedAt: null,
      },
    ];

    await repository.createJob(job, items);
    await repository.updateItem({
      jobId: job.id,
      coinId: "BTCUSD",
      status: "complete",
      attempts: 1,
      candleCount: 120,
      updatedAt: "2026-05-17T10:01:00.000Z",
      completedAt: "2026-05-17T10:01:00.000Z",
    });
    await repository.updateJob({
      id: job.id,
      status: "complete",
      completedItems: 1,
      attempts: 1,
      updatedAt: "2026-05-17T10:01:00.000Z",
      completedAt: "2026-05-17T10:01:00.000Z",
    });

    await expect(repository.getLatestSnapshot()).resolves.toMatchObject({
      job: { id: "job-1", status: "complete", completedItems: 1, attempts: 1 },
      items: [{ coinId: "BTCUSD", status: "complete", candleCount: 120 }],
    });
  });

  it("keeps the browser fallback bounded so exchange sync cannot exceed storage quota", async () => {
    const repository = new LocalStorageHistorySyncRepository();
    const timestamp = "2026-05-17T10:00:00.000Z";
    const job: HistorySyncJob = {
      id: "job-large",
      provider: "binanceus",
      baseCurrency: "usd",
      status: "running",
      totalItems: 150,
      completedItems: 0,
      failedItems: 0,
      attempts: 0,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    const items: HistorySyncJobItem[] = Array.from({ length: 150 }, (_item, index) => ({
      jobId: job.id,
      coinId: `COIN${index}`,
      symbol: `COIN/${index}`,
      exchange: "Binance.US",
      rangeKey: "1d",
      requestedFrom: 1,
      requestedTo: 2,
      status: "queued",
      attempts: 0,
      candleCount: 0,
      earliestCandle: null,
      latestCandle: null,
      lastError: null,
      updatedAt: timestamp,
      completedAt: null,
    }));

    await repository.createJob(job, items);

    await expect(repository.getItems(job.id)).resolves.toHaveLength(80);
  });

  it("recovers from quota failures by trimming the local snapshot", async () => {
    const repository = new LocalStorageHistorySyncRepository();
    const timestamp = "2026-05-17T10:00:00.000Z";
    const job: HistorySyncJob = {
      id: "job-quota",
      provider: "binanceus",
      baseCurrency: "usd",
      status: "running",
      totalItems: 100,
      completedItems: 0,
      failedItems: 0,
      attempts: 0,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    const items: HistorySyncJobItem[] = Array.from({ length: 100 }, (_item, index) => ({
      jobId: job.id,
      coinId: `BTC${index}`,
      symbol: `BTC/${index}`,
      exchange: "Binance.US",
      rangeKey: "1d",
      requestedFrom: 1,
      requestedTo: 2,
      status: "queued",
      attempts: 0,
      candleCount: 0,
      earliestCandle: null,
      latestCandle: null,
      lastError: null,
      updatedAt: timestamp,
      completedAt: null,
    }));
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;

    Storage.prototype.setItem = function setItemWithSingleQuotaFailure(key: string, value: string) {
      calls += 1;

      if (calls === 1) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }

      return originalSetItem.call(this, key, value);
    };

    try {
      await repository.createJob(job, items);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }

    await expect(repository.getItems(job.id)).resolves.toHaveLength(20);
  });
});
