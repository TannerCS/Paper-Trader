import { useEffect, useState } from "react";
import type { MarketDataSettings } from "../../settings/marketDataSettings";
import type { MarketDataProviderId } from "../../types/marketData";
import { providerGetJson } from "../http/providerHttp";
import { marketEngine } from "../marketEngine";
import { tradeTapeRepository } from "../storage/tradeTapeRepository";
import { rememberExchangeHeartbeat } from "../exchangeHealth";

type LiveProvider = MarketDataProviderId;

export interface LiveMarketTick {
  price: number | null;
  priceChangePercentage24h: number | null;
  updatedAt: string | null;
  connected: boolean;
}

export interface LiveMarketTrade {
  id: string;
  exchange?: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  notional: number;
  tradedAt: string;
}

export function useLiveMarketTick(settings: MarketDataSettings | undefined, assetId: string | undefined): LiveMarketTick {
  const [tick, setTick] = useState<LiveMarketTick>({
    price: null,
    priceChangePercentage24h: null,
    updatedAt: null,
    connected: false,
  });

  useEffect(() => {
    if (!settings || !assetId) {
      return;
    }

    const marketIdentity = resolveLiveMarketIdentity(settings.provider, assetId);
    setTick({ price: null, priceChangePercentage24h: null, updatedAt: null, connected: false });

    if (marketIdentity.provider === "coinbase") {
      return subscribeCoinbase(marketIdentity.symbol, assetId, setTick);
    }

    if (marketIdentity.provider === "bybit") {
      return subscribeBybit(marketIdentity.symbol, assetId, setTick);
    }

    if (marketIdentity.provider === "okx") {
      return subscribeOkx(marketIdentity.symbol, assetId, setTick);
    }

    if (marketIdentity.provider === "mexc") {
      return subscribeMexc(marketIdentity.symbol, assetId, setTick);
    }

    return subscribeBinanceUs(marketIdentity.symbol, assetId, setTick);
  }, [assetId, settings]);

  return tick;
}

export function useLiveMarketTrades(settings: MarketDataSettings | undefined, assetId: string | undefined) {
  const [trades, setTrades] = useState<LiveMarketTrade[]>([]);

  useEffect(() => {
    if (!settings || !assetId) {
      return;
    }

    const marketIdentity = resolveLiveMarketIdentity(settings.provider, assetId);
    const currentAssetId = assetId;
    let cancelled = false;
    let pendingTrades: LiveMarketTrade[] = [];
    let flushTimer: number | null = null;

    //load tape first
    void hydrateTradeHistory();

    async function hydrateTradeHistory() {
      const cachedTrades = await tradeTapeRepository.getTrades({ exchange: marketIdentity.exchange, assetId: currentAssetId });

      if (cancelled) {
        return;
      }

      setTrades(cachedTrades);

      try {
        const recentTrades = await getRecentMarketTrades(marketIdentity.provider, marketIdentity.symbol);

        if (cancelled || recentTrades.length === 0) {
          return;
        }

        const enrichedTrades = recentTrades.map((trade) => ({ ...trade, exchange: marketIdentity.exchange }));
        const mergedTrades = mergeMarketTrades(enrichedTrades, cachedTrades).slice(0, 120);
        setTrades(mergedTrades);
        await tradeTapeRepository.saveTrades({ exchange: marketIdentity.exchange, assetId: currentAssetId, trades: enrichedTrades });
      } catch {
        //cache fallback
      }
    }

    const handleTrade = (trade: LiveMarketTrade) => {
      const enrichedTrade = { ...trade, exchange: marketIdentity.exchange };
      pendingTrades = [enrichedTrade, ...pendingTrades].slice(0, 100);
      setTrades((currentTrades) => [enrichedTrade, ...currentTrades].slice(0, 120));

      //batch tape writes
      if (flushTimer === null) {
        flushTimer = window.setTimeout(() => {
          const tradesToSave = pendingTrades;
          pendingTrades = [];
          flushTimer = null;
          void tradeTapeRepository.saveTrades({ exchange: marketIdentity.exchange, assetId, trades: tradesToSave });
        }, 1000);
      }
    };

    const unsubscribe =
      marketIdentity.provider === "coinbase"
        ? subscribeCoinbaseTrades(marketIdentity.symbol, handleTrade)
        : marketIdentity.provider === "bybit"
          ? subscribeBybitTrades(marketIdentity.symbol, handleTrade)
          : marketIdentity.provider === "okx"
            ? subscribeOkxTrades(marketIdentity.symbol, handleTrade)
            : marketIdentity.provider === "mexc"
              ? subscribeMexcTrades(marketIdentity.symbol, handleTrade)
              : subscribeBinanceUsTrades(marketIdentity.symbol, handleTrade);

    return () => {
      cancelled = true;
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
      }
      void tradeTapeRepository.saveTrades({ exchange: marketIdentity.exchange, assetId: currentAssetId, trades: pendingTrades });
      unsubscribe();
    };
  }, [assetId, settings]);

  return trades;
}

