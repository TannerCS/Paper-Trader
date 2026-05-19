import { useEffect, useRef, useState } from "react";
import { IconQuestionMark, IconX } from "@tabler/icons-react";
import { usePaperLedger, usePlacePaperOrder } from "../../data/paper/queries";
import type { PaperOrderKind, PerpSide, SpotOrderSide } from "../../data/paper/types";
import type { CoinMarket } from "../../types/marketData";
import { classNames } from "../../lib/classNames";
import { formatCompactNumber, formatCurrency } from "../../lib/format";
import type { OrderTicketDraft, RiskLimitDraft } from "./orderDraft";

interface OrderTicketProps {
  selectedCoin?: CoinMarket;
  currency: string;
  marketPair: string;
  activeKind: PaperOrderKind;
  onActiveKindChange: (kind: PaperOrderKind) => void;
  riskDraft: RiskLimitDraft;
  onRiskDraftChange: (draft: RiskLimitDraft) => void;
  onDraftChange: (draft: OrderTicketDraft) => void;
  onOrderPlaced?: (orderId?: string) => void;
}

interface TicketTab {
  kind: PaperOrderKind;
  label: string;
  description: string;
}

const ticketTabs: TicketTab[] = [
  {
    kind: "spot-market",
    label: "Market",
    description: "Executes immediately at the current real-world market price.",
  },
  {
    kind: "spot-limit",
    label: "Limit",
    description: "Waits until the asset reaches your chosen price, then executes.",
  },
  {
    kind: "perp",
    label: "Perps",
    description: "Opens a leveraged long or short paper contract that follows the asset price.",
  },
];

