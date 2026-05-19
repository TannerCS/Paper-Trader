import { useState } from "react";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { useCoinSearch, useMarketDataSettings } from "../data/queries";
import { CryptoIcon } from "../components/markets/CryptoIcon";
import { formatMarketPair } from "../lib/marketPair";

export function Watchlists() {
  const settingsQuery = useMarketDataSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useCoinSearch(settingsQuery.data, searchQuery);

  return (
    <div className="space-y-6">
      <PageHeader title="Watchlists" />
      <Panel title="Coin Search" eyebrow={settingsQuery.data?.provider ?? "Exchange"}>
        <div className="space-y-4 p-4">
          <input
            className="w-full rounded-panel border border-border bg-panel-muted px-3 py-2 text-sm text-text outline-none focus:border-accent"
            placeholder="Search by coin name or symbol"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
          {searchQuery.trim().length < 2 && <EmptyState title="Start searching" description="Type at least two characters." />}
          {searchResults.isLoading && <EmptyState title="Searching" description="Looking up matching assets." />}
          {searchResults.error && <EmptyState title="Search unavailable" description={searchResults.error.message} />}
          {searchResults.data && searchResults.data.length > 0 && (
            <div className="grid gap-2">
              {searchResults.data.slice(0, 12).map((coin) => (
                <div key={coin.id} className="flex items-center gap-3 rounded-panel border border-border bg-panel-muted px-3 py-2">
                  {coin.thumb ? <img className="h-7 w-7 rounded-full" src={coin.thumb} alt="" /> : <CryptoIcon symbol={coin.symbol} className="h-7 w-7" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {formatMarketPair(coin, settingsQuery.data?.baseCurrency ?? "usd")}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-text-muted">{coin.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
