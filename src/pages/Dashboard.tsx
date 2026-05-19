import { useNavigate } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { MarketTable } from "../components/markets/MarketTable";
import { useCoinMarkets, useMarketDataSettings } from "../data/queries";
import { formatCompactNumber, formatCurrency, formatPercent } from "../lib/format";
import { formatMarketPair, getQuoteAssetFromPair } from "../lib/marketPair";

export function Dashboard() {
  const navigate = useNavigate();
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const currency = settingsQuery.data?.baseCurrency ?? "usd";
  const markets = marketsQuery.data ?? [];
  const leadingAsset = markets[0];
  const positiveMovers = markets.filter((coin) => (coin.priceChangePercentage24h ?? 0) > 0).length;
  const totalVolume = markets.reduce((sum, coin) => sum + (coin.totalVolume ?? 0), 0);
  const leadingAssetPair = leadingAsset ? formatMarketPair(leadingAsset, currency) : null;
  const leadingAssetQuote = leadingAssetPair ? getQuoteAssetFromPair(leadingAssetPair, currency) : currency;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tracked Assets" value={String(markets.length)} />
        <MetricCard label="24h Positive Breadth" value={`${positiveMovers}/${markets.length || "--"}`} />
        <MetricCard label="Visible Volume" value={formatCompactNumber(totalVolume)} />
        <MetricCard
          label="Market Leader"
          value={leadingAsset ? formatCurrency(leadingAsset.currentPrice, leadingAssetQuote) : "--"}
          trend={leadingAsset ? `${leadingAssetPair} ${formatPercent(leadingAsset.priceChangePercentage24h)}` : undefined}
          tone={(leadingAsset?.priceChangePercentage24h ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>

      <Panel title="Live Market Overview" eyebrow="Exchanges">
        {marketsQuery.isLoading && <EmptyState title="Loading markets" description="" />}
        {marketsQuery.error && <EmptyState title="Market data unavailable" description={marketsQuery.error.message} />}
        {!marketsQuery.isLoading && !marketsQuery.error && (
          <MarketTable
            coins={markets}
            currency={currency}
            onSelectCoin={(coinId) => navigate(`/terminal?coin=${encodeURIComponent(coinId)}`)}
          />
        )}
      </Panel>
    </div>
  );
}
