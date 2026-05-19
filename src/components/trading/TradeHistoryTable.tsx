import { useNavigate } from "react-router-dom";
import { IconEye, IconEyeOff, IconSettings } from "@tabler/icons-react";
import { CryptoIcon } from "../markets/CryptoIcon";
import { EmptyState } from "../ui/EmptyState";
import type { PaperOrder } from "../../data/paper/types";
import { formatCurrency, formatDateTime, formatPercent } from "../../lib/format";
import { classNames } from "../../lib/classNames";
import { getQuoteAssetFromPair } from "../../lib/marketPair";

interface TradeHistoryTableProps {
  orders: PaperOrder[];
  currency: string;
  latestPrices?: Record<string, number>;
  selectedOrderId?: string | null;
  onSelectAsset?: (assetId: string) => void;
  onSelectOrder?: (orderId: string) => void;
  onEditOrder?: (order: PaperOrder) => void;
  onToggleOrderVisibility?: (orderId: string) => void;
  onCancelOrder?: (orderId: string) => void;
  onCloseOrder?: (orderId: string, currentPrice: number) => void;
}

export function TradeHistoryTable({
  orders,
  currency,
  latestPrices = {},
  selectedOrderId,
  onSelectAsset,
  onSelectOrder,
  onEditOrder,
  onToggleOrderVisibility,
  onCancelOrder,
  onCloseOrder,
}: TradeHistoryTableProps) {
  const navigate = useNavigate();
  const sortedOrders = [...orders]
    .sort((leftOrder, rightOrder) => new Date(rightOrder.updatedAt).getTime() - new Date(leftOrder.updatedAt).getTime());

  if (sortedOrders.length === 0) {
    return <EmptyState title="No trades" description="" />;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 text-[10px] uppercase tracking-[0.08em] text-text-muted">
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="w-10 px-3 py-2 font-semibold" aria-label="Side marker" />
            <th className="px-3 py-2 font-semibold">Asset</th>
            <th className="px-3 py-2 font-semibold">Exchange</th>
            <th className="px-3 py-2 text-right font-semibold">Price</th>
            <th className="px-3 py-2 text-right font-semibold">Profit %</th>
            <th className="px-3 py-2 text-right font-semibold">Profit $</th>
            <th className="px-3 py-2 text-right font-semibold">Executed</th>
            <th className="px-3 py-2 text-right font-semibold" aria-label="Visibility" />
            <th className="px-3 py-2 text-right font-semibold" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedOrders.map((order) => {
            const currentPrice = latestPrices[order.assetId];
            const liveProfit = calculateDisplayProfit(order, currentPrice);
            const profitTone = liveProfit.amount > 0 ? "text-positive" : liveProfit.amount < 0 ? "text-negative" : "text-text-muted";
            const quoteAsset = getQuoteAssetFromPair(order.pair, currency);

            return (
              <tr
                key={order.id}
                className={classNames(
                  "border-b border-border/55 transition hover:bg-panel-muted",
                  selectedOrderId === order.id && "bg-accent/10",
                )}
                onClick={() => onSelectOrder?.(order.id)}
                onDoubleClick={() => onEditOrder?.(order)}
              >
                <td className="px-3 py-2 font-semibold text-text">{orderTypeLabel(order)}</td>
                <td className="px-3 py-2">
                  <span
                    className={classNames(
                      "block h-2.5 w-2.5 rounded-full",
                      order.side === "buy" || order.side === "long" ? "bg-positive" : "bg-negative",
                    )}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    className="flex items-center gap-3 text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAsset?.(order.assetId);
                      navigate(`/terminal?coin=${encodeURIComponent(order.assetId)}`);
                    }}
                    type="button"
                  >
                    <CryptoIcon symbol={order.symbol} />
                    <span className="font-semibold text-text">{order.pair}</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-xs font-semibold text-text-muted">{order.exchange}</td>
                <td className="px-3 py-2 text-right font-medium text-text">
                  {formatCurrency(order.executionPrice ?? order.limitPrice ?? null, quoteAsset)}
                </td>
                <td className={classNames("px-3 py-2 text-right font-semibold", profitTone)}>
                  {formatPercent(liveProfit.percent)}
                </td>
                <td className={classNames("px-3 py-2 text-right font-semibold", profitTone)}>
                  {formatCurrency(liveProfit.amount, quoteAsset)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-text-muted">{formatDateTime(executedAt(order))}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    {renderVisibility(order, onToggleOrderVisibility)}
                    {renderEdit(order, onEditOrder)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{renderAction(order, currentPrice, onCancelOrder, onCloseOrder)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderEdit(order: PaperOrder, onEditOrder?: (order: PaperOrder) => void) {
  if (order.status !== "open" && order.status !== "filled") {
    return null;
  }

  return (
    <button
      aria-label="Edit order"
      className="inline-grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-panel"
      onClick={(event) => {
        event.stopPropagation();
        onEditOrder?.(order);
      }}
      type="button"
    >
      <IconSettings size={15} />
    </button>
  );
}

function orderTypeLabel(order: PaperOrder) {
  if (order.kind === "perp") return "Perp";
  if (order.kind === "spot-limit") return "Limit";
  return "Market";
}

function executedAt(order: PaperOrder) {
  if (order.status === "open") {
    return null;
  }

  return order.closedAt ?? order.updatedAt;
}

function calculateDisplayProfit(order: PaperOrder, currentPrice?: number) {
  if (order.status === "filled" && currentPrice && order.executionPrice) {
    if (order.kind === "perp") {
      const amount =
        order.side === "short"
          ? (order.executionPrice - currentPrice) * order.quantity
          : (currentPrice - order.executionPrice) * order.quantity;
      return {
        amount,
        percent: order.margin && order.margin > 0 ? (amount / order.margin) * 100 : 0,
      };
    }

    if (order.side === "buy") {
      const amount = (currentPrice - order.executionPrice) * order.quantity;
      const costBasis = order.executionPrice * order.quantity;
      return {
        amount,
        percent: costBasis > 0 ? (amount / costBasis) * 100 : 0,
      };
    }
  }

  return {
    amount: order.profitAmount ?? 0,
    percent: order.profitPercent ?? 0,
  };
}

function renderVisibility(order: PaperOrder, onToggleOrderVisibility?: (orderId: string) => void) {
  if (order.status !== "open" && order.status !== "filled") {
    return null;
  }

  return (
    <button
      aria-label={order.hiddenOnChart ? "Show order on chart" : "Hide order on chart"}
      className="inline-grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-panel"
      onClick={(event) => {
        event.stopPropagation();
        onToggleOrderVisibility?.(order.id);
      }}
      type="button"
    >
      {order.hiddenOnChart ? <IconEyeOff size={16} /> : <IconEye size={16} />}
    </button>
  );
}

function renderAction(
  order: PaperOrder,
  currentPrice: number | undefined,
  onCancelOrder?: (orderId: string) => void,
  onCloseOrder?: (orderId: string, currentPrice: number) => void,
) {
  if (order.status === "open") {
    return (
      <button
        className="rounded border border-border/70 px-2 py-1 text-xs font-semibold text-text-muted hover:border-negative/50 hover:text-negative"
        onClick={(event) => {
          event.stopPropagation();
          onCancelOrder?.(order.id);
        }}
        type="button"
      >
        Cancel
      </button>
    );
  }

  if (order.status === "filled") {
    const closePrice = currentPrice ?? order.executionPrice;

    return (
      <button
        className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        disabled={!closePrice}
        onClick={(event) => {
          event.stopPropagation();
          closePrice && onCloseOrder?.(order.id, closePrice);
        }}
        type="button"
      >
        {order.kind === "perp" ? "Close" : "Sell"}
      </button>
    );
  }

  if (order.status === "closed") {
    return <span className="text-xs font-semibold text-text-muted">sold</span>;
  }

  if (order.status === "cancelled") {
    return <span className="text-xs font-semibold text-text-muted">canceled</span>;
  }

  return <span className="text-xs font-semibold text-text-muted">{order.status}</span>;
}
