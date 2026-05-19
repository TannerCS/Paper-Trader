import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconTrash,
} from "@tabler/icons-react";
import { KLineChartPanel, type ChartOrderLine } from "../components/charts/KLineChartPanel";
import { defaultRiskLimitDraft, type RiskLimitDraft } from "../components/trading/orderDraft";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { terminalRangePresets } from "../data/chartRanges";
import { defaultTerminalPreferences } from "../data/preferences/terminalPreferences";
import {
  advanceReplaySession,
  calculateReplayStats,
  cancelReplayOrder,
  closeReplayOrder,
  createReplaySession,
  placeReplayOrder,
  setReplaySpeed,
  setReplayStatus,
  toggleReplayOrderVisibility,
} from "../data/replay/replayEngine";
import { useDeleteReplaySession, useReplaySessions, useSaveReplaySession } from "../data/replay/queries";
import type { PlaceReplayOrderInput, ReplaySession } from "../data/replay/types";
import { useCoinMarkets, useCoinOhlc, useMarketDataSettings } from "../data/queries";
import { classNames } from "../lib/classNames";
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "../lib/format";
import { formatMarketPair, getQuoteAssetFromPair } from "../lib/marketPair";
import type { PaperOrder, PaperOrderKind, PerpSide, SpotOrderSide } from "../data/paper/types";
import type { CoinMarket, TerminalRangePreset } from "../types/marketData";

const replaySpeeds = [1, 5, 10, 25, 100];

