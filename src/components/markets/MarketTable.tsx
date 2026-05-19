import type { CoinMarket } from "../../types/marketData";
import { formatCompactNumber, formatCurrency, formatDateTime, formatPercent } from "../../lib/format";
import { classNames } from "../../lib/classNames";
import { CryptoIcon } from "./CryptoIcon";
import { formatMarketPair, getQuoteAssetFromPair } from "../../lib/marketPair";

interface MarketTableProps {
  coins: CoinMarket[];
  currency: string;
  onSelectCoin?: (coinId: string) => void;
  selectedCoinId?: string;
}

export function MarketTable({ coins, currency, onSelectCoin, selectedCoinId }: MarketTableProps) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 text-[10px] uppercase tracking-[0.08em] text-text-muted">
            <th className="px-3 py-2 font-semibold">Asset</th>
            <th className="px-3 py-2 font-semibold">Exchange</th>
            <th className="px-3 py-2 text-right font-semibold">Price</th>
            <th className="px-3 py-2 text-right font-semibold">24h</th>
            <th className="px-3 py-2 text-right font-semibold">Market Cap</th>
            <th className="px-3 py-2 text-right font-semibold">Volume</th>
            <th className="px-3 py-2 text-right font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => (
            (() => {
              const pair = formatMarketPair(coin, currency);
              const quoteAsset = getQuoteAssetFromPair(pair, currency);

              return (
            <tr
              key={coin.id}
              className={classNames(
                "border-b border-border/55 transition hover:bg-panel-muted",
                onSelectCoin && "cursor-pointer",
                selectedCoinId === coin.id && "bg-accent/10",
              )}
              onClick={() => onSelectCoin?.(coin.id)}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  {coin.image ? <img className="h-6 w-6 rounded-full" src={coin.image} alt="" /> : <CryptoIcon symbol={coin.symbol} />}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text">{pair}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-xs font-semibold text-text-muted">{coin.exchange ?? "Exchange"}</td>
              <td className="px-3 py-2 text-right font-medium text-text">
                {formatCurrency(coin.currentPrice, quoteAsset)}
              </td>
              <td
                className={classNames(
                  "px-3 py-2 text-right font-semibold",
                  (coin.priceChangePercentage24h ?? 0) >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {formatPercent(coin.priceChangePercentage24h)}
              </td>
              <td className="px-3 py-2 text-right text-text-muted">{formatCompactNumber(coin.marketCap)}</td>
              <td className="px-3 py-2 text-right text-text-muted">{formatCompactNumber(coin.totalVolume)}</td>
              <td className="px-3 py-2 text-right text-xs text-text-muted">{formatDateTime(coin.lastUpdated)}</td>
            </tr>
              );
            })()
          ))}
        </tbody>
      </table>
    </div>
  );
}
