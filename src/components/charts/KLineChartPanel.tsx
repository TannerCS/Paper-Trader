import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  dispose,
  init,
  type Chart,
  type Indicator,
  type KLineData,
  type LineType,
  type Overlay,
  type OverlayCreate,
  type TooltipFeatureStyle,
} from "klinecharts";
import type { CandleRange, OhlcCandle } from "../../types/marketData";
import { EmptyState } from "../ui/EmptyState";
import { useTheme } from "../../theme/ThemeProvider";
import { classNames } from "../../lib/classNames";
import {
  createActiveIndicator,
  kLineIndicatorNames,
  kLineOverlayNames,
  type KLineActiveIndicator,
  type KLineOverlayName,
} from "./klineTools";
import { getKLinePeriod } from "../../data/chartRanges";
import type {
  ChartOverlayPreferences,
  ChartStylePreferences,
  ChartToolbarPositionPreferences,
  ChartViewportPreferences,
} from "../../data/preferences/terminalPreferences";

export interface ChartOrderLine {
  id: string;
  label: string;
  price: number;
  visible: boolean;
  draggable?: boolean;
  tone?: "draft" | "selected" | "active";
}

interface KLineChartPanelProps {
  coinId: string;
  candles: OhlcCandle[];
  range: CandleRange;
  height?: number;
  activeIndicators?: KLineActiveIndicator[];
  chartViewport?: ChartViewportPreferences;
  chartToolbarPosition?: ChartToolbarPositionPreferences;
  chartOverlays?: ChartOverlayPreferences[];
  chartStyles?: ChartStylePreferences;
  timeZone?: string;
  onActiveIndicatorsChange?: (activeIndicators: KLineActiveIndicator[]) => void;
  onChartViewportChange?: (chartViewport: ChartViewportPreferences) => void;
  onChartToolbarPositionChange?: (position: ChartToolbarPositionPreferences) => void;
  onChartOverlaysChange?: (overlays: ChartOverlayPreferences[]) => void;
  orderLines?: ChartOrderLine[];
  onOrderLineChange?: (lineId: string, price: number) => void;
  onOrderLineDoubleClick?: (lineId: string) => void;
  isLoading: boolean;
  error?: Error | null;
}

