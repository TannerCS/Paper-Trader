import { useEffect, useMemo, useRef } from "react";
import type { LiveMarketTrade } from "../../data/exchanges/liveMarketStream";
import { formatCurrency, formatDateTime, formatNumber } from "../../lib/format";
import { classNames } from "../../lib/classNames";

interface PurchaseBookProps {
  trades: LiveMarketTrade[];
  currency: string;
  marketId: string;
  muted: boolean;
}

interface PendingAudioTrade {
  side: LiveMarketTrade["side"];
  notional: number;
  intensity: number;
}

let toneModulePromise: Promise<typeof import("tone")> | null = null;
let audioGateTimer: number | null = null;
let pendingAudioTrades: PendingAudioTrade[] = [];

export function PurchaseBook({ currency, marketId, muted, trades }: PurchaseBookProps) {
  const playedTradeIdsRef = useRef(new Set<string>());
  const hasSeenInitialTradesRef = useRef(false);
  const maxVisibleNotional = useMemo(
    () => Math.max(1, ...trades.slice(0, 80).map((trade) => trade.notional)),
    [trades],
  );

  useEffect(() => {
    playedTradeIdsRef.current = new Set();
    hasSeenInitialTradesRef.current = false;
  }, [marketId]);

  useEffect(() => {
    if (trades.length === 0) {
      return;
    }

    if (!hasSeenInitialTradesRef.current) {
      hasSeenInitialTradesRef.current = true;
      playedTradeIdsRef.current = new Set(trades.map((trade) => trade.id));
      return;
    }

    if (muted) {
      return;
    }

    const newestTrades = trades
      .filter((trade) => !playedTradeIdsRef.current.has(trade.id))
      .slice(0, 12);

    for (const trade of newestTrades) {
      playedTradeIdsRef.current.add(trade.id);
      const intensity = getTradeIntensity(trade.notional, maxVisibleNotional);

      if (intensity >= 0.24) {
        queueTradeSound({ side: trade.side, notional: trade.notional, intensity });
      }
    }

    if (playedTradeIdsRef.current.size > 500) {
      playedTradeIdsRef.current = new Set([...playedTradeIdsRef.current].slice(-250));
    }
  }, [maxVisibleNotional, muted, trades]);

  if (trades.length === 0) {
    return (
      <div className="grid h-full place-items-center text-xs font-semibold text-text-muted">
        Waiting for trades
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="grid h-8 grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-border/60 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>
      <div className="h-[calc(100%-2rem)] overflow-y-auto">
        {trades.map((trade) => {
          const intensity = getTradeIntensity(trade.notional, maxVisibleNotional);
          const rowStyle = getTradeRowStyle(trade.side, intensity);

          return (
            <div
              key={trade.id}
              className="grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-border/35 px-2 py-1.5 text-xs"
              style={rowStyle}
              title={`${formatDateTime(trade.tradedAt)} | ${formatCurrency(trade.notional, currency)}`}
            >
              <span
                className={classNames(
                  "font-semibold",
                  trade.side === "buy" ? "text-positive" : "text-negative",
                )}
              >
                {trade.side === "buy" ? "Buy" : "Sell"}
              </span>
              <span className="truncate text-right font-semibold text-text">
                {formatCurrency(trade.price, currency)}
              </span>
              <span className="truncate text-right text-text-muted">
                {formatNumber(trade.quantity)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTradeIntensity(notional: number, maxNotional: number) {
  const numerator = Math.log10(Math.max(1, notional));
  const denominator = Math.log10(Math.max(10, maxNotional));
  return Math.min(1, Math.max(0, numerator / denominator));
}

function getTradeRowStyle(side: LiveMarketTrade["side"], intensity: number) {
  if (intensity < 0.2) {
    return undefined;
  }

  const opacity = Math.min(0.72, Math.max(0, (intensity - 0.2) * 0.9));
  const color = side === "buy" ? `48, 209, 88` : `255, 59, 92`;

  return {
    background: `linear-gradient(90deg, rgba(${color}, ${opacity}) 0%, rgba(${color}, ${opacity * 0.18}) 70%, transparent 100%)`,
  };
}

function queueTradeSound(trade: PendingAudioTrade) {
  pendingAudioTrades.push(trade);

  if (audioGateTimer !== null) {
    return;
  }

  audioGateTimer = window.setTimeout(() => {
    const selectedTrade = pendingAudioTrades
      .sort((leftTrade, rightTrade) => rightTrade.notional - leftTrade.notional)[0];
    pendingAudioTrades = [];
    audioGateTimer = null;

    if (selectedTrade) {
      void playTradeSound(selectedTrade).catch(() => undefined);
    }
  }, 50);
}

async function playTradeSound({ intensity, side }: PendingAudioTrade) {
  toneModulePromise ??= import("tone");
  const Tone = await toneModulePromise;

  if (Tone.getContext().state !== "running") {
    await Tone.start();
  }

  const isBuy = side === "buy";
  const frequency = isBuy ? 600 + 280 * intensity : 300 + 140 * intensity;
  const duration = 0.05 + 0.25 * intensity;
  const volume = -34 + 28 * intensity;
  const synth = new Tone.Synth({
    oscillator: { type: isBuy ? "sine" : "triangle" },
    envelope: {
      attack: 0.004,
      decay: duration,
      sustain: 0,
      release: 0.02 + duration * 0.4,
    },
    volume,
  }).toDestination();

  synth.triggerAttackRelease(frequency, duration);
  window.setTimeout(() => synth.dispose(), Math.ceil((duration + 0.2) * 1000));
}
