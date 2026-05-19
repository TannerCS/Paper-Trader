import { isTauri } from "@tauri-apps/api/core";
import type { MarketDataProviderId } from "../../types/marketData";
import { getDatabase } from "../storage/database";

export type HistorySyncJobStatus = "queued" | "running" | "paused" | "complete" | "error";
export type HistorySyncItemStatus = "queued" | "running" | "complete" | "error" | "skipped";

export interface HistorySyncJob {
  id: string;
  provider: MarketDataProviderId;
  baseCurrency: string;
  status: HistorySyncJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface HistorySyncJobItem {
  jobId: string;
  coinId: string;
  symbol: string;
  exchange: string;
  rangeKey: string;
  requestedFrom: number;
  requestedTo: number;
  status: HistorySyncItemStatus;
  attempts: number;
  candleCount: number;
  earliestCandle: number | null;
  latestCandle: number | null;
  lastError: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export interface HistorySyncSnapshot {
  job: HistorySyncJob | null;
  items: HistorySyncJobItem[];
}

export interface HistorySyncRepository {
  getLatestSnapshot: () => Promise<HistorySyncSnapshot>;
  createJob: (job: HistorySyncJob, items: HistorySyncJobItem[]) => Promise<void>;
  updateJob: (job: Partial<HistorySyncJob> & { id: string }) => Promise<void>;
  updateItem: (item: Partial<HistorySyncJobItem> & { jobId: string; coinId: string }) => Promise<void>;
  getItems: (jobId: string) => Promise<HistorySyncJobItem[]>;
}

const storageKey = "paper-trader.history-sync";
const maximumLocalJobs = 2;
const maximumLocalItemsPerJob = 80;
const emergencyLocalItemsPerJob = 20;

interface LocalStorageSyncState {
  jobs: HistorySyncJob[];
  items: Record<string, HistorySyncJobItem[]>;
}

export class LocalStorageHistorySyncRepository implements HistorySyncRepository {
  async getLatestSnapshot() {
    const state = pruneLocalState(readLocalState());
    const job = [...state.jobs].sort((leftJob, rightJob) => rightJob.updatedAt.localeCompare(leftJob.updatedAt))[0] ?? null;
    return { job, items: job ? state.items[job.id] ?? [] : [] };
  }

  async createJob(job: HistorySyncJob, items: HistorySyncJobItem[]) {
    const state = pruneLocalState(readLocalState());
    state.jobs = [job, ...state.jobs.filter((currentJob) => currentJob.id !== job.id)];
    state.items[job.id] = items.slice(0, maximumLocalItemsPerJob);
    writeLocalState(state);
  }

  async updateJob(jobPatch: Partial<HistorySyncJob> & { id: string }) {
    const state = pruneLocalState(readLocalState());
    state.jobs = state.jobs.map((job) => (job.id === jobPatch.id ? { ...job, ...jobPatch } : job));
    writeLocalState(state);
  }

  async updateItem(itemPatch: Partial<HistorySyncJobItem> & { jobId: string; coinId: string }) {
    const state = pruneLocalState(readLocalState());
    const items = state.items[itemPatch.jobId] ?? [];
    const existingIndex = items.findIndex((item) => item.coinId === itemPatch.coinId);

    if (existingIndex >= 0) {
      items[existingIndex] = { ...items[existingIndex], ...itemPatch };
    } else {
      items.unshift(createLocalItemFromPatch(itemPatch));
    }

    state.items[itemPatch.jobId] = items.slice(0, maximumLocalItemsPerJob);
    writeLocalState(state);
  }

  async getItems(jobId: string) {
    return pruneLocalState(readLocalState()).items[jobId] ?? [];
  }
}

export class SqliteHistorySyncRepository implements HistorySyncRepository {
  async getLatestSnapshot() {
    const database = await getDatabase();
    const jobs = await database.select<HistorySyncJobRow[]>(
      `SELECT * FROM history_sync_jobs ORDER BY updated_at DESC LIMIT 1`,
    );
    const job = jobs[0] ? mapJob(jobs[0]) : null;
    return { job, items: job ? await this.getItems(job.id) : [] };
  }

  async createJob(job: HistorySyncJob, items: HistorySyncJobItem[]) {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO history_sync_jobs (
         id, provider, base_currency, status, total_items, completed_items, failed_items,
         attempts, last_error, created_at, updated_at, completed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        job.id,
        job.provider,
        job.baseCurrency,
        job.status,
        job.totalItems,
        job.completedItems,
        job.failedItems,
        job.attempts,
        job.lastError,
        job.createdAt,
        job.updatedAt,
        job.completedAt,
      ],
    );

    for (const item of items) {
      await database.execute(
        `INSERT INTO history_sync_job_items (
           job_id, coin_id, symbol, exchange, range_key, requested_from, requested_to, status, attempts,
           candle_count, earliest_candle, latest_candle, last_error, updated_at, completed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          item.jobId,
          item.coinId,
          item.symbol,
          item.exchange,
          item.rangeKey,
          item.requestedFrom,
          item.requestedTo,
          item.status,
          item.attempts,
          item.candleCount,
          item.earliestCandle,
          item.latestCandle,
          item.lastError,
          item.updatedAt,
          item.completedAt,
        ],
      );
    }
  }

  async updateJob(job: Partial<HistorySyncJob> & { id: string }) {
    const database = await getDatabase();
    const existing = await database.select<HistorySyncJobRow[]>(
      `SELECT * FROM history_sync_jobs WHERE id = $1 LIMIT 1`,
      [job.id],
    );
    const nextJob = { ...mapJob(existing[0]), ...job } as HistorySyncJob;
    await database.execute(
      `UPDATE history_sync_jobs
       SET status = $2,
           total_items = $3,
           completed_items = $4,
           failed_items = $5,
           attempts = $6,
           last_error = $7,
           updated_at = $8,
           completed_at = $9
       WHERE id = $1`,
      [
        nextJob.id,
        nextJob.status,
        nextJob.totalItems,
        nextJob.completedItems,
        nextJob.failedItems,
        nextJob.attempts,
        nextJob.lastError,
        nextJob.updatedAt,
        nextJob.completedAt,
      ],
    );
  }

  async updateItem(item: Partial<HistorySyncJobItem> & { jobId: string; coinId: string }) {
    const database = await getDatabase();
    const existing = await database.select<HistorySyncJobItemRow[]>(
      `SELECT * FROM history_sync_job_items WHERE job_id = $1 AND coin_id = $2 LIMIT 1`,
      [item.jobId, item.coinId],
    );
    const nextItem = { ...mapItem(existing[0]), ...item } as HistorySyncJobItem;
    await database.execute(
      `UPDATE history_sync_job_items
       SET status = $3,
           attempts = $4,
           candle_count = $5,
           last_error = $6,
           updated_at = $7,
           completed_at = $8,
           exchange = $9,
           range_key = $10,
           requested_from = $11,
           requested_to = $12,
           earliest_candle = $13,
           latest_candle = $14
       WHERE job_id = $1 AND coin_id = $2`,
      [
        nextItem.jobId,
        nextItem.coinId,
        nextItem.status,
        nextItem.attempts,
        nextItem.candleCount,
        nextItem.lastError,
        nextItem.updatedAt,
        nextItem.completedAt,
        nextItem.exchange,
        nextItem.rangeKey,
        nextItem.requestedFrom,
        nextItem.requestedTo,
        nextItem.earliestCandle,
        nextItem.latestCandle,
      ],
    );
  }

  async getItems(jobId: string) {
    const database = await getDatabase();
    const rows = await database.select<HistorySyncJobItemRow[]>(
      `SELECT * FROM history_sync_job_items WHERE job_id = $1 ORDER BY updated_at DESC`,
      [jobId],
    );
    return rows.map(mapItem);
  }
}

interface HistorySyncJobRow {
  id: string;
  provider: MarketDataProviderId;
  base_currency: string;
  status: HistorySyncJobStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface HistorySyncJobItemRow {
  job_id: string;
  coin_id: string;
  symbol: string;
  exchange?: string | null;
  range_key?: string | null;
  requested_from?: number | null;
  requested_to?: number | null;
  status: HistorySyncItemStatus;
  attempts: number;
  candle_count: number;
  earliest_candle?: number | null;
  latest_candle?: number | null;
  last_error: string | null;
  updated_at: string;
  completed_at: string | null;
}

function mapJob(row: HistorySyncJobRow): HistorySyncJob {
  return {
    id: row.id,
    provider: row.provider,
    baseCurrency: row.base_currency,
    status: row.status,
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapItem(row: HistorySyncJobItemRow): HistorySyncJobItem {
  return {
    jobId: row.job_id,
    coinId: row.coin_id,
    symbol: row.symbol,
    exchange: row.exchange ?? "Exchange",
    rangeKey: row.range_key ?? "all",
    requestedFrom: row.requested_from ?? 0,
    requestedTo: row.requested_to ?? Date.now(),
    status: row.status,
    attempts: row.attempts,
    candleCount: row.candle_count,
    earliestCandle: row.earliest_candle ?? null,
    latestCandle: row.latest_candle ?? null,
    lastError: row.last_error,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function readLocalState(): LocalStorageSyncState {
  const storedValue = globalThis.localStorage?.getItem(storageKey);

  if (!storedValue) {
    return { jobs: [], items: {} };
  }

  try {
    return JSON.parse(storedValue) as LocalStorageSyncState;
  } catch {
    return { jobs: [], items: {} };
  }
}

function writeLocalState(state: LocalStorageSyncState) {
  const prunedState = pruneLocalState(state);

  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(prunedState));
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    const emergencyState = pruneLocalState(prunedState, emergencyLocalItemsPerJob);

    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(emergencyState));
    } catch {
      globalThis.localStorage?.removeItem(storageKey);
    }
  }
}

function pruneLocalState(
  state: LocalStorageSyncState,
  maximumItemsPerJob = maximumLocalItemsPerJob,
): LocalStorageSyncState {
  const jobs = [...state.jobs]
    .sort((leftJob, rightJob) => rightJob.updatedAt.localeCompare(leftJob.updatedAt))
    .slice(0, maximumLocalJobs);
  const jobIds = new Set(jobs.map((job) => job.id));
  const items = Object.fromEntries(
    jobs.map((job) => [job.id, (state.items[job.id] ?? []).slice(0, maximumItemsPerJob)]),
  );

  return {
    jobs,
    items: Object.fromEntries(Object.entries(items).filter(([jobId]) => jobIds.has(jobId))),
  };
}

function createLocalItemFromPatch(
  itemPatch: Partial<HistorySyncJobItem> & { jobId: string; coinId: string },
): HistorySyncJobItem {
  const timestamp = itemPatch.updatedAt ?? new Date().toISOString();

  return {
    jobId: itemPatch.jobId,
    coinId: itemPatch.coinId,
    symbol: itemPatch.symbol ?? itemPatch.coinId,
    exchange: itemPatch.exchange ?? "Exchange",
    rangeKey: itemPatch.rangeKey ?? "all",
    requestedFrom: itemPatch.requestedFrom ?? 0,
    requestedTo: itemPatch.requestedTo ?? Date.now(),
    status: itemPatch.status ?? "running",
    attempts: itemPatch.attempts ?? 0,
    candleCount: itemPatch.candleCount ?? 0,
    earliestCandle: itemPatch.earliestCandle ?? null,
    latestCandle: itemPatch.latestCandle ?? null,
    lastError: itemPatch.lastError ?? null,
    updatedAt: timestamp,
    completedAt: itemPatch.completedAt ?? null,
  };
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function createHistorySyncRepository(): HistorySyncRepository {
  return isTauri() ? new SqliteHistorySyncRepository() : new LocalStorageHistorySyncRepository();
}

export const historySyncRepository = createHistorySyncRepository();
