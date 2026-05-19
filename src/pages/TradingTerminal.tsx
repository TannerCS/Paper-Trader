import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { IconSearch, IconSettings, IconVolume, IconVolumeOff, IconX } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { KLineChartPanel, type ChartOrderLine } from "../components/charts/KLineChartPanel";
import {
  createActiveIndicator,
  kLineIndicatorNames,
  type KLineActiveIndicator,
} from "../components/charts/klineTools";
import { defaultRiskLimitDraft, type OrderTicketDraft, type RiskLimitDraft } from "../components/trading/orderDraft";
import { OrderTicket } from "../components/trading/OrderTicket";
import { PurchaseBook } from "../components/trading/PurchaseBook";
import { TradeHistoryTable } from "../components/trading/TradeHistoryTable";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { getAggregationBucketMilliseconds, terminalRangePresets } from "../data/chartRanges";
import { useLiveMarketTick, useLiveMarketTrades } from "../data/exchanges/liveMarketStream";
import { getVenuePuritySnapshot } from "../data/exchangeHealth";
import { mergeLivePriceIntoOhlc } from "../data/ohlc";
import {
  useCancelPaperOrder,
  useClosePaperOrder,
  usePaperLedger,
  useTogglePaperOrderChartVisibility,
  useUpdatePaperOrder,
  useUpdatePaperOrderRiskLimits,
} from "../data/paper/queries";
import type { PaperOrder, PaperOrderKind } from "../data/paper/types";
import {
  defaultTerminalPreferences,
  type ChartStylePreferences,
  type TerminalPreferences,
} from "../data/preferences/terminalPreferences";
import { useChartDrawings, useSaveChartDrawings } from "../data/preferences/chartDrawingQueries";
import { useSaveTerminalPreferences, useTerminalPreferences } from "../data/preferences/queries";
import { useCoinMarkets, useCoinOhlc, useMarketDataSettings } from "../data/queries";
import { classNames } from "../lib/classNames";
import { formatCurrency, formatPercent } from "../lib/format";
import { formatMarketPair, getQuoteAssetFromPair } from "../lib/marketPair";
import type { CandleRange, CoinMarket, MarketDataProviderId, MarketType, TerminalRangePreset } from "../types/marketData";
import { exchangeLabel, plannedMarketDataProviderIds } from "../data/marketDataProvider";

