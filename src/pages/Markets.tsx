import { EmptyState } from "../components/ui/EmptyState";
import { MarketTable } from "../components/markets/MarketTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { useCoinMarkets, useMarketDataSettings } from "../data/queries";

export function Markets() {
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const currency = settingsQuery.data?.baseCurrency ?? "usd";

  return (
    <div className="space-y-6">
      <PageHeader title="Market Explorer" />
      <Panel title="Top Assets" eyebrow="Live">
        {marketsQuery.isLoading && <EmptyState title="Loading markets" description="" />}
        {marketsQuery.error && <EmptyState title="Market data unavailable" description={marketsQuery.error.message} />}
        {!marketsQuery.isLoading && !marketsQuery.error && (
          <MarketTable coins={marketsQuery.data ?? []} currency={currency} />
        )}
      </Panel>
    </div>
  );
}