export function StrategyReplay() {
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const markets = marketsQuery.data ?? [];
  const sessionsQuery = useReplaySessions();
  const saveReplaySession = useSaveReplaySession();
  const deleteReplaySession = useDeleteReplaySession();
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [rangePreset, setRangePreset] = useState<TerminalRangePreset>("5m");
  const [fromDate, setFromDate] = useState(() => toDateTimeInput(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [toDate, setToDate] = useState(() => toDateTimeInput(Date.now()));
  const [startingCash, setStartingCash] = useState("100000");
  const [activeSession, setActiveSession] = useState<ReplaySession | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? markets[0],
    [markets, selectedMarketId],
  );
  const chartRange = useMemo(
    () => ({
      from: new Date(fromDate).getTime(),
      to: new Date(toDate).getTime(),
    }),
    [fromDate, toDate],
  );
  const candlesQuery = useCoinOhlc(settingsQuery.data, selectedMarket?.id ?? "", chartRange);
  const candles = candlesQuery.data ?? [];
  const currentIndex = Math.min(activeSession?.currentIndex ?? 0, Math.max(0, candles.length - 1));
  const currentCandle = candles[currentIndex];
  const visibleCandles = activeSession ? candles.slice(0, currentIndex + 1) : candles;
  const marketPair = selectedMarket ? formatMarketPair(selectedMarket, settingsQuery.data?.baseCurrency ?? "usd") : "--";
  const quoteAsset = getQuoteAssetFromPair(activeSession?.pair ?? marketPair, settingsQuery.data?.baseCurrency ?? "usd");
  const replayStats = activeSession ? calculateReplayStats(activeSession) : null;
  const latestPrices = activeSession && currentCandle ? { [activeSession.assetId]: currentCandle.close } : {};
  const chartOrderLines = activeSession ? buildReplayOrderLines(activeSession, quoteAsset) : [];

  useEffect(() => {
    if (!selectedMarketId && markets[0]) {
      setSelectedMarketId(markets[0].id);
    }
  }, [markets, selectedMarketId]);

  useEffect(() => {
    if (!activeSession && sessionsQuery.data?.[0]) {
      loadSession(sessionsQuery.data[0]);
    }
  }, [activeSession, sessionsQuery.data]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== "running" || candles.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveSession((currentSession) => {
        if (!currentSession || currentSession.status !== "running") {
          return currentSession;
        }
        const nextSession = advanceReplaySession(currentSession, candles);
        scheduleSave(nextSession);
        return nextSession;
      });
    }, getReplayDelay(activeSession.playbackSpeed));

    return () => window.clearInterval(interval);
  }, [activeSession?.playbackSpeed, activeSession?.status, candles]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  function scheduleSave(session: ReplaySession, immediate = false) {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (immediate) {
      saveReplaySession.mutate(session);
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveReplaySession.mutate(session);
    }, 650);
  }

  function commitSession(session: ReplaySession, immediate = false) {
    setActiveSession(session);
    scheduleSave(session, immediate);
  }

  function loadSession(session: ReplaySession) {
    setActiveSession(session);
    setSelectedMarketId(session.assetId);
    setRangePreset(session.rangePreset);
    setFromDate(toDateTimeInput(session.from));
    setToDate(toDateTimeInput(session.to));
    setStartingCash(String(session.startingCash));
  }

  function startSession() {
    if (!selectedMarket || candles.length < 2) {
      return;
    }

    const nextSession = createReplaySession(
      {
        assetId: selectedMarket.id,
        symbol: selectedMarket.symbol,
        pair: marketPair,
        exchange: selectedMarket.exchange ?? "Unknown",
        rangePreset,
        from: chartRange.from,
        to: chartRange.to,
        startingCash: Number(startingCash),
      },
      candles,
    );
    commitSession(nextSession, true);
  }

  function resetActiveSession() {
    if (!activeSession || candles.length < 2) {
      return;
    }

    const nextSession = createReplaySession(
      {
        assetId: activeSession.assetId,
        symbol: activeSession.symbol,
        pair: activeSession.pair,
        exchange: activeSession.exchange,
        rangePreset: activeSession.rangePreset,
        from: activeSession.from,
        to: activeSession.to,
        startingCash: activeSession.startingCash,
      },
      candles,
    );
    commitSession({ ...nextSession, id: activeSession.id, name: activeSession.name, createdAt: activeSession.createdAt }, true);
  }

  function updateSessionStatus(status: ReplaySession["status"]) {
    if (activeSession) {
      commitSession(setReplayStatus(activeSession, status), true);
    }
  }

  function stepForward(steps = 1) {
    if (!activeSession) {
      return;
    }

    commitSession(advanceReplaySession(setReplayStatus(activeSession, "paused"), candles, steps), true);
  }

  function placeOrder(input: PlaceReplayOrderInput) {
    if (!activeSession || !currentCandle) {
      return;
    }

    commitSession(placeReplayOrder(activeSession, input, currentCandle), true);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Strategy Replay" />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ReplaySetupPanel
            activeSessionId={activeSession?.id}
            candlesReady={candles.length >= 2}
            fromDate={fromDate}
            isLoading={marketsQuery.isLoading || candlesQuery.isLoading}
            markets={markets}
            onDeleteSession={(sessionId) => {
              deleteReplaySession.mutate(sessionId);
              if (activeSession?.id === sessionId) {
                setActiveSession(null);
              }
            }}
            onFromDateChange={setFromDate}
            onLoadSession={loadSession}
            onMarketChange={setSelectedMarketId}
            onRangePresetChange={setRangePreset}
            onStartSession={startSession}
            onStartingCashChange={setStartingCash}
            onToDateChange={setToDate}
            rangePreset={rangePreset}
            selectedMarketId={selectedMarket?.id ?? ""}
            sessions={sessionsQuery.data ?? []}
            startingCash={startingCash}
            toDate={toDate}
          />

          <ReplayOrderTicket
            currentPrice={currentCandle?.close ?? null}
            currency={quoteAsset}
            disabled={!activeSession || !currentCandle || activeSession.status === "completed"}
            marketPair={activeSession?.pair ?? marketPair}
            onPlaceOrder={placeOrder}
          />
        </div>

        <div className="space-y-4">
          <Panel
            title={activeSession?.pair ?? marketPair}
            action={
              <div className="text-right text-xs font-semibold text-text-muted">
                <div>{currentCandle ? formatCurrency(currentCandle.close, quoteAsset) : "--"}</div>
                <div>{currentCandle ? formatDateTime(currentCandle.timestamp) : "--"}</div>
              </div>
            }
          >
            <ReplayControls
              activeSession={activeSession}
              candleCount={candles.length}
              onFastForward={() => stepForward(10)}
              onPause={() => updateSessionStatus("paused")}
              onPlay={() => updateSessionStatus("running")}
              onReset={resetActiveSession}
              onSpeedChange={(speed) => activeSession && commitSession(setReplaySpeed(activeSession, speed), true)}
              onStepForward={() => stepForward(1)}
            />
            {candlesQuery.error && <EmptyState title="Replay candles unavailable" description={candlesQuery.error.message} />}
            {!candlesQuery.error && (
              <KLineChartPanel
                activeIndicators={defaultTerminalPreferences.activeIndicators}
                candles={visibleCandles}
                coinId={(activeSession?.pair ?? marketPair).replace("/", "")}
                error={candlesQuery.error}
                height={560}
                isLoading={candlesQuery.isLoading}
                orderLines={chartOrderLines}
                range={{ preset: rangePreset }}
              />
            )}
          </Panel>

          {replayStats && (
            <ReplayStatsPanel
              currency={quoteAsset}
              stats={replayStats}
            />
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <ReplayOrdersPanel
              currency={quoteAsset}
              latestPrices={latestPrices}
              onCancel={(orderId) => activeSession && currentCandle && commitSession(cancelReplayOrder(activeSession, orderId, currentCandle), true)}
              onClose={(orderId, price) => activeSession && currentCandle && commitSession(closeReplayOrder(activeSession, orderId, price, currentCandle), true)}
              onToggleVisibility={(orderId) => activeSession && commitSession(toggleReplayOrderVisibility(activeSession, orderId), true)}
              orders={activeSession?.ledger.orders ?? []}
            />
            <ReplayEventLog events={activeSession?.events ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReplaySetupPanelProps {
  activeSessionId?: string;
  candlesReady: boolean;
  fromDate: string;
  isLoading: boolean;
  markets: CoinMarket[];
  rangePreset: TerminalRangePreset;
  selectedMarketId: string;
  sessions: ReplaySession[];
  startingCash: string;
  toDate: string;
  onDeleteSession: (sessionId: string) => void;
  onFromDateChange: (value: string) => void;
  onLoadSession: (session: ReplaySession) => void;
  onMarketChange: (marketId: string) => void;
  onRangePresetChange: (rangePreset: TerminalRangePreset) => void;
  onStartSession: () => void;
  onStartingCashChange: (value: string) => void;
  onToDateChange: (value: string) => void;
}

function ReplaySetupPanel({
  activeSessionId,
  candlesReady,
  fromDate,
  isLoading,
  markets,
  onDeleteSession,
  onFromDateChange,
  onLoadSession,
  onMarketChange,
  onRangePresetChange,
  onStartSession,
  onStartingCashChange,
  onToDateChange,
  rangePreset,
  selectedMarketId,
  sessions,
  startingCash,
  toDate,
}: ReplaySetupPanelProps) {
  return (
    <Panel title="Session">
      <div className="grid gap-3 p-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-text-muted">Pair</span>
          <select
            className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-text outline-none focus:border-accent"
            onChange={(event) => onMarketChange(event.currentTarget.value)}
            value={selectedMarketId}
          >
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {formatMarketPair(market, "usd")} - {market.exchange}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold text-text-muted">From</span>
            <input className="w-full min-w-0 rounded border border-border/70 bg-panel-muted px-2 py-2 text-xs text-text" onChange={(event) => onFromDateChange(event.currentTarget.value)} type="datetime-local" value={fromDate} />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold text-text-muted">To</span>
            <input className="w-full min-w-0 rounded border border-border/70 bg-panel-muted px-2 py-2 text-xs text-text" onChange={(event) => onToDateChange(event.currentTarget.value)} type="datetime-local" value={toDate} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {terminalRangePresets.map((preset) => (
            <button
              key={preset}
              className={rangePreset === preset ? "rounded bg-accent px-2 py-1 text-xs font-semibold text-white" : "rounded px-2 py-1 text-xs font-semibold text-text-muted hover:bg-accent-soft"}
              onClick={() => onRangePresetChange(preset)}
              type="button"
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-text-muted">Starting Cash</span>
          <input className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-text" inputMode="decimal" onChange={(event) => onStartingCashChange(event.currentTarget.value)} value={startingCash} />
        </label>
        <button
          className="rounded bg-accent px-3 py-2 font-semibold text-white disabled:opacity-50"
          disabled={isLoading || !candlesReady}
          onClick={onStartSession}
          type="button"
        >
          Start Replay
        </button>
      </div>
      <div className="border-t border-border/70">
        <div className="max-h-64 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-3 py-4 text-xs font-semibold text-text-muted">No saved sessions</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={classNames(
                  "flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-xs",
                  activeSessionId === session.id && "bg-accent/10",
                )}
              >
                <button className="min-w-0 flex-1 text-left" onClick={() => onLoadSession(session)} type="button">
                  <span className="block truncate font-semibold text-text">{session.name}</span>
                  <span className="text-text-muted">{session.status} - {formatDateTime(session.updatedAt)}</span>
                </button>
                <button className="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-panel-muted hover:text-negative" onClick={() => onDeleteSession(session.id)} type="button">
                  <IconTrash size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function ReplayControls({
  activeSession,
  candleCount,
  onFastForward,
  onPause,
  onPlay,
  onReset,
  onSpeedChange,
  onStepForward,
}: {
  activeSession: ReplaySession | null;
  candleCount: number;
  onFastForward: () => void;
  onPause: () => void;
  onPlay: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
}) {
  const canRun = Boolean(activeSession && candleCount > 1 && activeSession.status !== "completed");
  const progress = activeSession && candleCount > 1 ? ((activeSession.currentIndex + 1) / candleCount) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-panel-muted/40 px-3 py-2">
      <button className="grid h-8 w-8 place-items-center rounded text-text-muted hover:bg-panel" disabled={!activeSession} onClick={onReset} type="button">
        <IconPlayerTrackPrev size={16} />
      </button>
      {activeSession?.status === "running" ? (
        <button className="grid h-8 w-8 place-items-center rounded bg-accent text-white" onClick={onPause} type="button">
          <IconPlayerPause size={16} />
        </button>
      ) : (
        <button className="grid h-8 w-8 place-items-center rounded bg-accent text-white disabled:opacity-50" disabled={!canRun} onClick={onPlay} type="button">
          <IconPlayerPlay size={16} />
        </button>
      )}
      <button className="grid h-8 w-8 place-items-center rounded text-text-muted hover:bg-panel disabled:opacity-50" disabled={!canRun} onClick={onStepForward} type="button">
        <IconPlayerTrackNext size={16} />
      </button>
      <button className="grid h-8 w-8 place-items-center rounded text-text-muted hover:bg-panel disabled:opacity-50" disabled={!canRun} onClick={onFastForward} type="button">
        <IconPlayerSkipForward size={16} />
      </button>
      <select
        className="rounded border border-border/70 bg-panel px-2 py-1.5 text-xs font-semibold text-text"
        disabled={!activeSession}
        onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
        value={activeSession?.playbackSpeed ?? 1}
      >
        {replaySpeeds.map((speed) => (
          <option key={speed} value={speed}>{speed}x</option>
        ))}
      </select>
      <div className="h-1.5 min-w-[180px] flex-1 overflow-hidden rounded-full bg-border/60">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
      <span className="text-xs font-semibold text-text-muted">
        {activeSession ? `${Math.min(activeSession.currentIndex + 1, candleCount)} / ${candleCount}` : "No session"}
      </span>
    </div>
  );
}

function ReplayOrderTicket({
  currentPrice,
  currency,
  disabled,
  marketPair,
  onPlaceOrder,
}: {
  currentPrice: number | null;
  currency: string;
  disabled: boolean;
  marketPair: string;
  onPlaceOrder: (input: PlaceReplayOrderInput) => void;
}) {
  const [kind, setKind] = useState<PaperOrderKind>("spot-market");
  const [spotSide, setSpotSide] = useState<SpotOrderSide>("buy");
  const [perpSide, setPerpSide] = useState<PerpSide>("long");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [perpMarket, setPerpMarket] = useState(true);
  const [riskDraft, setRiskDraft] = useState<RiskLimitDraft>(defaultRiskLimitDraft);
  const entryPrice = kind === "spot-limit" || (kind === "perp" && !perpMarket) ? Number(limitPrice) : currentPrice;
  const canSubmit = !disabled && currentPrice && Number(quantity) > 0 && (kind !== "spot-limit" || Number(limitPrice) > 0) && (kind !== "perp" || perpMarket || Number(limitPrice) > 0);

  return (
    <Panel title="Order Ticket">
      <div className="grid gap-3 p-3 text-sm">
        <div className="grid grid-cols-3 gap-1 rounded bg-panel-muted p-1">
          {[
            ["spot-market", "Market"],
            ["spot-limit", "Limit"],
            ["perp", "Perps"],
          ].map(([tabKind, label]) => (
            <button key={tabKind} className={kind === tabKind ? "rounded bg-accent px-2 py-1.5 text-xs font-semibold text-white" : "rounded px-2 py-1.5 text-xs font-semibold text-text-muted"} onClick={() => setKind(tabKind as PaperOrderKind)} type="button">
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoCell label="Pair" value={marketPair} />
          <InfoCell label="Replay Last" value={formatCurrency(currentPrice, currency)} />
        </div>
        {kind === "perp" ? (
          <SegmentedSide leftActive={perpSide === "long"} leftLabel="Long" onLeft={() => setPerpSide("long")} onRight={() => setPerpSide("short")} rightLabel="Short" />
        ) : (
          <SegmentedSide leftActive={spotSide === "buy"} leftLabel="Buy" onLeft={() => setSpotSide("buy")} onRight={() => setSpotSide("sell")} rightLabel="Sell" />
        )}
        <NumberField label="Quantity" onChange={setQuantity} value={quantity} />
        {kind === "spot-limit" && <NumberField label="Limit Price" onChange={setLimitPrice} value={limitPrice} />}
        {kind === "perp" && (
          <>
            <RiskCheckbox checked={perpMarket} label="Market Price" onChange={setPerpMarket} />
            {!perpMarket && <NumberField label="Entry Price" onChange={setLimitPrice} value={limitPrice} />}
            <NumberField label="Leverage" onChange={setLeverage} value={leverage} />
          </>
        )}
        <div className="grid grid-cols-2 items-start gap-2">
          <RiskBlock
            checked={riskDraft.stopLimitEnabled}
            helper={potentialLabel("loss", entryPrice, Number(riskDraft.stopLimitPrice), Number(quantity), kind === "perp" ? perpSide : spotSide, currency)}
            label="Stop Limit"
            onCheckedChange={(checked) => setRiskDraft((draft) => ({ ...draft, stopLimitEnabled: checked }))}
            onValueChange={(stopLimitPrice) => setRiskDraft((draft) => ({ ...draft, stopLimitPrice }))}
            value={riskDraft.stopLimitPrice}
          />
          <RiskBlock
            checked={riskDraft.profitLimitEnabled}
            helper={potentialLabel("profit", entryPrice, Number(riskDraft.profitLimitPrice), Number(quantity), kind === "perp" ? perpSide : spotSide, currency)}
            label="Profit Limit"
            onCheckedChange={(checked) => setRiskDraft((draft) => ({ ...draft, profitLimitEnabled: checked }))}
            onValueChange={(profitLimitPrice) => setRiskDraft((draft) => ({ ...draft, profitLimitPrice }))}
            value={riskDraft.profitLimitPrice}
          />
        </div>
        <button
          className="rounded bg-accent px-3 py-2 font-semibold text-white disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => {
            onPlaceOrder({
              kind,
              side: kind === "perp" ? perpSide : spotSide,
              quantity: Number(quantity),
              currentPrice: currentPrice ?? 0,
              limitPrice: kind === "spot-limit" || (kind === "perp" && !perpMarket) ? Number(limitPrice) : undefined,
              stopLimitPrice: riskDraft.stopLimitEnabled ? Number(riskDraft.stopLimitPrice) : undefined,
              profitLimitPrice: riskDraft.profitLimitEnabled ? Number(riskDraft.profitLimitPrice) : undefined,
              leverage: kind === "perp" ? Number(leverage) : undefined,
            });
            setQuantity("");
          }}
          type="button"
        >
          Place Replay Order
        </button>
      </div>
    </Panel>
  );
}

function ReplayStatsPanel({ currency, stats }: { currency: string; stats: NonNullable<ReturnType<typeof calculateReplayStats>> }) {
  const statRows = [
    ["Net P/L", formatCurrency(stats.netPnl, currency), stats.netPnl],
    ["Return", formatPercent(stats.returnPercent), stats.returnPercent],
    ["Win Rate", formatPercent(stats.winRate), stats.winRate],
    ["Trades", formatNumber(stats.totalTrades), stats.totalTrades],
    ["Profit Factor", Number.isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor) : "Infinity", stats.profitFactor],
    ["Max Drawdown", formatPercent(-stats.maxDrawdown), -stats.maxDrawdown],
    ["Best", formatCurrency(stats.bestTrade, currency), stats.bestTrade],
    ["Worst", formatCurrency(stats.worstTrade, currency), stats.worstTrade],
  ];

  return (
    <Panel title="Performance">
      <div className="grid grid-cols-2 gap-px bg-border/40 text-sm md:grid-cols-4 xl:grid-cols-8">
        {statRows.map(([label, value, tone]) => (
          <div key={label} className="bg-panel p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
            <p className={classNames("mt-1 font-semibold", Number(tone) > 0 ? "text-positive" : Number(tone) < 0 ? "text-negative" : "text-text")}>{value}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ReplayOrdersPanel({
  currency,
  latestPrices,
  onCancel,
  onClose,
  onToggleVisibility,
  orders,
}: {
  currency: string;
  latestPrices: Record<string, number>;
  onCancel: (orderId: string) => void;
  onClose: (orderId: string, price: number) => void;
  onToggleVisibility: (orderId: string) => void;
  orders: PaperOrder[];
}) {
  if (orders.length === 0) {
    return <Panel title="Replay Trades"><EmptyState title="No replay trades" description="" /></Panel>;
  }

  return (
    <Panel title="Replay Trades">
      <div className="max-h-72 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border/70 text-[10px] uppercase tracking-[0.08em] text-text-muted">
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">P/L</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const currentPrice = latestPrices[order.assetId] ?? order.executionPrice ?? order.limitPrice ?? 0;
              const profit = order.status === "filled" && order.executionPrice
                ? calculateLiveOrderProfit(order, currentPrice)
                : order.profitAmount ?? 0;
              return (
                <tr key={order.id} className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold text-text">{order.kind === "perp" ? "Perp" : order.kind === "spot-limit" ? "Limit" : "Market"}</td>
                  <td className="px-3 py-2 text-text-muted">{order.side}</td>
                  <td className="px-3 py-2 text-text-muted">{order.status}</td>
                  <td className="px-3 py-2 text-right text-text">{formatCurrency(order.executionPrice ?? order.limitPrice ?? null, currency)}</td>
                  <td className={classNames("px-3 py-2 text-right font-semibold", profit > 0 ? "text-positive" : profit < 0 ? "text-negative" : "text-text-muted")}>{formatCurrency(profit, currency)}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{formatDateTime(order.updatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {(order.status === "open" || order.status === "filled") && (
                        <button className="rounded border border-border/60 px-2 py-1 text-text-muted hover:bg-panel-muted" onClick={() => onToggleVisibility(order.id)} type="button">
                          {order.hiddenOnChart ? "Show" : "Hide"}
                        </button>
                      )}
                      {order.status === "open" && (
                        <button className="rounded border border-border/60 px-2 py-1 text-negative hover:bg-panel-muted" onClick={() => onCancel(order.id)} type="button">
                          Cancel
                        </button>
                      )}
                      {order.status === "filled" && (
                        <button className="rounded bg-accent px-2 py-1 text-white" onClick={() => onClose(order.id, currentPrice)} type="button">
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ReplayEventLog({ events }: { events: ReplaySession["events"] }) {
  return (
    <Panel title="Event Log">
      <div className="max-h-72 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-3 text-xs font-semibold text-text-muted">No events</div>
        ) : (
          [...events].reverse().map((event) => (
            <div key={event.id} className="border-b border-border/50 px-3 py-2 text-xs">
              <p className="font-semibold text-text">{event.message}</p>
              <p className="text-text-muted">{formatDateTime(event.timestamp)}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function buildReplayOrderLines(session: ReplaySession, currency: string): ChartOrderLine[] {
  return session.ledger.orders
    .filter((order) => !order.hiddenOnChart && (order.status === "open" || order.status === "filled"))
    .flatMap((order) => {
      const lines: ChartOrderLine[] = [];
      const entryPrice = order.executionPrice ?? order.limitPrice;
      if (entryPrice) {
        lines.push({
          id: `replay:${order.id}:entry`,
          label: `${order.kind === "perp" ? "Perp" : order.kind === "spot-limit" ? "Limit" : "Market"} ${formatCurrency(entryPrice, currency)}`,
          price: entryPrice,
          visible: true,
          tone: order.status === "filled" ? "active" : "draft",
        });
      }
      if (order.stopLimitPrice) {
        lines.push({ id: `replay:${order.id}:stop`, label: `SL ${formatCurrency(order.stopLimitPrice, currency)}`, price: order.stopLimitPrice, visible: true, tone: "selected" });
      }
      if (order.profitLimitPrice) {
        lines.push({ id: `replay:${order.id}:profit`, label: `PL ${formatCurrency(order.profitLimitPrice, currency)}`, price: order.profitLimitPrice, visible: true, tone: "selected" });
      }
      return lines;
    });
}

function SegmentedSide({ leftActive, leftLabel, onLeft, onRight, rightLabel }: { leftActive: boolean; leftLabel: string; onLeft: () => void; onRight: () => void; rightLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded bg-panel-muted p-1">
      <button className={leftActive ? "rounded bg-positive/15 px-3 py-2 font-semibold text-positive" : "rounded px-3 py-2 text-text-muted"} onClick={onLeft} type="button">{leftLabel}</button>
      <button className={!leftActive ? "rounded bg-negative/15 px-3 py-2 font-semibold text-negative" : "rounded px-3 py-2 text-text-muted"} onClick={onRight} type="button">{rightLabel}</button>
    </div>
  );
}

function RiskBlock({ checked, helper, label, onCheckedChange, onValueChange, value }: { checked: boolean; helper?: string; label: string; onCheckedChange: (checked: boolean) => void; onValueChange: (value: string) => void; value: string }) {
  return (
    <div className="grid gap-2">
      <RiskCheckbox checked={checked} label={label} onChange={onCheckedChange} />
      {checked && <NumberField helper={helper} label={label} onChange={onValueChange} value={value} />}
    </div>
  );
}

function RiskCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded border border-border/60 bg-panel-muted px-2 py-2 text-xs font-semibold text-text-muted">
      <input checked={checked} className="h-3.5 w-3.5 accent-[var(--color-accent)]" onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function NumberField({ helper, label, onChange, value }: { helper?: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <input className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-text outline-none focus:border-accent" inputMode="decimal" onChange={(event) => onChange(event.currentTarget.value)} value={value} />
      {helper && <span className="text-[11px] font-semibold text-text-muted">{helper}</span>}
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

function calculateLiveOrderProfit(order: PaperOrder, currentPrice: number) {
  if (order.kind === "perp" && order.executionPrice) {
    return order.side === "short"
      ? (order.executionPrice - currentPrice) * order.quantity
      : (currentPrice - order.executionPrice) * order.quantity;
  }
  return order.executionPrice ? (currentPrice - order.executionPrice) * order.quantity : 0;
}

function potentialLabel(type: "loss" | "profit", entryPrice: number | null, targetPrice: number, quantity: number, side: SpotOrderSide | PerpSide, currency: string) {
  if (!entryPrice || !Number.isFinite(targetPrice) || targetPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return undefined;
  }
  const isShort = side === "sell" || side === "short";
  const amount = isShort ? (entryPrice - targetPrice) * quantity : (targetPrice - entryPrice) * quantity;
  const percent = entryPrice * quantity > 0 ? (amount / (entryPrice * quantity)) * 100 : 0;
  return `${type === "loss" ? "Potential Loss" : "Potential Profit"}: ${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount), currency)} (${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%)`;
}

function getReplayDelay(speed: number) {
  return Math.max(40, Math.round(1000 / Math.max(1, speed)));
}

function toDateTimeInput(timestamp: number) {
  const date = new Date(timestamp);
  const timezoneOffsetMilliseconds = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMilliseconds).toISOString().slice(0, 16);
}