export function TradingTerminal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const settingsQuery = useMarketDataSettings();
  const marketsQuery = useCoinMarkets(settingsQuery.data);
  const markets = marketsQuery.data ?? [];
  const ledgerQuery = usePaperLedger();
  const terminalPreferencesQuery = useTerminalPreferences();
  const saveTerminalPreferences = useSaveTerminalPreferences();
  const appliedPreferencesRef = useRef(false);
  const urlCoinId = searchParams.get("coin");
  const [selectedCoinId, setSelectedCoinId] = useState(urlCoinId ?? defaultTerminalPreferences.selectedCoinId);
  const [selectedRangePreset, setSelectedRangePreset] = useState<TerminalRangePreset>(
    defaultTerminalPreferences.selectedRangePreset,
  );
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [productsDialogOpen, setProductsDialogOpen] = useState(false);
  const [indicatorDialogOpen, setIndicatorDialogOpen] = useState(false);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [orderTicketWidth, setOrderTicketWidth] = useState(defaultTerminalPreferences.orderTicketWidth);
  const [terminalPanelHeight, setTerminalPanelHeight] = useState(defaultTerminalPreferences.terminalPanelHeight);
  const [orderTicketHeight, setOrderTicketHeight] = useState(defaultTerminalPreferences.orderTicketHeight);
  const [orderTicketTab, setOrderTicketTab] = useState<PaperOrderKind>(defaultTerminalPreferences.orderTicketTab);
  const [riskDraft, setRiskDraft] = useState<RiskLimitDraft>(defaultRiskLimitDraft);
  const [orderDraft, setOrderDraft] = useState<OrderTicketDraft | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<PaperOrder | null>(null);
  const [tradeMutationError, setTradeMutationError] = useState<string | null>(null);
  const cancelPaperOrder = useCancelPaperOrder();
  const closePaperOrder = useClosePaperOrder();
  const toggleOrderVisibility = useTogglePaperOrderChartVisibility();
  const updateOrderRiskLimits = useUpdatePaperOrderRiskLimits();
  const updatePaperOrder = useUpdatePaperOrder();
  const savedPreferences = terminalPreferencesQuery.data ?? defaultTerminalPreferences;
  const savedPreferencesRef = useRef(savedPreferences);

  useEffect(() => {
    savedPreferencesRef.current = savedPreferences;
  }, [savedPreferences]);

  useEffect(() => {
    const loadedPreferences = terminalPreferencesQuery.data;

    if (!loadedPreferences || appliedPreferencesRef.current) {
      return;
    }

    appliedPreferencesRef.current = true;
    const nextCoinId = urlCoinId ?? loadedPreferences.selectedCoinId;
    setSelectedCoinId(nextCoinId);
    setSelectedRangePreset(loadedPreferences.selectedRangePreset);
    setOrderTicketWidth(loadedPreferences.orderTicketWidth);
    setTerminalPanelHeight(loadedPreferences.terminalPanelHeight);
    setOrderTicketHeight(loadedPreferences.orderTicketHeight);
    setOrderTicketTab(loadedPreferences.orderTicketTab);

    if (urlCoinId && urlCoinId !== loadedPreferences.selectedCoinId) {
      saveTerminalPreferences.mutate({ ...loadedPreferences, selectedCoinId: urlCoinId });
    }
  }, [saveTerminalPreferences, terminalPreferencesQuery.data, urlCoinId]);

  const persistTerminalPreferences = useCallback(
    (patch: Partial<TerminalPreferences>) => {
      const nextPreferences: TerminalPreferences = {
        ...savedPreferencesRef.current,
        selectedCoinId,
        selectedRangePreset,
        orderTicketWidth,
        terminalPanelHeight,
        orderTicketHeight,
        orderTicketTab,
        ...patch,
      };

      savedPreferencesRef.current = nextPreferences;
      saveTerminalPreferences.mutate(nextPreferences);
    },
    [
      orderTicketTab,
      orderTicketHeight,
      orderTicketWidth,
      saveTerminalPreferences,
      selectedCoinId,
      selectedRangePreset,
      terminalPanelHeight,
    ],
  );

  useEffect(() => {
    if (!urlCoinId || urlCoinId === selectedCoinId) {
      return;
    }

    setSelectedCoinId(urlCoinId);

    if (terminalPreferencesQuery.data) {
      persistTerminalPreferences({ selectedCoinId: urlCoinId });
    }
  }, [persistTerminalPreferences, selectedCoinId, terminalPreferencesQuery.data, urlCoinId]);

  const selectedCoin = useMemo(
    () => markets.find((coin) => coin.id === selectedCoinId) ?? markets[0],
    [markets, selectedCoinId],
  );
  const activeCoinId = selectedCoin?.id ?? selectedCoinId;
  const chartDrawingsQuery = useChartDrawings(activeCoinId);
  const saveChartDrawings = useSaveChartDrawings(activeCoinId);
  const chartRange: CandleRange = useMemo(
    () =>
      customRange.from && customRange.to
        ? { from: new Date(customRange.from).getTime(), to: new Date(customRange.to).getTime() }
        : { preset: selectedRangePreset },
    [customRange.from, customRange.to, selectedRangePreset],
  );
  const ohlcQuery = useCoinOhlc(settingsQuery.data, activeCoinId, chartRange);
  const currency = settingsQuery.data?.baseCurrency ?? "usd";
  const liveTick = useLiveMarketTick(settingsQuery.data, selectedCoin?.id);
  const liveTrades = useLiveMarketTrades(settingsQuery.data, selectedCoin?.id);
  const chartCandles = useMemo(
    () =>
      mergeLivePriceIntoOhlc(
        ohlcQuery.data ?? [],
        liveTick.price,
        liveTick.updatedAt,
        getAggregationBucketMilliseconds(chartRange),
      ),
    [chartRange, liveTick.price, liveTick.updatedAt, ohlcQuery.data],
  );
  const activeSelectedCoin = useMemo(
    () =>
      selectedCoin
        ? {
            ...selectedCoin,
            currentPrice: liveTick.price ?? selectedCoin.currentPrice,
            priceChangePercentage24h: liveTick.priceChangePercentage24h ?? selectedCoin.priceChangePercentage24h,
            lastUpdated: liveTick.updatedAt ?? selectedCoin.lastUpdated,
          }
        : selectedCoin,
    [liveTick, selectedCoin],
  );
  const marketPair = activeSelectedCoin
    ? formatMarketPair(activeSelectedCoin, currency)
    : activeCoinId.toUpperCase();
  const quoteAsset = getQuoteAssetFromPair(marketPair, currency);
  const venuePurity = getVenuePuritySnapshot({
    exchange: activeSelectedCoin?.exchange,
    provider: activeSelectedCoin?.provider as MarketDataProviderId | undefined,
    tickConnected: liveTick.connected,
    tickUpdatedAt: liveTick.updatedAt,
  });
  const chartSurfaceHeight = Math.max(300, terminalPanelHeight - 86);
  const activeChartOverlays =
    chartDrawingsQuery.data ??
    savedPreferences.chartOverlaysByCoinId[activeCoinId] ??
    savedPreferences.chartOverlays;
  const clampedOrderTicketHeight = Math.min(Math.max(180, orderTicketHeight), Math.max(180, terminalPanelHeight - 180));
  const purchaseBookHeight = Math.max(160, terminalPanelHeight - clampedOrderTicketHeight - 8);
  const latestPrices = useMemo(() => {
    const prices: Record<string, number> = {};

    for (const market of markets) {
      if (typeof market.currentPrice === "number") {
        prices[market.id] = market.currentPrice;
      }
    }

    if (activeSelectedCoin?.id && activeSelectedCoin.currentPrice) {
      prices[activeSelectedCoin.id] = activeSelectedCoin.currentPrice;
    }

    return prices;
  }, [activeSelectedCoin?.currentPrice, activeSelectedCoin?.id, markets]);
  const chartOrderLines = useMemo(
    () =>
      buildChartOrderLines({
        activeCoinId,
        orderDraft,
        orders: ledgerQuery.data?.orders ?? [],
        quoteAsset,
        riskDraft,
        selectedOrderId,
        latestPrices,
      }),
    [activeCoinId, ledgerQuery.data?.orders, latestPrices, orderDraft, quoteAsset, riskDraft, selectedOrderId],
  );

  function selectCoin(coinId: string) {
    setSelectedCoinId(coinId);
    setSearchParams({ coin: coinId });
    persistTerminalPreferences({ selectedCoinId: coinId });
  }

  function selectRangePreset(rangePreset: TerminalRangePreset) {
    setSelectedRangePreset(rangePreset);
    setCustomRange({ from: "", to: "" });
    persistTerminalPreferences({ selectedRangePreset: rangePreset });
  }

  function selectOrderTicketTab(nextTab: PaperOrderKind) {
    setOrderTicketTab(nextTab);
    persistTerminalPreferences({ orderTicketTab: nextTab });
  }

  function handleOrderLineChange(lineId: string, price: number) {
    const formattedPrice = price.toFixed(price < 1 ? 6 : 2);

    if (lineId === "draft-stop-limit") {
      setRiskDraft((currentDraft) => ({ ...currentDraft, stopLimitEnabled: true, stopLimitPrice: formattedPrice }));
      return;
    }

    if (lineId === "draft-profit-limit") {
      setRiskDraft((currentDraft) => ({ ...currentDraft, profitLimitEnabled: true, profitLimitPrice: formattedPrice }));
      return;
    }

    const [, orderId, limitType] = lineId.split(":");
    const order = ledgerQuery.data?.orders.find((candidateOrder) => candidateOrder.id === orderId);

    if (!order) {
      return;
    }

    updateOrderRiskLimits.mutate({
      orderId,
      stopLimitPrice: limitType === "stop" ? price : order.stopLimitPrice,
      profitLimitPrice: limitType === "profit" ? price : order.profitLimitPrice,
    });
  }

  function startOrderTicketResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = orderTicketWidth;
    let nextWidth = startWidth;

    function handleMouseMove(mouseEvent: MouseEvent) {
      nextWidth = Math.min(640, Math.max(300, startWidth - (mouseEvent.clientX - startX)));
      setOrderTicketWidth(nextWidth);
    }

    function handleMouseUp() {
      persistTerminalPreferences({ orderTicketWidth: nextWidth });
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function startTerminalHeightResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = terminalPanelHeight;
    let nextHeight = startHeight;

    function handleMouseMove(mouseEvent: MouseEvent) {
      nextHeight = Math.min(980, Math.max(420, startHeight + (mouseEvent.clientY - startY)));
      setTerminalPanelHeight(nextHeight);
    }

    function handleMouseUp() {
      persistTerminalPreferences({ terminalPanelHeight: nextHeight });
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function startOrderBookResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = clampedOrderTicketHeight;
    let nextHeight = startHeight;

    function handleMouseMove(mouseEvent: MouseEvent) {
      nextHeight = Math.min(terminalPanelHeight - 160, Math.max(180, startHeight + (mouseEvent.clientY - startY)));
      setOrderTicketHeight(nextHeight);
    }

    function handleMouseUp() {
      persistTerminalPreferences({ orderTicketHeight: nextHeight });
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Trading Terminal" />

      <div
        className="grid gap-0 overflow-hidden xl:gap-0"
        style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${orderTicketWidth}px` }}
      >
        <div>
          <Panel
            title={
              <button
                className="rounded px-1 py-0.5 text-left transition hover:bg-accent-soft hover:text-accent"
                onClick={() => setProductsDialogOpen(true)}
                type="button"
              >
                {marketPair}
              </button>
            }
            className="relative overflow-hidden"
            action={
              activeSelectedCoin ? (
                <span className="text-sm font-semibold text-text">
                  {formatCurrency(activeSelectedCoin.currentPrice, quoteAsset)}
                  <span className={(activeSelectedCoin.priceChangePercentage24h ?? 0) >= 0 ? "ml-2 text-positive" : "ml-2 text-negative"}>
                    {formatPercent(activeSelectedCoin.priceChangePercentage24h)}
                  </span>
                </span>
              ) : null
            }
          >
            {productsDialogOpen && (
              <ProductsDialog
                activeMarketId={activeSelectedCoin?.id}
                markets={markets}
                onClose={() => setProductsDialogOpen(false)}
                onSelectMarket={(marketId) => {
                  selectCoin(marketId);
                  setProductsDialogOpen(false);
                }}
              />
            )}
            <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-panel-muted/50 px-3 py-2">
              {terminalRangePresets.map((rangePreset) => (
                <button
                  key={rangePreset}
                  className={
                    selectedRangePreset === rangePreset && !customRange.from
                      ? "rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
                      : "rounded px-2 py-1 text-xs font-semibold text-text-muted hover:bg-accent-soft hover:text-text"
                  }
                  onClick={() => selectRangePreset(rangePreset)}
                  type="button"
                >
                  {rangePreset}
                </button>
              ))}
              <div className="relative">
                <button
                  className="rounded px-2 py-1 text-xs font-semibold text-text-muted hover:bg-accent-soft hover:text-text"
                  onClick={() => setCustomRangeOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  Custom
                </button>
                {customRangeOpen && (
                  <div className="absolute right-0 top-8 z-20 w-72 rounded-panel border border-border/70 bg-panel p-3 shadow-sm">
                    <div className="grid gap-2">
                      <label className="text-xs font-semibold text-text-muted">
                        From
                        <input
                          className="mt-1 w-full rounded border border-border/70 bg-panel-muted px-2 py-1 text-sm text-text"
                          onChange={(event) => setCustomRange((currentRange) => ({ ...currentRange, from: event.currentTarget.value }))}
                          type="datetime-local"
                          value={customRange.from}
                        />
                      </label>
                      <label className="text-xs font-semibold text-text-muted">
                        To
                        <input
                          className="mt-1 w-full rounded border border-border/70 bg-panel-muted px-2 py-1 text-sm text-text"
                          onChange={(event) => setCustomRange((currentRange) => ({ ...currentRange, to: event.currentTarget.value }))}
                          type="datetime-local"
                          value={customRange.to}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="mx-2 h-6 w-px bg-border/70" />
              <button
                className="rounded px-2 py-1 text-xs font-semibold text-text-muted hover:bg-accent-soft hover:text-text"
                onClick={() => setIndicatorDialogOpen(true)}
                type="button"
              >
                Indicators
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-1 text-[11px] font-semibold text-text-muted">
                <VenueSourcePill label="Chart" value={venuePurity.chartSource} />
                <VenueSourcePill label="Tape" value={venuePurity.tapeSource} />
                <VenueSourcePill label="Fills" value={venuePurity.executionSource} />
                <span
                  className={classNames(
                    "rounded-full border px-2 py-0.5",
                    venuePurity.liveStatus === "live" && "border-positive/30 bg-positive/10 text-positive",
                    venuePurity.liveStatus === "stale" && "border-amber-400/40 bg-amber-400/10 text-amber-700",
                    venuePurity.liveStatus === "offline" && "border-negative/30 bg-negative/10 text-negative",
                  )}
                  title={venuePurity.message}
                >
                  {venuePurity.liveStatus}
                </span>
              </div>
            </div>
            {indicatorDialogOpen && (
              <IndicatorPickerDialog
                activeIndicators={savedPreferences.activeIndicators}
                onClose={() => setIndicatorDialogOpen(false)}
                onSave={(activeIndicators) => {
                  persistTerminalPreferences({ activeIndicators });
                  setIndicatorDialogOpen(false);
                }}
              />
            )}
            <button
              aria-label={savedPreferences.purchaseBookMuted ? "Unmute purchase book" : "Mute purchase book"}
              className="absolute right-11 top-[3.25rem] z-20 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-panel/95 text-text-muted shadow-sm transition hover:bg-panel-muted hover:text-text"
              onClick={async () => {
                if (savedPreferences.purchaseBookMuted) {
                  const Tone = await import("tone");
                  await Tone.start();
                }
                persistTerminalPreferences({ purchaseBookMuted: !savedPreferences.purchaseBookMuted });
              }}
              type="button"
            >
              {savedPreferences.purchaseBookMuted ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
            </button>
            <button
              aria-label="Chart settings"
              className="absolute right-2 top-[3.25rem] z-20 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-panel/95 text-text-muted shadow-sm transition hover:bg-panel-muted hover:text-text"
              onClick={() => setChartSettingsOpen(true)}
              type="button"
            >
              <IconSettings size={16} />
            </button>
            {chartSettingsOpen && (
              <ChartSettingsDialog
                chartStyles={savedPreferences.chartStyles}
                onClose={() => setChartSettingsOpen(false)}
                onSave={(chartStyles) => {
                  persistTerminalPreferences({ chartStyles });
                  setChartSettingsOpen(false);
                }}
              />
            )}
            <KLineChartPanel
              coinId={marketPair.replace("/", "")}
              candles={chartCandles}
              error={ohlcQuery.error}
              height={chartSurfaceHeight}
              isLoading={ohlcQuery.isLoading}
              range={chartRange}
              activeIndicators={savedPreferences.activeIndicators}
              chartViewport={savedPreferences.chartViewport}
              chartToolbarPosition={savedPreferences.chartToolbarPosition}
              chartOverlays={activeChartOverlays}
              chartStyles={savedPreferences.chartStyles}
              timeZone={settingsQuery.data?.timeZone}
              onActiveIndicatorsChange={(activeIndicators) => persistTerminalPreferences({ activeIndicators })}
              onChartViewportChange={(chartViewport) => persistTerminalPreferences({ chartViewport })}
              onChartToolbarPositionChange={(chartToolbarPosition) => persistTerminalPreferences({ chartToolbarPosition })}
              onChartOverlaysChange={(chartOverlays) => saveChartDrawings.mutate(chartOverlays)}
              orderLines={chartOrderLines}
              onOrderLineChange={handleOrderLineChange}
              onOrderLineDoubleClick={(lineId) => {
                const orderId = getOrderIdFromLineId(lineId);
                const order = ledgerQuery.data?.orders.find((candidateOrder) => candidateOrder.id === orderId);
                if (order) {
                  setEditingOrder(order);
                }
              }}
            />
          </Panel>
          <div
            aria-label="Resize trading panels"
            className="h-2 cursor-row-resize transition hover:bg-accent/30"
            onMouseDown={startTerminalHeightResize}
            role="separator"
          />
        </div>

        <div
          aria-label="Resize order ticket"
          className="hidden cursor-col-resize bg-transparent transition hover:bg-accent/30 xl:block"
          onMouseDown={startOrderTicketResize}
          role="separator"
        />

        <div>
          <Panel className="overflow-hidden">
            <div style={{ height: terminalPanelHeight }}>
              <div style={{ height: clampedOrderTicketHeight }}>
                <OrderTicket
                  selectedCoin={activeSelectedCoin}
                  currency={quoteAsset}
                  marketPair={marketPair}
                  activeKind={orderTicketTab}
                  onActiveKindChange={selectOrderTicketTab}
                  riskDraft={riskDraft}
                  onRiskDraftChange={setRiskDraft}
                  onDraftChange={setOrderDraft}
                  onOrderPlaced={(orderId) => {
                    setRiskDraft(defaultRiskLimitDraft);
                    setSelectedOrderId(orderId ?? null);
                  }}
                />
              </div>
              <div
                aria-label="Resize purchase book"
                className="h-2 cursor-row-resize border-y border-border/50 bg-panel-muted/50 transition hover:bg-accent/30"
                onMouseDown={startOrderBookResize}
                role="separator"
              />
              <div style={{ height: purchaseBookHeight }}>
                <PurchaseBook
                  trades={liveTrades}
                  currency={quoteAsset}
                  marketId={activeCoinId}
                  muted={savedPreferences.purchaseBookMuted}
                />
              </div>
            </div>
          </Panel>
          <div
            aria-label="Resize trading panels"
            className="h-2 cursor-row-resize transition hover:bg-accent/30"
            onMouseDown={startTerminalHeightResize}
            role="separator"
          />
        </div>
      </div>

      <Panel>
        {ledgerQuery.isLoading && <EmptyState title="Loading trades" description="" />}
        {ledgerQuery.error && <EmptyState title="Purchase history unavailable" description={ledgerQuery.error.message} />}
        {!ledgerQuery.isLoading && !ledgerQuery.error && (
          <TradeHistoryTable
            orders={ledgerQuery.data?.orders ?? []}
            currency={quoteAsset}
            latestPrices={latestPrices}
            selectedOrderId={selectedOrderId}
            onCancelOrder={(orderId) => {
              setTradeMutationError(null);
              cancelPaperOrder.mutate(orderId, { onError: (error) => setTradeMutationError(getErrorMessage(error)) });
            }}
            onCloseOrder={(orderId, currentPrice) => {
              setTradeMutationError(null);
              closePaperOrder.mutate(
                { orderId, currentPrice },
                { onError: (error) => setTradeMutationError(getErrorMessage(error)) },
              );
            }}
            onSelectAsset={selectCoin}
            onEditOrder={setEditingOrder}
            onSelectOrder={(orderId) => {
              const nextSelectedOrderId = selectedOrderId === orderId ? null : orderId;
              const nextSelectedOrder = ledgerQuery.data?.orders.find((candidateOrder) => candidateOrder.id === nextSelectedOrderId);

              setSelectedOrderId(nextSelectedOrderId);

              if (nextSelectedOrder && nextSelectedOrder.assetId !== activeCoinId) {
                selectCoin(nextSelectedOrder.assetId);
              }
            }}
            onToggleOrderVisibility={(orderId) => {
              setTradeMutationError(null);
              toggleOrderVisibility.mutate(orderId, { onError: (error) => setTradeMutationError(getErrorMessage(error)) });
            }}
          />
        )}
        {tradeMutationError && (
          <div className="border-t border-negative/20 bg-negative/10 px-3 py-2 text-xs font-semibold text-negative">
            {tradeMutationError}
          </div>
        )}
      </Panel>
      {editingOrder && (
        <OrderEditDialog
          order={editingOrder}
          currency={getQuoteAssetFromPair(editingOrder.pair, quoteAsset)}
          isSaving={updatePaperOrder.isPending}
          onClose={() => setEditingOrder(null)}
          onSave={(input) => {
            updatePaperOrder.mutate(input, {
              onSuccess: () => setEditingOrder(null),
              onError: (error) => setTradeMutationError(getErrorMessage(error)),
            });
          }}
        />
      )}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Trade mutation failed.";
}

function getOrderIdFromLineId(lineId: string) {
  const [, orderId] = lineId.split(":");
  return orderId;
}

function OrderEditDialog({
  currency,
  isSaving,
  onClose,
  onSave,
  order,
}: {
  currency: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: {
    orderId: string;
    quantity?: number;
    limitPrice?: number;
    stopLimitPrice?: number;
    profitLimitPrice?: number;
    leverage?: number;
  }) => void;
  order: PaperOrder;
}) {
  const isOpenOrder = order.status === "open";
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [limitPrice, setLimitPrice] = useState(order.limitPrice ? String(order.limitPrice) : "");
  const [stopLimitPrice, setStopLimitPrice] = useState(order.stopLimitPrice ? String(order.stopLimitPrice) : "");
  const [profitLimitPrice, setProfitLimitPrice] = useState(order.profitLimitPrice ? String(order.profitLimitPrice) : "");
  const [leverage, setLeverage] = useState(order.leverage ? String(order.leverage) : "1");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]">
      <div className="w-[560px] max-w-full overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text">Edit {order.kind === "perp" ? "Perp" : order.kind === "spot-limit" ? "Limit" : "Market"} Order</p>
            <p className="text-xs text-text-muted">{order.pair} on {order.exchange}</p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
            <IconX size={16} />
          </button>
        </div>
        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <InfoPill label="Status" value={order.status} />
            <InfoPill label="Side" value={order.side} />
            <InfoPill label="Entry" value={formatCurrency(order.executionPrice ?? order.limitPrice ?? null, currency)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DialogNumberField disabled={!isOpenOrder} label="Quantity" value={quantity} onChange={setQuantity} />
            {order.kind !== "spot-market" && (
              <DialogNumberField disabled={!isOpenOrder} label={order.kind === "perp" ? "Entry Price" : "Limit Price"} value={limitPrice} onChange={setLimitPrice} />
            )}
            {order.kind === "perp" && <DialogNumberField disabled={!isOpenOrder} label="Leverage" value={leverage} onChange={setLeverage} />}
            <DialogNumberField label="Stop Limit" value={stopLimitPrice} onChange={setStopLimitPrice} />
            <DialogNumberField label="Profit Limit" value={profitLimitPrice} onChange={setProfitLimitPrice} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-3">
          <button className="rounded px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isSaving}
            onClick={() =>
              onSave({
                orderId: order.id,
                quantity: isOpenOrder ? numericOrNull(quantity) ?? undefined : undefined,
                limitPrice: isOpenOrder ? numericOrNull(limitPrice) ?? undefined : order.limitPrice,
                stopLimitPrice: numericOrNull(stopLimitPrice) ?? undefined,
                profitLimitPrice: numericOrNull(profitLimitPrice) ?? undefined,
                leverage: isOpenOrder ? numericOrNull(leverage) ?? undefined : order.leverage,
              })
            }
            type="button"
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsDialog({
  activeMarketId,
  markets,
  onClose,
  onSelectMarket,
}: {
  activeMarketId?: string;
  markets: CoinMarket[];
  onClose: () => void;
  onSelectMarket: (marketId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("spot");
  const countsByType = {
    futures: markets.filter((market) => (market.marketType ?? "spot") === "futures").length,
    indices: markets.filter((market) => (market.marketType ?? "spot") === "indices").length,
    spot: markets.filter((market) => (market.marketType ?? "spot") === "spot").length,
    swap: plannedMarketDataProviderIds.length,
  };
  const filteredMarkets = markets
    .filter((market) => (market.marketType ?? "spot") === marketType)
    .filter((market) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return true;
      return (
        market.id.toLowerCase().includes(normalizedQuery) ||
        market.symbol.toLowerCase().includes(normalizedQuery) ||
        market.name.toLowerCase().includes(normalizedQuery) ||
        (market.exchange ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  const plannedRows = plannedMarketDataProviderIds.map((provider) => ({
    id: `${provider}:planned`,
    symbol: "BTC/USD",
    exchange: exchangeLabel(provider),
  }));

  return (
    <div className="absolute left-3 top-11 z-40 w-[560px] max-w-[calc(100%-24px)] overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="text-sm font-semibold text-text">Products</p>
        <button className="grid h-8 w-8 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
          <IconX size={16} />
        </button>
      </div>
      <div className="border-b border-border/60 p-3">
        <label className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded border border-border/70 bg-panel-muted px-2 py-2">
          <IconSearch size={15} className="text-text-muted" />
          <input
            className="bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search pairs, assets, or exchanges"
            value={query}
          />
        </label>
      </div>
      <div className="flex gap-4 border-b border-border/60 px-4 py-2 text-sm">
        {(["futures", "indices", "spot", "swap"] as MarketType[]).map((type) => (
          <button
            className={marketType === type ? "border-b-2 border-text pb-1 font-semibold text-text" : "pb-1 text-text-muted"}
            key={type}
            onClick={() => setMarketType(type)}
            type="button"
          >
            {typeLabel(type)} <span className="rounded-full bg-panel-muted px-1.5 text-xs">{countsByType[type]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1.1fr_0.9fr_0.7fr_0.5fr] border-b border-border/60 px-4 py-2 text-xs font-semibold text-text-muted">
        <span>Asset</span>
        <span>Exchange</span>
        <span className="text-right">Price</span>
        <span className="text-right">24H</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {(marketType === "spot" ? filteredMarkets : marketType === "swap" ? [] : []).map((market) => (
          <button
            className={classNames(
              "grid w-full grid-cols-[1.1fr_0.9fr_0.7fr_0.5fr] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-panel-muted",
              activeMarketId === market.id && "bg-accent/15",
            )}
            key={market.id}
            onClick={() => onSelectMarket(market.id)}
            type="button"
          >
            <span className="font-semibold text-text">{formatMarketPair(market)}</span>
            <span className="flex items-center gap-2 text-text-muted">
              <ExchangeIcon exchange={market.exchange} />
              {market.exchange}
            </span>
            <span className="text-right font-medium text-text">{formatCurrency(market.currentPrice, getQuoteAssetFromPair(formatMarketPair(market)))}</span>
            <span className={(market.priceChangePercentage24h ?? 0) >= 0 ? "text-right text-positive" : "text-right text-negative"}>
              {formatPercent(market.priceChangePercentage24h)}
            </span>
          </button>
        ))}
        {marketType === "swap" &&
          plannedRows.map((row) => (
            <div className="grid grid-cols-[1.1fr_0.9fr_0.7fr_0.5fr] gap-3 px-4 py-2 text-sm text-text-muted" key={row.id}>
              <span className="font-semibold">{row.symbol}</span>
              <span className="flex items-center gap-2"><ExchangeIcon exchange={row.exchange} />{row.exchange}</span>
              <span className="text-right">Queued</span>
              <span className="text-right">--</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ExchangeIcon({ exchange }: { exchange?: string }) {
  const faviconUrl = getExchangeFaviconUrl(exchange);

  if (!faviconUrl) {
    return <span className="h-4 w-4 rounded-full bg-panel-muted" aria-hidden="true" />;
  }

  return <img className="h-4 w-4 rounded-full" src={faviconUrl} alt="" loading="lazy" />;
}

function getExchangeFaviconUrl(exchange?: string) {
  if (exchange === "Binance.US") return getFaviconServiceUrl("binance.us");
  if (exchange === "Coinbase") return getFaviconServiceUrl("coinbase.com");
  if (exchange === "OKX") return getFaviconServiceUrl("okx.com");
  if (exchange === "MEXC") return getFaviconServiceUrl("mexc.com");
  if (exchange === "Bybit") return getFaviconServiceUrl("bybit.com");
  if (exchange === "Phemex") return getFaviconServiceUrl("phemex.com");
  return "";
}

function getFaviconServiceUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-panel-muted px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="truncate font-semibold text-text">{value}</p>
    </div>
  );
}

function VenueSourcePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border/70 bg-panel px-2 py-0.5" title={`${label} source: ${value}`}>
      {label}: <span className="text-text">{value}</span>
    </span>
  );
}

function DialogNumberField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-text-muted">
      {label}
      <input
        className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-sm text-text outline-none focus:border-accent disabled:opacity-55"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </label>
  );
}

function typeLabel(type: MarketType) {
  if (type === "spot") return "Spot";
  if (type === "swap") return "Swap";
  if (type === "futures") return "Futures";
  return "Indices";
}

function ChartSettingsDialog({
  chartStyles,
  onClose,
  onSave,
}: {
  chartStyles: ChartStylePreferences;
  onClose: () => void;
  onSave: (chartStyles: ChartStylePreferences) => void;
}) {
  const [draftStyles, setDraftStyles] = useState(chartStyles);

  return (
    <div className="absolute inset-x-0 top-[6.25rem] z-30 mx-auto w-[520px] max-w-[calc(100%-32px)] overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <p className="text-sm font-semibold text-text">Chart Settings</p>
        <button className="grid h-7 w-7 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
          <span className="text-lg leading-none text-text-muted">x</span>
        </button>
      </div>
      <div className="grid gap-4 p-4">
        <label className="grid gap-1 text-xs font-semibold text-text-muted">
          Candle Type
          <select
            className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-sm text-text outline-none focus:border-accent"
            value={draftStyles.candleType}
            onChange={(event) =>
              setDraftStyles({
                ...draftStyles,
                candleType: event.currentTarget.value as ChartStylePreferences["candleType"],
              })
            }
          >
            <option value="candle_solid">Solid candles</option>
            <option value="candle_stroke">Stroke candles</option>
            <option value="candle_up_stroke">Up stroke candles</option>
            <option value="candle_down_stroke">Down stroke candles</option>
            <option value="ohlc">OHLC bars</option>
            <option value="area">Area</option>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <ColorInput label="Up Color" value={draftStyles.upColor} onChange={(upColor) => setDraftStyles({ ...draftStyles, upColor })} />
          <ColorInput label="Down Color" value={draftStyles.downColor} onChange={(downColor) => setDraftStyles({ ...draftStyles, downColor })} />
          <ColorInput label="Grid Color" value={draftStyles.gridColor} onChange={(gridColor) => setDraftStyles({ ...draftStyles, gridColor })} />
          <label className="grid gap-1 text-xs font-semibold text-text-muted">
            Grid Style
            <select
              className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-sm text-text outline-none focus:border-accent"
              value={draftStyles.gridStyle}
              onChange={(event) =>
                setDraftStyles({
                  ...draftStyles,
                  gridStyle: event.currentTarget.value as ChartStylePreferences["gridStyle"],
                })
              }
            >
              <option value="dashed">Dashed</option>
              <option value="solid">Solid</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ToggleInput label="Grid" checked={draftStyles.gridVisible} onChange={(gridVisible) => setDraftStyles({ ...draftStyles, gridVisible })} />
          <ToggleInput
            label="Crosshair"
            checked={draftStyles.crosshairVisible}
            onChange={(crosshairVisible) => setDraftStyles({ ...draftStyles, crosshairVisible })}
          />
          <ToggleInput
            label="Last Price"
            checked={draftStyles.lastPriceLineVisible}
            onChange={(lastPriceLineVisible) => setDraftStyles({ ...draftStyles, lastPriceLineVisible })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border/60 p-3">
        <button className="rounded px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={() => onSave(draftStyles)} type="button">
          Save
        </button>
      </div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-text-muted">
      {label}
      <span className="grid grid-cols-[36px_minmax(0,1fr)] gap-2">
        <input className="h-9 w-9 rounded border border-border/70 bg-transparent p-0.5" onChange={(event) => onChange(event.currentTarget.value)} type="color" value={value} />
        <input
          className="rounded border border-border/70 bg-panel-muted px-2 py-2 text-sm text-text outline-none focus:border-accent"
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value}
        />
      </span>
    </label>
  );
}

function ToggleInput({
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
      <input checked={checked} className="h-3.5 w-3.5 accent-[var(--color-accent)]" onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function IndicatorPickerDialog({
  activeIndicators,
  onClose,
  onSave,
}: {
  activeIndicators: KLineActiveIndicator[];
  onClose: () => void;
  onSave: (activeIndicators: KLineActiveIndicator[]) => void;
}) {
  const [selectedNames, setSelectedNames] = useState(() => new Set(activeIndicators.map((indicator) => indicator.name)));

  function toggleIndicator(name: KLineActiveIndicator["name"]) {
    setSelectedNames((currentNames) => {
      const nextNames = new Set(currentNames);

      if (nextNames.has(name)) {
        nextNames.delete(name);
      } else {
        nextNames.add(name);
      }

      return nextNames;
    });
  }

  function saveIndicators() {
    const nextIndicators = kLineIndicatorNames
      .filter((indicatorName) => selectedNames.has(indicatorName))
      .map((indicatorName) => activeIndicators.find((indicator) => indicator.name === indicatorName) ?? createActiveIndicator(indicatorName));

    onSave(nextIndicators);
  }

  return (
    <div className="absolute inset-x-0 top-[6.25rem] z-30 mx-auto w-[420px] max-w-[calc(100%-32px)] overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <p className="text-sm font-semibold text-text">Indicators</p>
        <button className="grid h-7 w-7 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
          <span className="text-lg leading-none text-text-muted">x</span>
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-1">
          {kLineIndicatorNames.map((indicatorName) => (
            <label
              className="flex items-center gap-2 rounded px-2 py-2 text-xs font-semibold text-text-muted hover:bg-accent-soft hover:text-text"
              key={indicatorName}
            >
              <input
                checked={selectedNames.has(indicatorName)}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                onChange={() => toggleIndicator(indicatorName)}
                type="checkbox"
              />
              {indicatorName}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border/60 p-3">
        <button className="rounded px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={saveIndicators} type="button">
          Save
        </button>
      </div>
    </div>
  );
}

function buildChartOrderLines({
  activeCoinId,
  latestPrices,
  orderDraft,
  orders,
  quoteAsset,
  riskDraft,
  selectedOrderId,
}: {
  activeCoinId: string;
  latestPrices: Record<string, number>;
  orderDraft: OrderTicketDraft | null;
  orders: PaperOrder[];
  quoteAsset: string;
  riskDraft: RiskLimitDraft;
  selectedOrderId: string | null;
}): ChartOrderLine[] {
  const lines: ChartOrderLine[] = [];
  const draftQuantity = orderDraft?.quantity ?? 0;
  const draftEntryPrice = orderDraft?.entryPrice ?? null;

  if (riskDraft.stopLimitEnabled) {
    const stopPrice = numericOrNull(riskDraft.stopLimitPrice);

    if (stopPrice) {
      lines.push({
        id: "draft-stop-limit",
        label: `Stop Limit ${riskSummary(draftEntryPrice, stopPrice, draftQuantity, orderDraft?.side, quoteAsset)}`,
        price: stopPrice,
        visible: true,
        draggable: true,
        tone: "draft",
      });
    }
  }

  if (riskDraft.profitLimitEnabled) {
    const profitPrice = numericOrNull(riskDraft.profitLimitPrice);

    if (profitPrice) {
      lines.push({
        id: "draft-profit-limit",
        label: `Profit Limit ${riskSummary(draftEntryPrice, profitPrice, draftQuantity, orderDraft?.side, quoteAsset)}`,
        price: profitPrice,
        visible: true,
        draggable: true,
        tone: "draft",
      });
    }
  }

  const activeOrders = orders.filter(
    (order) => order.assetId === activeCoinId && (order.status === "open" || order.status === "filled") && !order.hiddenOnChart,
  );

  for (const order of activeOrders) {
    const currentPrice = latestPrices[order.assetId];
    const isSelected = order.id === selectedOrderId;
    const entryPrice = order.executionPrice ?? order.limitPrice;

    if (entryPrice) {
      lines.push({
        id: `order:${order.id}:entry`,
        label: orderLineLabel(order, currentPrice, quoteAsset),
        price: entryPrice,
        visible: true,
        tone: isSelected ? "selected" : "active",
      });
    }

    if (isSelected && order.stopLimitPrice) {
      lines.push({
        id: `order:${order.id}:stop`,
        label: `Stop Limit ${formatCurrency(order.stopLimitPrice, quoteAsset)}`,
        price: order.stopLimitPrice,
        visible: true,
        draggable: true,
        tone: "selected",
      });
    }

    if (isSelected && order.profitLimitPrice) {
      lines.push({
        id: `order:${order.id}:profit`,
        label: `Profit Limit ${formatCurrency(order.profitLimitPrice, quoteAsset)}`,
        price: order.profitLimitPrice,
        visible: true,
        draggable: true,
        tone: "selected",
      });
    }
  }

  return lines;
}

function orderLineLabel(order: PaperOrder, currentPrice: number | undefined, quoteAsset: string) {
  const typeLabel = order.kind === "perp" ? "Perp" : order.kind === "spot-limit" ? "Limit" : "Market";
  const stopLabel = order.stopLimitPrice ? ` SL:${formatPlainPrice(order.stopLimitPrice)}` : "";
  const profitLabel = order.profitLimitPrice ? ` PL:${formatPlainPrice(order.profitLimitPrice)}` : "";
  const profit = order.status === "filled" && currentPrice && order.executionPrice
    ? calculateLiveProfit(order, currentPrice)
    : { amount: order.profitAmount ?? 0, percent: order.profitPercent ?? 0 };
  const profitLabelText = order.status === "filled"
    ? ` ${formatSignedCurrency(profit.amount, quoteAsset)} (${formatSignedPercent(profit.percent)})`
    : "";

  return `${typeLabel}${stopLabel}${profitLabel}${profitLabelText}`;
}

function riskSummary(
  entryPrice: number | null,
  targetPrice: number,
  quantity: number,
  side: PaperOrder["side"] | undefined,
  quoteAsset: string,
) {
  if (!entryPrice || !quantity || !side) {
    return formatCurrency(targetPrice, quoteAsset);
  }

  const profit = calculateProfit(entryPrice, targetPrice, quantity, side);
  return `${formatCurrency(targetPrice, quoteAsset)} ${formatSignedCurrency(profit.amount, quoteAsset)} (${formatSignedPercent(profit.percent)})`;
}

function calculateLiveProfit(order: PaperOrder, currentPrice: number) {
  return calculateProfit(order.executionPrice ?? currentPrice, currentPrice, order.quantity, order.side, order.margin);
}

function calculateProfit(
  entryPrice: number,
  targetPrice: number,
  quantity: number,
  side: PaperOrder["side"],
  margin?: number,
) {
  const isShort = side === "sell" || side === "short";
  const amount = isShort ? (entryPrice - targetPrice) * quantity : (targetPrice - entryPrice) * quantity;
  const denominator = margin && margin > 0 ? margin : entryPrice * quantity;

  return {
    amount,
    percent: denominator > 0 ? (amount / denominator) * 100 : 0,
  };
}

function numericOrNull(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function formatPlainPrice(value: number) {
  return value < 1 ? value.toFixed(6) : value.toFixed(2);
}

function formatSignedCurrency(value: number, currency: string) {
  const formattedValue = formatCurrency(Math.abs(value), currency);
  return `${value >= 0 ? "+" : "-"}${formattedValue}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