export function OrderTicket({
  selectedCoin,
  currency,
  marketPair,
  activeKind,
  onActiveKindChange,
  riskDraft,
  onRiskDraftChange,
  onDraftChange,
  onOrderPlaced,
}: OrderTicketProps) {
  const ledgerQuery = usePaperLedger();
  const placeOrder = usePlacePaperOrder();
  const [spotSide, setSpotSide] = useState<SpotOrderSide>("buy");
  const [perpSide, setPerpSide] = useState<PerpSide>("long");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [perpMarketPrice, setPerpMarketPrice] = useState(true);
  const [leverage, setLeverage] = useState("5");
  const [noticeOrderId, setNoticeOrderId] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);
  const activeTab = ticketTabs.find((tab) => tab.kind === activeKind) ?? ticketTabs[0];
  const currentPrice = selectedCoin?.currentPrice ?? null;
  const ledger = ledgerQuery.data;
  const heldSpot = ledger?.spotPositions.find((position) => position.assetId === selectedCoin?.id);
  const noticeOrder = ledger?.orders.find((order) => order.id === noticeOrderId) ?? null;
  const limitEntryPrice = numericOrNull(limitPrice);
  const entryPrice = activeKind === "spot-limit" || (activeKind === "perp" && !perpMarketPrice) ? limitEntryPrice : currentPrice;
  const draftSide = activeKind === "perp" ? perpSide : spotSide;
  const canSubmit = Boolean(
    selectedCoin
      && currentPrice
      && Number(quantity) > 0
      && !placeOrder.isPending
      && (activeKind !== "spot-limit" || limitEntryPrice)
      && (activeKind !== "perp" || perpMarketPrice || limitEntryPrice),
  );

  useEffect(() => {
    onDraftChange({
      ...riskDraft,
      kind: activeKind,
      side: draftSide,
      quantity: numericOrNull(quantity) ?? 0,
      entryPrice,
      limitPrice: activeKind === "spot-limit" || (activeKind === "perp" && !perpMarketPrice) ? limitEntryPrice : null,
      leverage: numericOrNull(leverage) ?? 1,
    });
  }, [activeKind, draftSide, entryPrice, leverage, limitEntryPrice, onDraftChange, perpMarketPrice, quantity, riskDraft]);

  useEffect(() => {
    if (!noticeOrderId) {
      return;
    }

    const timeout = window.setTimeout(() => setNoticeOrderId(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [noticeOrderId]);

  function submitOrder() {
    if (!selectedCoin || !currentPrice) {
      return;
    }

    setNoticeOrderId(null);
    placeOrder.mutate({
      kind: activeKind,
      exchange: selectedCoin.exchange,
      assetId: selectedCoin.id,
      symbol: selectedCoin.symbol,
      pair: marketPair,
      side: activeKind === "perp" ? perpSide : spotSide,
      quantity: Number(quantity),
      currentPrice,
      limitPrice: activeKind === "spot-limit" || (activeKind === "perp" && !perpMarketPrice) ? Number(limitPrice) : undefined,
      stopLimitPrice: riskDraft.stopLimitEnabled ? Number(riskDraft.stopLimitPrice) : undefined,
      profitLimitPrice: riskDraft.profitLimitEnabled ? Number(riskDraft.profitLimitPrice) : undefined,
      leverage: activeKind === "perp" ? Number(leverage) : undefined,
    }, {
      onSuccess: (nextLedger) => {
        setNoticeOrderId(nextLedger.orders[0]?.id ?? null);
        onOrderPlaced?.(nextLedger.orders[0]?.id);
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {ticketTabs.map((tab) => (
            <button
              key={tab.kind}
              className={classNames(
                "shrink-0 rounded px-2 py-1 text-xs font-semibold transition",
                activeKind === tab.kind ? "bg-accent text-white" : "text-text-muted hover:bg-accent-soft hover:text-text",
              )}
              onClick={() => onActiveKindChange(tab.kind)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="relative"
          onMouseEnter={() => {
            tooltipTimerRef.current = window.setTimeout(() => setTooltipVisible(true), 1000);
          }}
          onMouseLeave={() => {
            if (tooltipTimerRef.current) {
              window.clearTimeout(tooltipTimerRef.current);
            }
            setTooltipVisible(false);
          }}
        >
          <button
            aria-label="Order help"
            className="grid h-6 w-6 place-items-center rounded-full border border-border/70 bg-panel-muted text-text-muted"
            type="button"
          >
            <IconQuestionMark size={14} />
          </button>
          {tooltipVisible && (
            <div className="absolute right-0 top-8 z-30 w-72 rounded-panel border border-border/70 bg-panel p-3 text-xs text-text panel-shadow">
              <p className="font-semibold">{activeTab.label}</p>
              <p className="mt-1 text-text-muted">{activeTab.description}</p>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid gap-3 text-sm">
          {activeKind === "perp" ? (
            <SegmentedSide
              leftLabel="Long"
              leftActive={perpSide === "long"}
              rightLabel="Short"
              onLeft={() => setPerpSide("long")}
              onRight={() => setPerpSide("short")}
            />
          ) : (
            <SegmentedSide
              leftLabel="Buy"
              leftActive={spotSide === "buy"}
              rightLabel="Sell"
              onLeft={() => setSpotSide("buy")}
              onRight={() => setSpotSide("sell")}
            />
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoCell label="Pair" value={marketPair} />
            <InfoCell label="Last" value={formatCurrency(currentPrice, currency)} />
            <InfoCell label="Cash" value={formatCurrency(ledger?.account.cashBalance ?? null, currency)} />
            <InfoCell label="Held" value={heldSpot ? formatCompactNumber(heldSpot.quantity) : "--"} />
          </div>

          <NumberField label="Quantity" value={quantity} onChange={setQuantity} />

          {activeKind === "spot-limit" && <NumberField label="Limit Price" value={limitPrice} onChange={setLimitPrice} />}

          {activeKind === "perp" && (
            <div className="grid gap-2">
              <RiskCheckbox checked={perpMarketPrice} label="Market Price" onChange={setPerpMarketPrice} />
              {!perpMarketPrice && <NumberField label="Entry Price" value={limitPrice} onChange={setLimitPrice} />}
              <NumberField label="Leverage" value={leverage} onChange={setLeverage} />
            </div>
          )}

          <div className="grid grid-cols-2 items-start gap-2">
            <div className="grid gap-2">
              <RiskCheckbox
                checked={riskDraft.stopLimitEnabled}
                label="Stop Limit"
                onChange={(checked) => onRiskDraftChange({ ...riskDraft, stopLimitEnabled: checked })}
              />
              {riskDraft.stopLimitEnabled && (
                <RiskPriceField
                  ariaLabel="Stop Limit"
                  helper={potentialLabel("loss", entryPrice, numericOrNull(riskDraft.stopLimitPrice), Number(quantity), draftSide, currency)}
                  value={riskDraft.stopLimitPrice}
                  onChange={(stopLimitPrice) => onRiskDraftChange({ ...riskDraft, stopLimitPrice })}
                />
              )}
            </div>
            <div className="grid gap-2">
              <RiskCheckbox
                checked={riskDraft.profitLimitEnabled}
                label="Profit Limit"
                onChange={(checked) => onRiskDraftChange({ ...riskDraft, profitLimitEnabled: checked })}
              />
              {riskDraft.profitLimitEnabled && (
                <RiskPriceField
                  ariaLabel="Profit Limit"
                  helper={potentialLabel("profit", entryPrice, numericOrNull(riskDraft.profitLimitPrice), Number(quantity), draftSide, currency)}
                  value={riskDraft.profitLimitPrice}
                  onChange={(profitLimitPrice) => onRiskDraftChange({ ...riskDraft, profitLimitPrice })}
                />
              )}
            </div>
          </div>

          <button
            className="rounded bg-accent px-3 py-2 font-semibold text-white disabled:opacity-55"
            disabled={!canSubmit}
            onClick={submitOrder}
            type="button"
          >
            {placeOrder.isPending ? "Submitting" : submitLabel(activeKind)}
          </button>

          {placeOrder.error && (
            <div className="rounded border border-negative/30 bg-negative/10 px-2 py-1 text-xs font-semibold text-negative">
              {placeOrder.error instanceof Error ? placeOrder.error.message : "Order failed."}
            </div>
          )}

          {noticeOrder && (
            <div className="group flex items-center justify-between gap-2 rounded border border-border/70 bg-panel-muted px-2 py-1 text-xs text-text-muted">
              <span>{noticeOrder.message ?? noticeOrder.status}</span>
              <button
                aria-label="Dismiss order message"
                className="grid h-5 w-5 place-items-center rounded text-text-muted opacity-0 transition hover:bg-panel group-hover:opacity-100"
                onClick={() => setNoticeOrderId(null)}
                type="button"
              >
                <IconX size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RiskCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded border border-border/60 bg-panel-muted px-2 py-2 text-xs font-semibold text-text-muted">
      <input
        checked={checked}
        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function SegmentedSide({
  leftLabel,
  rightLabel,
  leftActive,
  onLeft,
  onRight,
}: {
  leftLabel: string;
  rightLabel: string;
  leftActive: boolean;
  onLeft: () => void;
  onRight: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded bg-panel-muted p-1">
      <button className={leftActive ? "rounded bg-positive/15 px-3 py-2 font-semibold text-positive" : "rounded px-3 py-2 text-text-muted"} onClick={onLeft} type="button">
        {leftLabel}
      </button>
      <button className={!leftActive ? "rounded bg-negative/15 px-3 py-2 font-semibold text-negative" : "rounded px-3 py-2 text-text-muted"} onClick={onRight} type="button">
        {rightLabel}
      </button>
    </div>
  );
}

function NumberField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <input
        className="w-full rounded border border-border/70 bg-panel-muted px-2 py-2 text-text outline-none focus:border-accent"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {helper && <span className="block text-[11px] font-semibold text-text-muted">{helper}</span>}
    </label>
  );
}

function RiskPriceField({
  ariaLabel,
  helper,
  value,
  onChange,
}: {
  ariaLabel: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="sr-only">{ariaLabel}</span>
      <input
        aria-label={ariaLabel}
        className="w-full rounded border border-border/70 bg-panel-muted px-2 py-2 text-text outline-none focus:border-accent"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {helper && <span className="block text-[11px] font-semibold text-text-muted">{helper}</span>}
    </label>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-panel-muted px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="truncate font-semibold text-text">{value}</p>
    </div>
  );
}

function submitLabel(kind: PaperOrderKind) {
  if (kind === "spot-market") return "Place Market Order";
  if (kind === "spot-limit") return "Place Limit Order";
  return "Open Perp Position";
}

function numericOrNull(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function potentialLabel(
  type: "loss" | "profit",
  entryPrice: number | null,
  targetPrice: number | null,
  quantity: number,
  side: SpotOrderSide | PerpSide,
  currency: string,
) {
  if (!entryPrice || !targetPrice || !Number.isFinite(quantity) || quantity <= 0) {
    return undefined;
  }

  const isShort = side === "sell" || side === "short";
  const rawAmount = isShort ? (entryPrice - targetPrice) * quantity : (targetPrice - entryPrice) * quantity;
  const costBasis = entryPrice * quantity;
  const percent = costBasis > 0 ? (rawAmount / costBasis) * 100 : 0;
  const label = type === "loss" ? "Potential Loss" : "Potential Profit";
  const signedPercent = `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;

  return `${label}: ${formatSignedCurrency(rawAmount, currency)} (${signedPercent})`;
}

function formatSignedCurrency(value: number, currency: string) {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value), currency)}`;
}
