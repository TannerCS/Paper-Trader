import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useExchangeHealth } from "../data/queries";
import type { ExchangeHealthRow, ExchangeHealthStatus } from "../data/exchangeHealth";
import { formatDateTime } from "../lib/format";

export function ProviderStatusPage() {
  const exchangeHealth = useExchangeHealth();
  const rows = exchangeHealth.data ?? [];
  //topline health counts
  const liveCount = rows.filter((row) => row.restStatus === "live").length;
  const enabledCount = rows.filter((row) => row.enabled).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Exchange Health" />

      <div className="grid gap-3 md:grid-cols-4">
        <HealthMetric label="Reachable" value={`${liveCount}/${enabledCount}`} />
        <HealthMetric label="Rate Limited" value={String(rows.filter((row) => row.restStatus === "rate_limited" || row.websocketStatus === "rate_limited").length)} />
        <HealthMetric label="Region Blocked" value={String(rows.filter((row) => row.restStatus === "region_blocked").length)} />
        <HealthMetric label="Disabled" value={String(rows.filter((row) => !row.enabled).length)} />
      </div>

      <Panel title="Venue Health + Trading Guardrails">
        <div className="border-b border-border/60 p-3 text-xs text-text-muted">
          Trading surfaces stay exchange-pure. If a selected venue is stale or blocked, Paper Trader warns or pauses that venue instead of silently substituting another exchange price.
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-panel-muted/55 text-[10px] uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Exchange</th>
                <th className="px-3 py-2">REST</th>
                <th className="px-3 py-2">WebSocket</th>
                <th className="px-3 py-2">Latency</th>
                <th className="px-3 py-2">Last Tick</th>
                <th className="px-3 py-2">Cooldown</th>
                <th className="px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ExchangeHealthTableRow key={row.provider} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ExchangeHealthTableRow({ row }: { row: ExchangeHealthRow }) {
  return (
    <tr className="border-t border-border/50">
      <td className="px-3 py-2 font-semibold text-text">{row.exchange}</td>
      <td className="px-3 py-2"><StatusBadge label={statusLabel(row.restStatus)} tone={statusTone(row.restStatus)} /></td>
      <td className="px-3 py-2"><StatusBadge label={statusLabel(row.websocketStatus)} tone={statusTone(row.websocketStatus)} /></td>
      <td className="px-3 py-2 text-text-muted">{row.latencyMilliseconds === null ? "--" : `${row.latencyMilliseconds}ms`}</td>
      <td className="px-3 py-2 text-text-muted">{formatDateTime(row.lastTickAt)}</td>
      <td className="px-3 py-2 text-text-muted">{formatDateTime(row.cooldownUntil)}</td>
      <td className="max-w-[360px] truncate px-3 py-2 text-text-muted" title={row.message}>{row.message}</td>
    </tr>
  );
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-border/70 bg-panel p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}

function statusLabel(status: ExchangeHealthStatus) {
  if (status === "rate_limited") return "rate limited";
  if (status === "region_blocked") return "region blocked";
  return status;
}

function statusTone(status: ExchangeHealthStatus) {
  if (status === "live") return "positive";
  if (status === "rate_limited" || status === "stale") return "warning";
  if (status === "disabled") return "neutral";
  return "negative";
}
