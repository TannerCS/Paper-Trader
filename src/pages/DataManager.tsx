import { useEffect, useMemo, useState } from "react";
import type { CandleHistorySummary } from "../data/storage/candleRepository";
import { candleRepository } from "../data/storage/candleRepository";
import { useCoinMarkets, useExchangeHealth, useMarketDataSettings } from "../data/queries";
import { pauseHistorySync, startHistorySync } from "../data/sync/historySyncQueue";
import {
  historySyncRepository,
  type HistorySyncItemStatus,
  type HistorySyncJobStatus,
  type HistorySyncSnapshot,
} from "../data/sync/historySyncRepository";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatDateTime } from "../lib/format";

export function DataManager() {
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const exchangeHealthQuery = useExchangeHealth();
  const [summary, setSummary] = useState<CandleHistorySummary>({ coinCount: 0, candleCount: 0 });
  const [syncSnapshot, setSyncSnapshot] = useState<HistorySyncSnapshot>({ job: null, items: [] });
  const [isSyncing, setIsSyncing] = useState(false);
  const job = syncSnapshot.job;
  const items = syncSnapshot.items;
  const exchangeProgress = useMemo(() => groupItemsByExchange(items), [items]);
  const timeframeProgress = useMemo(() => groupItemsByRange(items), [items]);
  const canSync = Boolean(settingsQuery.data && marketsQuery.data?.length && !isSyncing);

  useEffect(() => {
    void refreshSummary();
    void refreshSyncSnapshot();
  }, []);

  useEffect(() => {
    if (job?.status === "complete" || job?.status === "error" || job?.status === "paused") {
      void refreshSummary();
    }
  }, [job?.status]);

  async function refreshSummary() {
    setSummary(await candleRepository.getSummary());
  }

  async function refreshSyncSnapshot() {
    setSyncSnapshot(await historySyncRepository.getLatestSnapshot());
  }

  async function syncVisibleMarketHistory() {
    if (!settingsQuery.data || !marketsQuery.data?.length) {
      return;
    }

    //start sync job
    setIsSyncing(true);
    try {
      await startHistorySync({
        settings: settingsQuery.data,
        markets: marketsQuery.data,
        onUpdate: (snapshot) => {
          setSyncSnapshot(snapshot);
          void refreshSummary();
        },
      });
    } finally {
      setIsSyncing(false);
      await refreshSummary();
      await refreshSyncSnapshot();
    }
  }

  async function pauseSync() {
    setSyncSnapshot(await pauseHistorySync());
    setIsSyncing(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Data Manager" />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="History Coins" value={String(summary.coinCount)} />
        <MetricCard label="Cached Candles" value={summary.candleCount.toLocaleString()} />
        <MetricCard label="Loaded Markets" value={String(marketsQuery.data?.length ?? 0)} />
        <MetricCard label="Healthy Exchanges" value={`${exchangeHealthQuery.data?.filter((row) => row.restStatus === "live").length ?? 0}/${exchangeHealthQuery.data?.filter((row) => row.enabled).length ?? 0}`} />
      </div>

      <Panel
        title="Historical Sync Queue"
        eyebrow="Candles"
        action={<StatusBadge label={job ? job.status : "idle"} tone={jobStatusTone(job?.status)} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-3">
          <div>
            <p className="text-sm font-semibold text-text">{getSyncMessage(syncSnapshot)}</p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-panel border border-border/70 px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted disabled:opacity-55"
              disabled={job?.status !== "running"}
              onClick={() => void pauseSync()}
              type="button"
            >
              Pause
            </button>
            <button
              className="rounded-panel bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-55"
              disabled={!canSync}
              onClick={() => void syncVisibleMarketHistory()}
              type="button"
            >
              {isSyncing ? "Syncing" : job?.status === "paused" ? "Resume as New Job" : "Sync Visible History"}
            </button>
          </div>
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-5">
          <MetricCard label="Progress" value={job ? `${job.completedItems}/${job.totalItems}` : "0/0"} />
          <MetricCard label="Failures" value={String(job?.failedItems ?? 0)} />
          <MetricCard label="Attempts" value={String(job?.attempts ?? 0)} />
          <MetricCard label="Updated" value={formatDateTime(job?.updatedAt)} />
          <MetricCard label="Last Error" value={job?.lastError ?? "--"} />
        </div>

        <div className="grid gap-3 border-t border-border/60 p-3 lg:grid-cols-2">
          <ProgressGroup title="Per Exchange" rows={exchangeProgress} />
          <ProgressGroup title="Per Timeframe" rows={timeframeProgress} />
        </div>

        <div className="overflow-auto border-t border-border/60">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="bg-panel-muted/55 text-[10px] uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Exchange</th>
                <th className="px-3 py-2">Frame</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Candles</th>
                <th className="px-3 py-2">Coverage</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Last Synced</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-text-muted" colSpan={9}>
                    No historical sync rows yet
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr className="border-t border-border/50" key={`${item.jobId}-${item.coinId}`}>
                  <td className="px-3 py-2 font-semibold text-text">{item.symbol}</td>
                  <td className="px-3 py-2 text-text-muted">{item.exchange}</td>
                  <td className="px-3 py-2 text-text-muted">{item.rangeKey}</td>
                  <td className="px-3 py-2"><StatusBadge label={item.status} tone={itemStatusTone(item.status)} /></td>
                  <td className="px-3 py-2 text-text-muted">{item.candleCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-text-muted">{formatCoverage(item.earliestCandle, item.latestCandle)}</td>
                  <td className="px-3 py-2 text-text-muted">{item.attempts}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDateTime(item.completedAt ?? item.updatedAt)}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-text-muted" title={item.lastError ?? ""}>{item.lastError ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ProgressGroup({ rows, title }: { rows: ProgressGroupRow[]; title: string }) {
  return (
    <div className="rounded-panel border border-border/60 bg-panel-muted/35 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</p>
      <div className="grid gap-2">
        {rows.length === 0 && <p className="text-xs text-text-muted">No rows yet</p>}
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-text">{row.label}</span>
              <span className="text-text-muted">{row.completed}/{row.total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
              <div className="h-full bg-accent" style={{ width: `${row.total > 0 ? (row.completed / row.total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProgressGroupRow {
  label: string;
  completed: number;
  total: number;
}

function groupItemsByExchange(items: HistorySyncSnapshot["items"]): ProgressGroupRow[] {
  return groupItems(items, (item) => item.exchange);
}

function groupItemsByRange(items: HistorySyncSnapshot["items"]): ProgressGroupRow[] {
  return groupItems(items, (item) => item.rangeKey);
}

function groupItems(items: HistorySyncSnapshot["items"], getLabel: (item: HistorySyncSnapshot["items"][number]) => string) {
  const rows = new Map<string, ProgressGroupRow>();

  //roll up progress
  for (const item of items) {
    const label = getLabel(item);
    const row = rows.get(label) ?? { label, completed: 0, total: 0 };
    row.total += 1;

    if (item.status === "complete" || item.status === "skipped") {
      row.completed += 1;
    }

    rows.set(label, row);
  }

  return [...rows.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function getSyncMessage(snapshot: HistorySyncSnapshot) {
  const job = snapshot.job;

  if (!job) return "Historical sync is ready.";
  if (job.status === "running") return `Syncing historical candles: ${job.completedItems}/${job.totalItems}`;
  if (job.status === "paused") return "History sync paused after the current item.";
  if (job.status === "complete") return "History sync complete.";
  if (job.status === "error") return job.lastError ?? "History sync finished with errors.";
  return "History sync queued.";
}

function formatCoverage(earliest: number | null, latest: number | null) {
  if (!earliest || !latest) return "--";
  return `${formatDateTime(earliest)} - ${formatDateTime(latest)}`;
}

function jobStatusTone(status?: HistorySyncJobStatus) {
  if (status === "complete") return "positive";
  if (status === "error") return "negative";
  if (status === "paused") return "warning";
  return "neutral";
}

function itemStatusTone(status: HistorySyncItemStatus) {
  if (status === "complete" || status === "skipped") return "positive";
  if (status === "error") return "negative";
  if (status === "running") return "warning";
  return "neutral";
}
