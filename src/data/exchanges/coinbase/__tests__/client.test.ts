import { describe, expect, it } from "vitest";
import { mapCoinbaseProduct } from "../client";
import type { CoinbaseProduct } from "../types";

describe("CoinbaseClient", () => {
  it("maps product rows into the shared market shape", () => {
    const product: CoinbaseProduct = {
      product_id: "BTC-USD",
      price: "100",
      price_percentage_change_24h: "2.5%",
      approximate_quote_24h_volume: "2000",
      base_name: "Bitcoin",
      base_currency_id: "BTC",
      quote_currency_id: "USD",
      icon_url: "https://assets.example/btc.png",
      market_cap: "1000000",
    };

    expect(mapCoinbaseProduct(product)).toMatchObject({
      id: "BTC-USD",
      symbol: "BTC",
      name: "Bitcoin",
      image: "https://assets.example/btc.png",
      currentPrice: 100,
      marketCap: 1000000,
      totalVolume: 2000,
      priceChangePercentage24h: 2.5,
    });
  });
});
