import type { CoinMarket } from "../types/marketData";

export function formatMarketPair(coin: Pick<CoinMarket, "id" | "symbol">, fallbackQuote = "usd") {
  const baseSymbol = coin.symbol.toUpperCase();
  const coinId = coin.id.split(":").pop()?.toUpperCase() ?? coin.id.toUpperCase();

  if (coinId.includes("-")) {
    return coinId.replace("-", "/");
  }

  if (coinId.includes("/")) {
    return coinId;
  }

  if (coinId.startsWith(baseSymbol) && coinId.length > baseSymbol.length) {
    return `${baseSymbol}/${coinId.slice(baseSymbol.length)}`;
  }

  return `${baseSymbol}/${fallbackQuote.toUpperCase()}`;
}

export function getQuoteAssetFromPair(pair: string, fallbackQuote = "usd") {
  const quote = pair.split("/")[1]?.trim();
  return quote || fallbackQuote.toUpperCase();
}