async function getRecentMarketTrades(provider: LiveProvider, symbol: string): Promise<LiveMarketTrade[]> {
  if (provider === "binanceus") {
    const rows = await providerGetJson<BinanceRecentTrade[]>(
      `https://api.binance.us/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=100`,
    );
    return rows.map(mapBinanceRecentTrade).filter(isLiveMarketTrade);
  }

  if (provider === "okx") {
    const response = await providerGetJson<{ data?: OkxRecentTrade[] }>(
      `https://www.okx.com/api/v5/market/trades?instId=${encodeURIComponent(symbol)}&limit=100`,
    );
    return (response.data ?? []).map(mapOkxRecentTrade).filter(isLiveMarketTrade);
  }

  if (provider === "mexc") {
    const rows = await providerGetJson<MexcRecentTrade[]>(
      `https://api.mexc.com/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=100`,
    );
    return rows.map(mapMexcRecentTrade).filter(isLiveMarketTrade);
  }

  if (provider === "coinbase") {
    const response = await providerGetJson<{ trades?: CoinbaseRecentTrade[] }>(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(symbol)}/ticker?limit=100`,
    );
    return (response.trades ?? []).map(mapCoinbaseRecentTrade).filter(isLiveMarketTrade);
  }

  return [];
}

interface BinanceRecentTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty?: string;
  time: number;
  isBuyerMaker: boolean;
}

interface OkxRecentTrade {
  tradeId: string;
  side: string;
  px: string;
  sz: string;
  ts: string;
}

interface MexcRecentTrade {
  id: number | string;
  price: string;
  qty: string;
  quoteQty?: string;
  time: number;
  isBuyerMaker?: boolean;
}

interface CoinbaseRecentTrade {
  trade_id?: string;
  tradeId?: string;
  side?: string;
  price?: string;
  size?: string;
  time?: string;
}

function mapBinanceRecentTrade(row: BinanceRecentTrade): LiveMarketTrade | null {
  const price = numericOrNull(row.price);
  const quantity = numericOrNull(row.qty);

  if (!price || !quantity) {
    return null;
  }

  return {
    id: String(row.id),
    side: row.isBuyerMaker ? "sell" : "buy",
    price,
    quantity,
    notional: numericOrNull(row.quoteQty) ?? price * quantity,
    tradedAt: new Date(Number(row.time) || Date.now()).toISOString(),
  };
}

function mapOkxRecentTrade(row: OkxRecentTrade): LiveMarketTrade | null {
  const price = numericOrNull(row.px);
  const quantity = numericOrNull(row.sz);

  if (!price || !quantity) {
    return null;
  }

  return {
    id: String(row.tradeId ?? `${row.ts}-${price}-${quantity}`),
    side: String(row.side).toLowerCase() === "sell" ? "sell" : "buy",
    price,
    quantity,
    notional: price * quantity,
    tradedAt: new Date(Number(row.ts) || Date.now()).toISOString(),
  };
}

function mapMexcRecentTrade(row: MexcRecentTrade): LiveMarketTrade | null {
  const price = numericOrNull(row.price);
  const quantity = numericOrNull(row.qty);

  if (!price || !quantity) {
    return null;
  }

  return {
    id: String(row.id),
    side: row.isBuyerMaker ? "sell" : "buy",
    price,
    quantity,
    notional: numericOrNull(row.quoteQty) ?? price * quantity,
    tradedAt: new Date(Number(row.time) || Date.now()).toISOString(),
  };
}

function mapCoinbaseRecentTrade(row: CoinbaseRecentTrade): LiveMarketTrade | null {
  const price = numericOrNull(row.price);
  const quantity = numericOrNull(row.size);

  if (!price || !quantity) {
    return null;
  }

  return {
    id: String(row.trade_id ?? row.tradeId ?? `${row.time ?? Date.now()}-${price}-${quantity}`),
    side: String(row.side).toLowerCase() === "sell" ? "sell" : "buy",
    price,
    quantity,
    notional: price * quantity,
    tradedAt: typeof row.time === "string" ? row.time : new Date().toISOString(),
  };
}

function mergeMarketTrades(nextTrades: LiveMarketTrade[], existingTrades: LiveMarketTrade[]) {
  const tradeMap = new Map<string, LiveMarketTrade>();

  for (const trade of [...nextTrades, ...existingTrades]) {
    tradeMap.set(trade.id, trade);
  }

  return [...tradeMap.values()].sort(
    (leftTrade, rightTrade) => new Date(rightTrade.tradedAt).getTime() - new Date(leftTrade.tradedAt).getTime(),
  );
}

function isLiveMarketTrade(value: LiveMarketTrade | null): value is LiveMarketTrade {
  return value !== null;
}

function subscribeBinanceUs(symbol: string, assetId: string, setTick: (tick: LiveMarketTick) => void) {
  return subscribeWithBackoff({
    provider: "binanceus",
    connect: () => {
      const websocket = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol.toLowerCase()}@ticker`);

      websocket.onopen = () => {
        emitMarketHeartbeat();
        setTick({ price: null, priceChangePercentage24h: null, updatedAt: null, connected: true });
      };

      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const price = numericOrNull(message?.c);
        const priceChangePercentage24h = numericOrNull(message?.P);

        if (price) {
          void marketEngine.processMarketTick({ assetId, currentPrice: price });
          setTick({ price, priceChangePercentage24h, updatedAt: new Date().toISOString(), connected: true });
        }
      };

      return websocket;
    },
    setTick,
  });
}