export function KLineChartPanel({
  coinId,
  candles,
  range,
  height = 480,
  activeIndicators: persistedActiveIndicators,
  chartViewport,
  chartToolbarPosition,
  chartOverlays = [],
  chartStyles,
  timeZone,
  onActiveIndicatorsChange,
  onChartViewportChange,
  onChartToolbarPositionChange,
  onChartOverlaysChange,
  orderLines = [],
  onOrderLineChange,
  onOrderLineDoubleClick,
  isLoading,
  error,
}: KLineChartPanelProps) {
  const { themeName } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const onChartViewportChangeRef = useRef(onChartViewportChange);
  const onChartOverlaysChangeRef = useRef(onChartOverlaysChange);
  const activeIndicatorsRef = useRef<KLineActiveIndicator[]>(persistedActiveIndicators ?? []);
  const onActiveIndicatorsChangeRef = useRef(onActiveIndicatorsChange);
  const viewportPersistTimerRef = useRef<number | null>(null);
  const overlayPersistTimerRef = useRef<number | null>(null);
  const restoredOverlaySignatureRef = useRef("");
  const pendingViewportRef = useRef<ChartViewportPreferences | null>(null);
  const layoutFrameRef = useRef<number | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<KLineActiveIndicator[]>(persistedActiveIndicators ?? []);
  const [editingIndicator, setEditingIndicator] = useState<KLineActiveIndicator | null>(null);
  const [editingOverlay, setEditingOverlay] = useState<ChartOverlayPreferences | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const dataSignatureRef = useRef("");
  const shouldShowChart = !isLoading && !error && candles.length > 0;
  const kLinePeriod = useMemo(() => getKLinePeriod(range), [range]);
  const chartOverlaySignature = useMemo(() => getOverlaySignature(chartOverlays), [chartOverlays]);

  const kLineData = useMemo<KLineData[]>(
    () =>
      candles.map((candle) => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );

  useEffect(() => {
    onChartViewportChangeRef.current = onChartViewportChange;
  }, [onChartViewportChange]);

  useEffect(() => {
    onChartOverlaysChangeRef.current = onChartOverlaysChange;
  }, [onChartOverlaysChange]);

  useEffect(() => {
    onActiveIndicatorsChangeRef.current = onActiveIndicatorsChange;
  }, [onActiveIndicatorsChange]);

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators;
  }, [activeIndicators]);

  useEffect(() => {
    if (!shouldShowChart) {
      return;
    }

    if (!chartContainerRef.current) {
      return;
    }

    dispose(chartContainerRef.current);
    chartContainerRef.current.innerHTML = "";

    //fresh chart mount
    const chart = init(chartContainerRef.current);
    chartRef.current = chart;

    if (chart) {
      applyChartStyles(chart, themeName, chartStyles);
      chart.setSymbol({ ticker: coinId, pricePrecision: 4, volumePrecision: 2 });
      if (timeZone) {
        chart.setTimezone(timeZone);
      }
      if (chartViewport?.barSpace) {
        chart.setBarSpace(chartViewport.barSpace);
      }
      if (chartViewport?.offsetRightDistance !== undefined) {
        chart.setOffsetRightDistance(chartViewport.offsetRightDistance);
      }
      chart.setPeriod(kLinePeriod);
      chart.setDataLoader({
        getBars: ({ callback }) => {
          callback(kLineData, false);
        },
      });
      chart.resetData();
      dataSignatureRef.current = getDataSignature(kLineData);
      for (const indicator of activeIndicatorsRef.current) {
        createChartIndicator(chart, indicator);
      }
      restoreChartOverlays(chart, chartOverlays, schedulePersistedOverlays, setEditingOverlay);
      restoredOverlaySignatureRef.current = chartOverlaySignature;
    }

    function persistViewport() {
      if (!chart) {
        return;
      }

      //save chart view
      const visibleRange = chart.getVisibleRange();
      const nextViewport = {
        barSpace: chart.getBarSpace().bar,
        offsetRightDistance: chart.getOffsetRightDistance(),
        visibleFrom: visibleRange.from,
        visibleTo: visibleRange.to,
      };
      pendingViewportRef.current = nextViewport;

      if (viewportPersistTimerRef.current === null) {
        viewportPersistTimerRef.current = window.setTimeout(() => {
          viewportPersistTimerRef.current = null;
          if (pendingViewportRef.current) {
            onChartViewportChangeRef.current?.(pendingViewportRef.current);
            pendingViewportRef.current = null;
          }
        }, 750);
      }

      if (layoutFrameRef.current === null) {
        layoutFrameRef.current = window.requestAnimationFrame(() => {
          layoutFrameRef.current = null;
          setLayoutVersion((version) => version + 1);
        });
      }
    }

    chart?.subscribeAction("onZoom", persistViewport);
    chart?.subscribeAction("onScroll", persistViewport);
    chart?.subscribeAction("onVisibleRangeChange", persistViewport);
    chart?.subscribeAction("onIndicatorTooltipFeatureClick", handleIndicatorFeatureClick);

    const chartDom = chart?.getDom();
    const persistOverlaysAfterGesture = () => schedulePersistedOverlays(80);
    chartDom?.addEventListener("mouseup", persistOverlaysAfterGesture);
    chartDom?.addEventListener("touchend", persistOverlaysAfterGesture);
    chartDom?.addEventListener("contextmenu", persistOverlaysAfterGesture);

    const resizeObserver = new ResizeObserver(() => {
      chart?.resize();
      setLayoutVersion((version) => version + 1);
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      if (viewportPersistTimerRef.current !== null) {
        window.clearTimeout(viewportPersistTimerRef.current);
        viewportPersistTimerRef.current = null;
      }
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
      if (overlayPersistTimerRef.current !== null) {
        window.clearTimeout(overlayPersistTimerRef.current);
        overlayPersistTimerRef.current = null;
        syncPersistedOverlays();
      }
      chartDom?.removeEventListener("mouseup", persistOverlaysAfterGesture);
      chartDom?.removeEventListener("touchend", persistOverlaysAfterGesture);
      chartDom?.removeEventListener("contextmenu", persistOverlaysAfterGesture);
      resizeObserver.disconnect();
      if (chartContainerRef.current) {
        dispose(chartContainerRef.current);
        chartContainerRef.current.innerHTML = "";
      }
      chartRef.current = null;
    };
  }, [coinId, shouldShowChart, themeName]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart || !shouldShowChart || restoredOverlaySignatureRef.current === chartOverlaySignature) {
      return;
    }

    chart.removeOverlay();
    restoreChartOverlays(chart, chartOverlays, schedulePersistedOverlays, setEditingOverlay);
    restoredOverlaySignatureRef.current = chartOverlaySignature;
  }, [chartOverlaySignature, chartOverlays, shouldShowChart]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart || !shouldShowChart) {
      return;
    }

    const nextSignature = getDataSignature(kLineData);
    const isLiveEdgeUpdate = isSameTimeline(dataSignatureRef.current, nextSignature);
    const isNearRealtime = chart.getOffsetRightDistance() <= 20;

    chart.setSymbol({ ticker: coinId, pricePrecision: 4, volumePrecision: 2 });
    applyChartStyles(chart, themeName, chartStyles);
    if (timeZone) {
      chart.setTimezone(timeZone);
    }
    chart.setPeriod(kLinePeriod);

    if (isLiveEdgeUpdate && !isNearRealtime) {
      return;
    }

    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(kLineData, false);
      },
    });
    chart.resetData();
    dataSignatureRef.current = nextSignature;
    setLayoutVersion((version) => version + 1);
  }, [chartStyles, coinId, kLineData, kLinePeriod, shouldShowChart, themeName, timeZone]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart || !shouldShowChart) {
      return;
    }

    if (chartViewport?.barSpace) {
      chart.setBarSpace(chartViewport.barSpace);
    }
    if (chartViewport?.offsetRightDistance !== undefined) {
      chart.setOffsetRightDistance(chartViewport.offsetRightDistance);
    }
  }, [chartViewport?.barSpace, chartViewport?.offsetRightDistance, shouldShowChart]);

  useEffect(() => {
    const nextIndicators = persistedActiveIndicators ?? [];
    activeIndicatorsRef.current = nextIndicators;
    setActiveIndicators(nextIndicators);
  }, [persistedActiveIndicators]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart || !shouldShowChart) {
      return;
    }

    chart.removeIndicator();

    for (const indicator of activeIndicators) {
      createChartIndicator(chart, indicator);
    }
  }, [activeIndicators, shouldShowChart]);

  function syncPersistedOverlays() {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    //save drawings
    const overlays = serializeChartOverlays(chart);
    restoredOverlaySignatureRef.current = getOverlaySignature(overlays);
    onChartOverlaysChangeRef.current?.(overlays);
  }

  function schedulePersistedOverlays(delayMilliseconds = 40) {
    if (overlayPersistTimerRef.current !== null) {
      window.clearTimeout(overlayPersistTimerRef.current);
    }

    overlayPersistTimerRef.current = window.setTimeout(() => {
      overlayPersistTimerRef.current = null;
      syncPersistedOverlays();
    }, delayMilliseconds);
  }

  function createOverlay(overlayName: KLineOverlayName) {
    chartRef.current?.createOverlay(createPersistentOverlay(overlayName, schedulePersistedOverlays, setEditingOverlay));
  }

  function updateOverlay(nextOverlay: ChartOverlayPreferences) {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    chart.overrideOverlay({
      id: nextOverlay.id,
      name: nextOverlay.name,
      paneId: nextOverlay.paneId,
      points: nextOverlay.points,
      visible: nextOverlay.visible ?? true,
      extendData: nextOverlay.extendData,
      styles: nextOverlay.styles as OverlayCreate["styles"],
    });
    setEditingOverlay(null);
    schedulePersistedOverlays();
  }

  function updateIndicator(nextIndicator: KLineActiveIndicator) {
    const nextIndicators = activeIndicatorsRef.current.map((indicator) =>
      indicator.id === nextIndicator.id ? nextIndicator : indicator,
    );
    activeIndicatorsRef.current = nextIndicators;
    setActiveIndicators(nextIndicators);
    onActiveIndicatorsChangeRef.current?.(nextIndicators);
    setEditingIndicator(null);
  }

  function handleIndicatorFeatureClick(data?: unknown) {
    const event = data as { feature?: { id?: string }; indicator?: Indicator };
    const featureId = event.feature?.id;
    const indicator = event.indicator;
    const chart = chartRef.current;

    if (!chart || !indicator) {
      return;
    }

    if (featureId === "toggle") {
      chart.overrideIndicator({ id: indicator.id, name: indicator.name, visible: !indicator.visible });
      return;
    }

    if (featureId === "remove") {
      chart.removeIndicator({ id: indicator.id });
      setActiveIndicators((currentIndicators) => {
        const nextIndicators = currentIndicators.filter((currentIndicator) => currentIndicator.id !== indicator.id);
        activeIndicatorsRef.current = nextIndicators;
        onActiveIndicatorsChangeRef.current?.(nextIndicators);
        return nextIndicators;
      });
      return;
    }

    if (featureId === "settings") {
      const indicatorName = kLineIndicatorNames.find((name) => name === indicator.name);

      if (!indicatorName) {
        return;
      }

      const matchingIndicator =
        activeIndicatorsRef.current.find((activeIndicator) => activeIndicator.id === indicator.id) ??
        createActiveIndicator(indicatorName);
      setEditingIndicator({
        ...matchingIndicator,
        id: indicator.id,
        name: indicatorName,
        calcParams: (indicator.calcParams as number[]) ?? matchingIndicator.calcParams,
      });
    }
  }

  if (isLoading) {
    return <EmptyState title="Loading live chart" description="" />;
  }

  if (error) {
    return <EmptyState title="Chart data unavailable" description={error.message} />;
  }

  if (candles.length === 0) {
    return <EmptyState title="No candles returned" description="" />;
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute z-10 flex max-w-[calc(100%-24px)] cursor-move flex-wrap gap-1 rounded-panel border border-border/70 bg-panel/90 p-1.5 shadow-sm backdrop-blur-xl"
        onMouseDown={(event) => startToolbarDrag(event, chartToolbarPosition, onChartToolbarPositionChange)}
        style={{
          left: chartToolbarPosition?.x ?? 12,
          top: chartToolbarPosition?.y ?? 92,
        }}
      >
        {kLineOverlayNames.map((overlayName) => (
          <button
            key={overlayName}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded text-text-muted transition hover:bg-accent-soft hover:text-text"
            onClick={() => createOverlay(overlayName)}
            title={overlayName}
            type="button"
          >
            <OverlayIcon overlayName={overlayName} />
          </button>
        ))}
      </div>
      <div
        ref={chartContainerRef}
        className="kline-chart-surface w-full"
        style={{ height }}
        aria-label={`${coinId} KLine chart`}
      />
      <OrderLineLayer
        chart={chartRef.current}
        lines={orderLines}
        layoutVersion={layoutVersion}
        onOrderLineChange={onOrderLineChange}
        onOrderLineDoubleClick={onOrderLineDoubleClick}
      />
      {editingIndicator && (
        <IndicatorSettingsDialog
          indicator={editingIndicator}
          onClose={() => setEditingIndicator(null)}
          onSave={updateIndicator}
        />
      )}
      {editingOverlay && (
        <OverlaySettingsDialog
          overlay={editingOverlay}
          onClose={() => setEditingOverlay(null)}
          onRemove={(overlayId) => {
            chartRef.current?.removeOverlay({ id: overlayId });
            setEditingOverlay(null);
            schedulePersistedOverlays();
          }}
          onSave={updateOverlay}
        />
      )}
    </div>
  );
}

