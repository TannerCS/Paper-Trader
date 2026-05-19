import {
  cancelPaperOrder,
  closePaperOrder,
  placePaperOrder,
  processOpenPaperOrders,
  togglePaperOrderChartVisibility,
  updatePaperOrder,
  updatePaperOrderRiskLimits,
} from "./paper/paperTradingEngine";
import { paperTradingRepository } from "./paper/paperTradingRepository";
import { marketRepository } from "./storage/marketRepository";
import type { PaperLedger, PaperMarketTick, PlacePaperOrderInput, UpdatePaperOrderInput } from "./paper/types";
import type { CoinMarket, MarketDataProviderId } from "../types/marketData";

type LedgerListener = (ledger: PaperLedger) => void;

class MarketEngine {
  private ledgerListeners = new Set<LedgerListener>();
  private mutationQueue: Promise<unknown> = Promise.resolve();

  getLedger() {
    return paperTradingRepository.getLedger();
  }

  subscribeLedger(listener: LedgerListener) {
    this.ledgerListeners.add(listener);
    return () => {
      this.ledgerListeners.delete(listener);
    };
  }

  placeOrder(input: PlacePaperOrderInput) {
    return this.mutateLedger((ledger) => placePaperOrder(ledger, input));
  }

  processMarketTick(tick: PaperMarketTick) {
    return this.mutateLedger((ledger) => processOpenPaperOrders(ledger, tick), { skipSaveWhenUnchanged: true });
  }

  processMarketTicks(ticks: PaperMarketTick[]) {
    return this.mutateLedger(
      (ledger) => ticks.reduce((nextLedger, tick) => processOpenPaperOrders(nextLedger, tick), ledger),
      { skipSaveWhenUnchanged: true },
    );
  }

  async saveMarketSnapshot({
    provider,
    currency,
    markets,
  }: {
    provider: MarketDataProviderId;
    currency: string;
    markets: CoinMarket[];
  }) {
    await marketRepository.saveMarkets({ provider, currency, markets });
    const ticks = markets
      .filter((market): market is CoinMarket & { currentPrice: number } => typeof market.currentPrice === "number")
      .map((market) => ({ assetId: market.id, currentPrice: market.currentPrice }));

    if (ticks.length > 0) {
      await this.processMarketTicks(ticks);
    }
  }

  cancelOrder(orderId: string) {
    return this.mutateLedger((ledger) => cancelPaperOrder(ledger, orderId));
  }

  closeOrder(orderId: string, currentPrice: number) {
    return this.mutateLedger((ledger) => closePaperOrder(ledger, orderId, currentPrice));
  }

  toggleOrderChartVisibility(orderId: string) {
    return this.mutateLedger((ledger) => togglePaperOrderChartVisibility(ledger, orderId));
  }

  updateOrderRiskLimits(
    orderId: string,
    riskLimits: { stopLimitPrice?: number; profitLimitPrice?: number },
  ) {
    return this.mutateLedger((ledger) => updatePaperOrderRiskLimits(ledger, orderId, riskLimits));
  }

  updateOrder(input: UpdatePaperOrderInput) {
    return this.mutateLedger((ledger) => updatePaperOrder(ledger, input));
  }

  private mutateLedger(
    reducer: (ledger: PaperLedger) => PaperLedger,
    options: { skipSaveWhenUnchanged?: boolean } = {},
  ) {
    const queuedMutation = this.mutationQueue.then(async () => {
      const ledger = await paperTradingRepository.getLedger();
      const nextLedger = reducer(ledger);

      if (options.skipSaveWhenUnchanged && nextLedger === ledger) {
        return ledger;
      }

      await paperTradingRepository.saveLedger(nextLedger);
      this.emitLedger(nextLedger);
      return nextLedger;
    });

    this.mutationQueue = queuedMutation.catch(() => undefined);
    return queuedMutation;
  }

  private emitLedger(ledger: PaperLedger) {
    for (const listener of this.ledgerListeners) {
      listener(ledger);
    }
  }
}

export const marketEngine = new MarketEngine();
