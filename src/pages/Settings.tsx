import { useEffect, useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { appThemes, type ThemeName } from "../theme/themes";
import { useTheme } from "../theme/ThemeProvider";
import { useMarketDataSettings, useProviderStatus, useSaveMarketDataSettings } from "../data/queries";
import {
  dateTimeFormatOptions,
  getBrowserTimeZone,
  sanitizeMarketDataSettings,
  type MarketDataSettings,
} from "../settings/marketDataSettings";

export function Settings() {
  const { themeName, setThemeName } = useTheme();
  const settingsQuery = useMarketDataSettings();
  const saveSettings = useSaveMarketDataSettings();
  const providerStatus = useProviderStatus(settingsQuery.data);
  const [draftSettings, setDraftSettings] = useState<MarketDataSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setDraftSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const canSave = Boolean(draftSettings) && !saveSettings.isPending;
  const timeZoneOptions = getTimeZoneOptions(draftSettings?.timeZone);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        action={
          <StatusBadge
            label={providerStatus.data?.ok ? "API Connected" : "API Needs Attention"}
            tone={providerStatus.data?.ok ? "positive" : "warning"}
          />
        }
      />

      <Panel title="Appearance" eyebrow="Theme">
        <div className="flex flex-wrap gap-2 p-4">
          {appThemes.map((theme) => (
            <button
              key={theme.name}
              className={
                themeName === theme.name
                  ? "rounded-panel bg-accent px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-panel border border-border bg-panel-muted px-3 py-2 text-sm font-semibold text-text"
              }
              onClick={() => setThemeName(theme.name as ThemeName)}
              type="button"
            >
              {theme.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Date & Time" eyebrow="Localization">
        {draftSettings && (
          <form
            className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettings.mutate(sanitizeMarketDataSettings(draftSettings));
            }}
          >
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-text-muted">Time Zone</span>
              <select
                className="w-full rounded-panel border border-border bg-panel-muted px-3 py-2 text-sm text-text outline-none focus:border-accent"
                value={draftSettings.timeZone}
                onChange={(event) => setDraftSettings({ ...draftSettings, timeZone: event.currentTarget.value })}
              >
                {timeZoneOptions.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>
                    {timeZone}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-text-muted">Date & Time Format</span>
              <select
                className="w-full rounded-panel border border-border bg-panel-muted px-3 py-2 text-sm text-text outline-none focus:border-accent"
                value={draftSettings.dateTimeFormat}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    dateTimeFormat: event.currentTarget.value as MarketDataSettings["dateTimeFormat"],
                  })
                }
              >
                {dateTimeFormatOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                className="w-full rounded-panel bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!canSave}
                type="submit"
              >
                {saveSettings.isPending ? "Saving..." : "Save Time Settings"}
              </button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

function getTimeZoneOptions(currentTimeZone: string | undefined) {
  const browserTimeZone = getBrowserTimeZone();
  const intlWithSupportedValues = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const supportedTimeZones =
    typeof intlWithSupportedValues.supportedValuesOf === "function"
      ? intlWithSupportedValues.supportedValuesOf("timeZone")
      : [
          "UTC",
          "America/New_York",
          "America/Chicago",
          "America/Denver",
          "America/Los_Angeles",
          "Europe/London",
          "Europe/Berlin",
          "Asia/Tokyo",
        ];

  return [...new Set([currentTimeZone, browserTimeZone, ...supportedTimeZones].filter(Boolean) as string[])];
}