function startToolbarDrag(
  event: ReactMouseEvent<HTMLDivElement>,
  chartToolbarPosition?: ChartToolbarPositionPreferences,
  onChartToolbarPositionChange?: (position: ChartToolbarPositionPreferences) => void,
) {
  if ((event.target as HTMLElement).closest("button")) {
    return;
  }

  event.preventDefault();
  const toolbarElement = event.currentTarget;
  const container = toolbarElement.parentElement?.getBoundingClientRect();
  const toolbar = toolbarElement.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = chartToolbarPosition?.x ?? toolbar.left - (container?.left ?? 0);
  const startTop = chartToolbarPosition?.y ?? toolbar.top - (container?.top ?? 0);
  let nextPosition = { x: startLeft, y: startTop };

  function handleMouseMove(mouseEvent: MouseEvent) {
    const maximumX = Math.max(0, (container?.width ?? 0) - toolbar.width - 8);
    const maximumY = Math.max(0, (container?.height ?? 0) - toolbar.height - 8);
    nextPosition = {
      x: Math.min(maximumX, Math.max(0, startLeft + mouseEvent.clientX - startX)),
      y: Math.min(maximumY, Math.max(0, startTop + mouseEvent.clientY - startY)),
    };
    toolbarElement.style.left = `${nextPosition.x}px`;
    toolbarElement.style.top = `${nextPosition.y}px`;
  }

  function handleMouseUp() {
    onChartToolbarPositionChange?.(nextPosition);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function OrderLineLayer({
  chart,
  lines,
  layoutVersion: _layoutVersion,
  onOrderLineChange,
  onOrderLineDoubleClick,
}: {
  chart: Chart | null;
  lines: ChartOrderLine[];
  layoutVersion: number;
  onOrderLineChange?: (lineId: string, price: number) => void;
  onOrderLineDoubleClick?: (lineId: string) => void;
}) {
  const visibleLines = lines.filter((line) => line.visible && Number.isFinite(line.price));

  if (!chart || visibleLines.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[8]">
      {visibleLines.map((line) => {
        const top = priceToY(chart, line.price);

        if (top === null) {
          return null;
        }

        return (
          <div
            key={line.id}
            className={classNames(
              "pointer-events-auto absolute left-0 right-0 h-0 cursor-row-resize border-t border-dashed",
              line.tone === "selected" ? "border-accent/80" : "border-text-muted/55",
            )}
            onMouseDown={(event) => {
              if (line.draggable) {
                startOrderLineDrag(event, chart, line.id, onOrderLineChange);
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onOrderLineDoubleClick?.(line.id);
            }}
            style={{ top }}
          >
            <span
              className={classNames(
                "absolute -top-3 left-3 rounded bg-panel/95 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm",
                line.tone === "selected" ? "text-accent" : "text-text-muted",
              )}
            >
              {line.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function startOrderLineDrag(
  event: ReactMouseEvent<HTMLDivElement>,
  chart: Chart,
  lineId: string,
  onOrderLineChange?: (lineId: string, price: number) => void,
) {
  event.preventDefault();

  function handleMouseMove(mouseEvent: MouseEvent) {
    const nextPrice = yToPrice(chart, mouseEvent.clientY);

    if (nextPrice !== null) {
      onOrderLineChange?.(lineId, nextPrice);
    }
  }

  function handleMouseUp() {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function priceToY(chart: Chart, price: number) {
  const pixel = chart.convertToPixel({ value: price }, { paneId: "candle_pane" }) as { y?: number };
  return typeof pixel.y === "number" && Number.isFinite(pixel.y) ? pixel.y : null;
}

function yToPrice(chart: Chart, clientY: number) {
  const chartDom = chart.getDom();
  const top = chartDom?.getBoundingClientRect().top ?? 0;
  const value = chart.convertFromPixel([{ x: 0, y: clientY - top }], { paneId: "candle_pane" }) as Array<{ value?: number }>;
  return typeof value[0]?.value === "number" && Number.isFinite(value[0].value) ? value[0].value : null;
}

function createChartIndicator(chart: Chart, indicator: KLineActiveIndicator) {
  //ma on candles
  chart.createIndicator(
    {
      id: indicator.id,
      name: indicator.name,
      calcParams: indicator.calcParams,
    },
    true,
    indicator.name === "MA" ? { id: "candle_pane" } : { id: indicator.id, height: 120 },
  );
}

function restoreChartOverlays(
  chart: Chart,
  overlays: ChartOverlayPreferences[],
  onOverlayChanged: () => void,
  onOverlayEdit: (overlay: ChartOverlayPreferences) => void,
) {
  //reload drawings
  for (const overlay of overlays) {
    chart.createOverlay({
      ...createPersistentOverlay(overlay.name, onOverlayChanged, onOverlayEdit),
      id: overlay.id,
      paneId: overlay.paneId,
      points: overlay.points,
      visible: overlay.visible ?? true,
      extendData: overlay.extendData,
      styles: overlay.styles as OverlayCreate["styles"],
    });
  }
}

function serializeChartOverlays(chart: Chart): ChartOverlayPreferences[] {
  return chart
    .getOverlays()
    .filter((overlay) => overlay.points.length > 0)
    .map((overlay) => ({
      id: overlay.id,
      name: overlay.name,
      paneId: overlay.paneId,
      points: overlay.points.map((point) => ({
        timestamp: point.timestamp,
        value: point.value,
      })),
      visible: overlay.visible,
      extendData: overlay.extendData,
      styles: overlay.styles,
    }));
}

function createPersistentOverlay(
  name: string,
  onOverlayChanged: () => void,
  onOverlayEdit: (overlay: ChartOverlayPreferences) => void,
): OverlayCreate {
  return {
    name,
    lock: false,
    onDrawEnd: onOverlayChanged,
    onPressedMoveEnd: onOverlayChanged,
    onRemoved: onOverlayChanged,
    onDoubleClick: (event) => {
      //open tool settings
      onOverlayEdit(serializeSingleOverlay(event.overlay));
    },
    onRightClick: (event) => {
      event.chart.removeOverlay({ id: event.overlay.id });
      onOverlayChanged();
    },
  };
}

function serializeSingleOverlay(overlay: Overlay): ChartOverlayPreferences {
  return {
    id: overlay.id,
    name: overlay.name,
    paneId: overlay.paneId,
    points: overlay.points.map((point) => ({
      timestamp: point.timestamp,
      value: point.value,
    })),
    visible: overlay.visible,
    extendData: overlay.extendData,
    styles: overlay.styles,
  };
}

function getOverlaySignature(overlays: ChartOverlayPreferences[]) {
  return JSON.stringify(overlays);
}

function OverlaySettingsDialog({
  overlay,
  onClose,
  onRemove,
  onSave,
}: {
  overlay: ChartOverlayPreferences;
  onClose: () => void;
  onRemove: (overlayId: string) => void;
  onSave: (overlay: ChartOverlayPreferences) => void;
}) {
  const overlayStyles = getOverlayStyles(overlay.styles);
  const initialLineStyle = getOverlayLineStyle(overlayStyles);
  const [lineColor, setLineColor] = useState(initialLineStyle.color);
  const [lineWidth, setLineWidth] = useState(String(initialLineStyle.size));
  const [lineStyle, setLineStyle] = useState<LineType>(initialLineStyle.style);
  const [text, setText] = useState(getOverlayTextFromPreference(overlay));
  const supportsText = overlay.name === "simpleAnnotation" || overlay.name === "simpleTag" || text.length > 0;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="grid max-h-[80%] w-[520px] max-w-[calc(100%-32px)] grid-cols-[140px_minmax(0,1fr)] overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
        <aside className="border-r border-border/70 bg-panel-muted/60 p-3 text-xs font-semibold text-text-muted">
          <button className="block w-full rounded bg-accent px-2 py-2 text-left text-white" type="button">
            Style
          </button>
          {supportsText && (
            <button className="mt-1 block w-full rounded px-2 py-2 text-left hover:bg-accent-soft" type="button">
              Text
            </button>
          )}
        </aside>
        <div className="p-4">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <p className="text-sm font-semibold text-text">{overlay.name}</p>
              <p className="text-xs text-text-muted">Drawing settings</p>
            </div>
            <button className="grid h-7 w-7 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
              <span className="text-lg leading-none text-text-muted">x</span>
            </button>
          </div>

          <div className="grid gap-3 py-4">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Color
              <input
                className="h-9 w-full rounded border border-border/70 bg-panel-muted px-2 py-1 outline-none"
                onChange={(event) => setLineColor(event.currentTarget.value)}
                type="color"
                value={lineColor}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Width
              <input
                className="rounded border border-border/70 bg-panel-muted px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                inputMode="decimal"
                onChange={(event) => setLineWidth(event.currentTarget.value)}
                value={lineWidth}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Line Style
              <select
                className="rounded border border-border/70 bg-panel-muted px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                onChange={(event) => setLineStyle(event.currentTarget.value as LineType)}
                value={lineStyle}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
              </select>
            </label>
            {supportsText && (
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                Text
                <input
                  className="rounded border border-border/70 bg-panel-muted px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  onChange={(event) => setText(event.currentTarget.value)}
                  value={text}
                />
              </label>
            )}
          </div>

          <div className="flex justify-between gap-2 border-t border-border/60 pt-3">
            <button
              className="rounded px-3 py-2 text-sm font-semibold text-negative hover:bg-panel-muted"
              onClick={() => onRemove(overlay.id)}
              type="button"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button className="rounded px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white"
                onClick={() =>
                  onSave({
                    ...overlay,
                    extendData: supportsText ? text : overlay.extendData,
                    styles: {
                      ...overlayStyles,
                      line: {
                        ...initialLineStyle,
                        color: lineColor,
                        size: clampOverlayLineWidth(lineWidth),
                        style: lineStyle,
                        dashedValue: lineStyle === "dashed" ? [6, 4] : [],
                      },
                      text: {
                        ...getOverlayTextStyle(overlayStyles),
                        color: lineColor,
                      },
                    },
                  })
                }
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getOverlayStyles(styles: unknown): Record<string, unknown> {
  return styles && typeof styles === "object" ? { ...(styles as Record<string, unknown>) } : {};
}

function getOverlayLineStyle(styles: Record<string, unknown>) {
  const line = styles.line && typeof styles.line === "object" ? (styles.line as Record<string, unknown>) : {};

  return {
    color: typeof line.color === "string" && /^#[0-9a-f]{6}$/i.test(line.color) ? line.color : "#667085",
    size: Number.isFinite(Number(line.size)) ? Number(line.size) : 2,
    style: line.style === "dashed" ? "dashed" : ("solid" as LineType),
    dashedValue: Array.isArray(line.dashedValue) ? line.dashedValue.map(Number).filter(Number.isFinite) : [],
    smooth: typeof line.smooth === "boolean" || typeof line.smooth === "number" ? line.smooth : false,
  };
}

function getOverlayTextStyle(styles: Record<string, unknown>) {
  return styles.text && typeof styles.text === "object" ? (styles.text as Record<string, unknown>) : {};
}

function getOverlayTextFromPreference(overlay: ChartOverlayPreferences) {
  if (typeof overlay.extendData === "string" || typeof overlay.extendData === "number") {
    return String(overlay.extendData);
  }

  if (overlay.extendData && typeof overlay.extendData === "object" && "text" in overlay.extendData) {
    return String((overlay.extendData as { text?: unknown }).text ?? "");
  }

  return "";
}

function clampOverlayLineWidth(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 2;
  }

  return Math.min(8, Math.max(1, numericValue));
}

function IndicatorSettingsDialog({
  indicator,
  onClose,
  onSave,
}: {
  indicator: KLineActiveIndicator;
  onClose: () => void;
  onSave: (indicator: KLineActiveIndicator) => void;
}) {
  const [calcParams, setCalcParams] = useState((indicator.calcParams ?? []).map(String));

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="grid max-h-[80%] w-[520px] max-w-[calc(100%-32px)] grid-cols-[140px_minmax(0,1fr)] overflow-hidden rounded-panel border border-border/70 bg-panel panel-shadow">
        <aside className="border-r border-border/70 bg-panel-muted/60 p-3 text-xs font-semibold text-text-muted">
          <button className="block w-full rounded bg-accent px-2 py-2 text-left text-white" type="button">
            Calculation
          </button>
          <button className="mt-1 block w-full rounded px-2 py-2 text-left hover:bg-accent-soft" type="button">
            Display
          </button>
        </aside>
        <div className="p-4">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <p className="text-sm font-semibold text-text">{indicator.name}</p>
              <p className="text-xs text-text-muted">Indicator settings</p>
            </div>
            <button className="grid h-7 w-7 place-items-center rounded hover:bg-panel-muted" onClick={onClose} type="button">
              <span className="text-lg leading-none text-text-muted">x</span>
            </button>
          </div>

          <div className="grid gap-3 py-4">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Calculation Params</p>
              {calcParams.length === 0 && <p className="text-xs text-text-muted">This indicator does not expose default params.</p>}
              {calcParams.map((calcParam, index) => (
                <div key={`${indicator.id}-${index}`} className="grid grid-cols-[96px_minmax(0,1fr)_28px] items-center gap-2 text-xs text-text-muted">
                  <label htmlFor={`${indicator.id}-${index}`}>Param {index + 1}</label>
                  <input
                    id={`${indicator.id}-${index}`}
                    className="rounded border border-border/70 bg-panel-muted px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setCalcParams((currentParams) =>
                        currentParams.map((currentParam, currentIndex) =>
                          currentIndex === index ? nextValue : currentParam,
                        ),
                      );
                    }}
                    value={calcParam}
                  />
                  <button
                    className="grid h-7 w-7 place-items-center rounded border border-border/70 text-text-muted hover:bg-panel-muted"
                    onClick={() => setCalcParams((currentParams) => currentParams.filter((_param, currentIndex) => currentIndex !== index))}
                    type="button"
                  >
                    -
                  </button>
                </div>
              ))}
              <button
                className="w-fit rounded border border-border/70 px-2 py-1.5 text-xs font-semibold text-text-muted hover:bg-panel-muted"
                onClick={() => setCalcParams((currentParams) => [...currentParams, "9"])}
                type="button"
              >
                Add Param
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            <button className="rounded px-3 py-2 text-sm font-semibold text-text-muted hover:bg-panel-muted" onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white"
              onClick={() =>
                onSave({
                  ...indicator,
                  calcParams: calcParams.map(Number).filter((value) => Number.isFinite(value) && value > 0),
                })
              }
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function applyChartStyles(
  chart: Chart,
  themeName: string,
  chartStyles: ChartStylePreferences | undefined,
) {
  chart.setStyles(themeName === "cupertino-dark" ? "dark" : "light");
  const styleOverrides = {
    indicator: {
      tooltip: {
        features: indicatorTooltipFeatures,
      },
    },
    ...(chartStyles
      ? {
          grid: {
            show: chartStyles.gridVisible,
            horizontal: {
              show: chartStyles.gridVisible,
              color: chartStyles.gridColor,
              style: chartStyles.gridStyle,
            },
            vertical: {
              show: chartStyles.gridVisible,
              color: chartStyles.gridColor,
              style: chartStyles.gridStyle,
            },
          },
          candle: {
            type: chartStyles.candleType,
            bar: {
              upColor: chartStyles.upColor,
              downColor: chartStyles.downColor,
              upBorderColor: chartStyles.upColor,
              downBorderColor: chartStyles.downColor,
              upWickColor: chartStyles.upColor,
              downWickColor: chartStyles.downColor,
            },
            priceMark: {
              last: {
                show: chartStyles.lastPriceLineVisible,
                line: {
                  show: chartStyles.lastPriceLineVisible,
                },
              },
            },
          },
          crosshair: {
            show: chartStyles.crosshairVisible,
          },
        }
      : {}),
  };
  chart.setStyles(styleOverrides);
}

function getDataSignature(kLineData: KLineData[]) {
  if (kLineData.length === 0) {
    return "0";
  }

  const firstTimestamp = kLineData[0]?.timestamp ?? 0;
  const lastTimestamp = kLineData[kLineData.length - 1]?.timestamp ?? 0;
  const lastClose = kLineData[kLineData.length - 1]?.close ?? 0;

  return `${kLineData.length}:${firstTimestamp}:${lastTimestamp}:${lastClose}`;
}

function isSameTimeline(previousSignature: string, nextSignature: string) {
  const previousParts = previousSignature.split(":");
  const nextParts = nextSignature.split(":");

  return (
    previousParts.length === 4 &&
    nextParts.length === 4 &&
    previousParts[0] === nextParts[0] &&
    previousParts[1] === nextParts[1] &&
    previousParts[2] === nextParts[2]
  );
}

function OverlayIcon({ overlayName }: { overlayName: KLineOverlayName }) {
  return (
    <svg aria-hidden="true" className="h-[17px] w-[17px]" viewBox="0 0 24 24">
      <path d={overlayIconPaths[overlayName] ?? overlayIconPaths.segment} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

const indicatorFeatureColor = "#667085";
const indicatorTooltipFeatures: TooltipFeatureStyle[] = [
  createTooltipFeature("toggle", "M1 7 C3 3 11 3 13 7 C11 11 3 11 1 7 M7 5 C8.1 5 9 5.9 9 7 C9 8.1 8.1 9 7 9 C5.9 9 5 8.1 5 7 C5 5.9 5.9 5 7 5"),
  createTooltipFeature("settings", "M7 2 L8 2.5 L9 2 L10 4 L9.5 5 L10 6 L12 7 L10 8 L9.5 9 L10 10 L9 12 L8 11.5 L7 12 L6 11.5 L5 12 L4 10 L4.5 9 L4 8 L2 7 L4 6 L4.5 5 L4 4 L5 2 L6 2.5 L7 2 M7 5 C8.1 5 9 5.9 9 7 C9 8.1 8.1 9 7 9 C5.9 9 5 8.1 5 7 C5 5.9 5.9 5 7 5"),
  createTooltipFeature("remove", "M3 3 L11 11 M11 3 L3 11"),
];

function createTooltipFeature(id: string, path: string): TooltipFeatureStyle {
  return {
    id,
    position: "middle",
    marginLeft: 4,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    paddingLeft: 1,
    paddingTop: 1,
    paddingRight: 1,
    paddingBottom: 1,
    backgroundColor: "transparent",
    activeBackgroundColor: "rgba(102, 112, 133, 0.12)",
    size: 14,
    color: indicatorFeatureColor,
    activeColor: "#006bd6",
    borderRadius: 3,
    type: "path",
    content: {
      path,
      style: "stroke",
      lineWidth: 1.8,
    },
  };
}

const overlayIconPaths: Partial<Record<KLineOverlayName, string>> = {
  fibonacciLine: "M4 6h16M7 10h13M4 14h16M9 18h11",
  horizontalRayLine: "M4 12h14m-4-4 4 4-4 4",
  horizontalSegment: "M5 12h14M5 9v6M19 9v6",
  horizontalStraightLine: "M3 12h18",
  parallelStraightLine: "M5 9l14-4M5 19l14-4",
  priceChannelLine: "M5 8l14-4M5 16l14-4M7 20l10-3",
  priceLine: "M4 8h9l5 4-5 4H4V8Zm10 4h.01",
  rayLine: "M5 18 17 6m-1 6 1-6-6 1",
  segment: "M5 17 19 7M5 17h.01M19 7h.01",
  straightLine: "M4 18 20 6",
  verticalRayLine: "M12 20V6m-4 4 4-4 4 4",
  verticalSegment: "M12 5v14M9 5h6M9 19h6",
  verticalStraightLine: "M12 3v18",
  simpleAnnotation: "M5 18h4L19 8l-4-4L5 14v4Zm9-12 4 4",
  simpleTag: "M4 6v6l7 7 7-7-7-7H4Zm4 4h.01",
};