function subscribeBinanceUsTrades(symbol: string, onTrade: (trade: LiveMarketTrade) => void) {
  return subscribeWithBackoff({
    provider: "binanceus",
    connect: () => {
      const websocket = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol.toLowerCase()}@aggTrade`);

      websocket.onopen = () => emitMarketHeartbeat();
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const price = numericOrNull(message?.p);
        const quantity = numericOrNull(message?.q);

        if (!price || !quantity) {
          return;
        }

        onTrade({
          id: String(message?.a ?? `${message?.T ?? Date.now()}-${price}-${quantity}`),
          side: message?.m ? "sell" : "buy",
          price,
          quantity,
          notional: price * quantity,
          tradedAt: new Date(Number(message?.T) || Date.now()).toISOString(),
        });
      };

      return websocket;
    },
  });
}

function subscribeCoinbase(symbol: string, assetId: string, setTick: (tick: LiveMarketTick) => void) {
  return subscribeWithBackoff({
    provider: "coinbase",
    connect: () => {
      const websocket = new WebSocket("wss://advanced-trade-ws.coinbase.com");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ type: "subscribe", product_ids: [symbol], channel: "ticker" }));
        websocket.send(JSON.stringify({ type: "subscribe", product_ids: [symbol], channel: "heartbeats" }));
      };

      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const ticker = message?.events?.flatMap((eventItem: { tickers?: unknown[] }) => eventItem.tickers ?? [])[0] as
          | Record<string, unknown>
          | undefined;
        const price = numericOrNull(ticker?.price ?? ticker?.best_bid ?? ticker?.best_ask);

        if (price) {
          void marketEngine.processMarketTick({ assetId, currentPrice: price });
          setTick({ price, priceChangePercentage24h: null, updatedAt: new Date().toISOString(), connected: true });
        }
      };

      return websocket;
    },
    setTick,
  });
}

function subscribeCoinbaseTrades(symbol: string, onTrade: (trade: LiveMarketTrade) => void) {
  return subscribeWithBackoff({
    provider: "coinbase",
    connect: () => {
      const websocket = new WebSocket("wss://advanced-trade-ws.coinbase.com");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ type: "subscribe", product_ids: [symbol], channel: "market_trades" }));
        websocket.send(JSON.stringify({ type: "subscribe", product_ids: [symbol], channel: "heartbeats" }));
      };

      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const marketTrades = message?.events?.flatMap((eventItem: { trades?: unknown[] }) => eventItem.trades ?? []) ?? [];

        for (const trade of marketTrades as Array<Record<string, unknown>>) {
          const price = numericOrNull(trade.price);
          const quantity = numericOrNull(trade.size);

          if (!price || !quantity) {
            continue;
          }

          onTrade({
            id: String(trade.trade_id ?? `${trade.time ?? Date.now()}-${price}-${quantity}`),
            side: String(trade.side).toLowerCase() === "sell" ? "sell" : "buy",
            price,
            quantity,
            notional: price * quantity,
            tradedAt: typeof trade.time === "string" ? trade.time : new Date().toISOString(),
          });
        }
      };

      return websocket;
    },
  });
}

function subscribeBybit(symbol: string, assetId: string, setTick: (tick: LiveMarketTick) => void) {
  return subscribeWithBackoff({
    provider: "bybit",
    connect: () => {
      const websocket = new WebSocket("wss://stream.bybit.com/v5/public/spot");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ op: "subscribe", args: [`tickers.${symbol}`] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const price = numericOrNull(message?.data?.lastPrice);
        const priceChangePercentage24h = numericOrNull(message?.data?.price24hPcnt);

        if (price) {
          void marketEngine.processMarketTick({ assetId, currentPrice: price });
          setTick({
            price,
            priceChangePercentage24h: priceChangePercentage24h === null ? null : priceChangePercentage24h * 100,
            updatedAt: new Date().toISOString(),
            connected: true,
          });
        }
      };
      return websocket;
    },
    setTick,
  });
}

function subscribeBybitTrades(symbol: string, onTrade: (trade: LiveMarketTrade) => void) {
  return subscribeWithBackoff({
    provider: "bybit",
    connect: () => {
      const websocket = new WebSocket("wss://stream.bybit.com/v5/public/spot");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ op: "subscribe", args: [`publicTrade.${symbol}`] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const rows = Array.isArray(message?.data) ? message.data : [];

        for (const row of rows as Array<Record<string, unknown>>) {
          const price = numericOrNull(row.p);
          const quantity = numericOrNull(row.v);

          if (!price || !quantity) {
            continue;
          }

          onTrade({
            id: String(row.i ?? `${row.T ?? Date.now()}-${price}-${quantity}`),
            side: String(row.S).toLowerCase() === "sell" ? "sell" : "buy",
            price,
            quantity,
            notional: price * quantity,
            tradedAt: new Date(Number(row.T) || Date.now()).toISOString(),
          });
        }
      };
      return websocket;
    },
  });
}

function subscribeOkx(symbol: string, assetId: string, setTick: (tick: LiveMarketTick) => void) {
  return subscribeWithBackoff({
    provider: "okx",
    connect: () => {
      const websocket = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: symbol }] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const row = Array.isArray(message?.data) ? message.data[0] : null;
        const price = numericOrNull(row?.last);
        const open24h = numericOrNull(row?.open24h);

        if (price) {
          void marketEngine.processMarketTick({ assetId, currentPrice: price });
          setTick({
            price,
            priceChangePercentage24h: price && open24h ? ((price - open24h) / open24h) * 100 : null,
            updatedAt: new Date().toISOString(),
            connected: true,
          });
        }
      };
      return websocket;
    },
    setTick,
  });
}

function subscribeOkxTrades(symbol: string, onTrade: (trade: LiveMarketTrade) => void) {
  return subscribeWithBackoff({
    provider: "okx",
    connect: () => {
      const websocket = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ op: "subscribe", args: [{ channel: "trades", instId: symbol }] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const rows = Array.isArray(message?.data) ? message.data : [];

        for (const row of rows as Array<Record<string, unknown>>) {
          const price = numericOrNull(row.px);
          const quantity = numericOrNull(row.sz);

          if (!price || !quantity) {
            continue;
          }

          onTrade({
            id: String(row.tradeId ?? `${row.ts ?? Date.now()}-${price}-${quantity}`),
            side: String(row.side).toLowerCase() === "sell" ? "sell" : "buy",
            price,
            quantity,
            notional: price * quantity,
            tradedAt: new Date(Number(row.ts) || Date.now()).toISOString(),
          });
        }
      };
      return websocket;
    },
  });
}

function subscribeMexc(symbol: string, assetId: string, setTick: (tick: LiveMarketTick) => void) {
  return subscribeWithBackoff({
    provider: "mexc",
    connect: () => {
      const websocket = new WebSocket("wss://wbs-api.mexc.com/ws");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ method: "SUBSCRIPTION", params: [`spot@public.miniTicker.v3.api@${symbol}`] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const payload = message?.d ?? message;
        const price = numericOrNull(payload?.p ?? payload?.c);
        const priceChangePercentage24h = numericOrNull(payload?.r);

        if (price) {
          void marketEngine.processMarketTick({ assetId, currentPrice: price });
          setTick({
            price,
            priceChangePercentage24h: priceChangePercentage24h === null ? null : priceChangePercentage24h * 100,
            updatedAt: new Date().toISOString(),
            connected: true,
          });
        }
      };
      return websocket;
    },
    setTick,
  });
}

function subscribeMexcTrades(symbol: string, onTrade: (trade: LiveMarketTrade) => void) {
  return subscribeWithBackoff({
    provider: "mexc",
    connect: () => {
      const websocket = new WebSocket("wss://wbs-api.mexc.com/ws");

      websocket.onopen = () => {
        emitMarketHeartbeat();
        websocket.send(JSON.stringify({ method: "SUBSCRIPTION", params: [`spot@public.aggre.deals.v3.api@${symbol}`] }));
      };
      websocket.onmessage = (event) => {
        emitMarketHeartbeat();
        const message = safeJson(event.data);
        const deals = message?.d?.deals ?? [];

        for (const row of deals as Array<Record<string, unknown>>) {
          const price = numericOrNull(row.p);
          const quantity = numericOrNull(row.v);

          if (!price || !quantity) {
            continue;
          }

          onTrade({
            id: String(row.t ?? `${Date.now()}-${price}-${quantity}`),
            side: String(row.S ?? row.s).toLowerCase() === "2" || String(row.S ?? row.s).toLowerCase() === "sell" ? "sell" : "buy",
            price,
            quantity,
            notional: price * quantity,
            tradedAt: new Date(Number(row.t) || Date.now()).toISOString(),
          });
        }
      };
      return websocket;
    },
  });
}

function subscribeWithBackoff({
  provider,
  connect,
  setTick,
}: {
  provider: LiveProvider;
  connect: () => WebSocket;
  setTick?: (tick: LiveMarketTick) => void;
}) {
  let websocket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let manuallyClosed = false;
  let reconnectAttempt = 0;

  function connectWhenAllowed() {
    //wait for cooldown
    const delayMilliseconds = getWebSocketCooldownDelay(provider);
    reconnectTimer = window.setTimeout(() => {
      if (manuallyClosed) {
        return;
      }

      try {
        websocket = connect();
      } catch {
        scheduleReconnect();
        return;
      }

      const currentWebsocket = websocket;
      const originalOpen = currentWebsocket.onopen;
      const originalClose = currentWebsocket.onclose;
      const originalError = currentWebsocket.onerror;
      const recordHeartbeat = () => emitMarketHeartbeat(provider);

      currentWebsocket.onopen = (event) => {
        reconnectAttempt = 0;
        recordHeartbeat();
        originalOpen?.call(currentWebsocket, event);
      };

      currentWebsocket.addEventListener("message", recordHeartbeat);

      currentWebsocket.onerror = (event) => {
        originalError?.call(currentWebsocket, event);
        currentWebsocket.close();
      };

      currentWebsocket.onclose = (event) => {
        currentWebsocket.removeEventListener("message", recordHeartbeat);
        setTick?.({ price: null, priceChangePercentage24h: null, updatedAt: null, connected: false });
        originalClose?.call(currentWebsocket, event);

        if (!manuallyClosed) {
          scheduleReconnect();
        }
      };
    }, delayMilliseconds);
  }

  function scheduleReconnect() {
    reconnectAttempt += 1;
    //slow reconnects
    const delayMilliseconds = getReconnectDelayMilliseconds(reconnectAttempt);
    rememberWebSocketCooldown(provider, Date.now() + delayMilliseconds);
    connectWhenAllowed();
  }

  connectWhenAllowed();

  return () => {
    manuallyClosed = true;

    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
    }

    websocket?.close();
  };
}

function resolveLiveMarketIdentity(settingsProvider: MarketDataProviderId, assetId: string) {
  const [maybeProvider, ...symbolParts] = assetId.split(":");
  const provider = isLiveProvider(maybeProvider) && symbolParts.length > 0 ? maybeProvider : settingsProvider;
  const symbol = symbolParts.length > 0 ? symbolParts.join(":") : assetId;

  return {
    provider,
    symbol,
    exchange: exchangeLabel(provider),
  };
}

function isLiveProvider(value: string): value is LiveProvider {
  return ["binanceus", "coinbase", "okx", "mexc", "phemex", "bybit"].includes(value);
}

function exchangeLabel(provider: LiveProvider) {
  if (provider === "coinbase") return "Coinbase";
  if (provider === "okx") return "OKX";
  if (provider === "mexc") return "MEXC";
  if (provider === "phemex") return "Phemex";
  if (provider === "bybit") return "Bybit";
  return "Binance.US";
}

function emitMarketHeartbeat(provider?: LiveProvider) {
  const timestamp = Date.now();

  if (provider) {
    rememberExchangeHeartbeat(provider, timestamp);
  }

  window.dispatchEvent(new CustomEvent("paper-trader:market-heartbeat", { detail: { at: timestamp, provider } }));
}

function safeJson(payload: unknown) {
  if (typeof payload !== "string") {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function numericOrNull(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getReconnectDelayMilliseconds(attempt: number) {
  const baseDelay = 15_000;
  const maximumDelay = 5 * 60_000;
  const jitter = Math.round(Math.random() * 5000);
  return Math.min(maximumDelay, baseDelay * 2 ** Math.min(5, attempt - 1)) + jitter;
}

function getWebSocketCooldownDelay(provider: LiveProvider) {
  const cooldownUntil = Number(globalThis.localStorage?.getItem(getWebSocketCooldownKey(provider)));
  return Number.isFinite(cooldownUntil) ? Math.max(0, cooldownUntil - Date.now()) : 0;
}

function rememberWebSocketCooldown(provider: LiveProvider, cooldownUntil: number) {
  globalThis.localStorage?.setItem(getWebSocketCooldownKey(provider), String(cooldownUntil));
}

function getWebSocketCooldownKey(provider: LiveProvider) {
  return `paper-trader.websocket-cooldown.${provider}`;
}
