import { useEffect, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useCoinMarkets, useMarketDataSettings, useSaveMarketDataSettings } from "../../data/queries";
import { classNames } from "../../lib/classNames";
import { StartupHistorySync } from "../system/StartupHistorySync";
import { setDateTimeFormatterPreferences } from "../../lib/format";

const refreshIntervalOptions = [1, 5, 10, 30, 60];

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const saveSettings = useSaveMarketDataSettings();
  const [heartbeatPulse, setHeartbeatPulse] = useState(false);

  useEffect(() => {
    function handleHeartbeat() {
      setHeartbeatPulse(true);
      window.setTimeout(() => setHeartbeatPulse(false), 420);
    }

    window.addEventListener("paper-trader:market-heartbeat", handleHeartbeat);
    return () => window.removeEventListener("paper-trader:market-heartbeat", handleHeartbeat);
  }, []);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setDateTimeFormatterPreferences({
      timeZone: settingsQuery.data.timeZone,
      dateTimeFormat: settingsQuery.data.dateTimeFormat,
    });
  }, [settingsQuery.data?.dateTimeFormat, settingsQuery.data?.timeZone]);

  function updateMarketSettings(nextValues: { refreshEnabled?: boolean; refreshIntervalSeconds?: number }) {
    if (!settingsQuery.data) {
      return;
    }

    saveSettings.mutate({
      ...settingsQuery.data,
      ...nextValues,
    });
  }

  return (
    <div className="flex h-full w-full bg-app text-text">
      <StartupHistorySync settings={settingsQuery.data} markets={marketsQuery.data ?? []} />
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-panel/70 px-5 backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Paper Trader</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Refresh</p>
              <select
                aria-label="Refresh interval"
                className="h-7 w-24 rounded-full border border-border/70 bg-panel-muted px-2 text-xs font-semibold text-text outline-none focus:border-accent"
                value={settingsQuery.data?.refreshIntervalSeconds ?? 1}
                onChange={(event) => updateMarketSettings({ refreshIntervalSeconds: Number(event.currentTarget.value) })}
              >
                {refreshIntervalOptions.map((intervalSeconds) => (
                  <option key={intervalSeconds} value={intervalSeconds}>
                    {intervalSeconds}s
                  </option>
                ))}
              </select>
            </div>
            <button
              aria-label={settingsQuery.data?.refreshEnabled ? "Pause refresh" : "Resume refresh"}
              className={classNames(
                "grid h-7 w-7 place-items-center rounded-full border text-text-muted transition",
                settingsQuery.data?.refreshEnabled
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border/70 bg-panel-muted",
              )}
              onClick={() => updateMarketSettings({ refreshEnabled: !settingsQuery.data?.refreshEnabled })}
              type="button"
            >
              <IconRefresh size={15} />
            </button>
            <span
              aria-label="Market stream heartbeat"
              className={classNames(
                "h-2.5 w-2.5 rounded-full bg-positive transition-all duration-300",
                heartbeatPulse ? "scale-125 opacity-100 shadow-[0_0_0_4px_rgba(48,209,88,0.18)]" : "scale-100 opacity-45",
              )}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
