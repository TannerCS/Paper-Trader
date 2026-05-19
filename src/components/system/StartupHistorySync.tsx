import { useEffect, useRef } from "react";
import { createMarketDataProvider } from "../../data/marketDataProvider";
import { candleRepository } from "../../data/storage/candleRepository";
import type { CoinMarket } from "../../types/marketData";
import type { MarketDataSettings } from "../../settings/marketDataSettings";

interface StartupHistorySyncProps {
  settings?: MarketDataSettings;
  markets: CoinMarket[];
}

const bootstrapAssetLimit = 10;
const syncDelayMilliseconds = 750;

export function StartupHistorySync({ settings, markets }: StartupHistorySyncProps) {
  const activeSyncKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settings || markets.length === 0) {
      return;
    }

    const currentSettings = settings;
    const syncKey = `${currentSettings.provider}:${currentSettings.baseCurrency}`;

    if (activeSyncKeyRef.current === syncKey) {
      return;
    }

    let isCancelled = false;
    activeSyncKeyRef.current = syncKey;

    async function runStartupSync() {
      const summary = await candleRepository.getSummary();
      const targetAssetCount = Math.min(bootstrapAssetLimit, markets.length);

      if (summary.coinCount >= targetAssetCount && summary.candleCount > 0) {
        return;
      }

      const provider = createMarketDataProvider(currentSettings);
      const candidateMarkets = markets.slice(0, targetAssetCount);

      for (const market of candidateMarkets) {
        if (isCancelled) {
          return;
        }

        const existingCandles = await candleRepository.getCandles({
          provider: currentSettings.provider,
          coinId: market.id,
          currency: currentSettings.baseCurrency,
          rangeKey: "all",
        });

        if (existingCandles.length > 0) {
          continue;
        }

        try {
          const candles = await provider.getOhlc({
            coinId: market.id,
            currency: currentSettings.baseCurrency,
            range: { from: 0, to: Date.now() },
          });
          await candleRepository.saveCandles({
            provider: currentSettings.provider,
            coinId: market.id,
            currency: currentSettings.baseCurrency,
            rangeKey: "all",
            candles,
          });
        } catch {
          //don't block app
        }

        await delay(syncDelayMilliseconds);
      }
    }

    void runStartupSync().finally(() => {
      if (activeSyncKeyRef.current === syncKey) {
        activeSyncKeyRef.current = null;
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [markets, settings]);

  return null;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
