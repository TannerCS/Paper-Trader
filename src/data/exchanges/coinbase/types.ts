export interface CoinbaseProductsResponse {
  products: CoinbaseProduct[];
}

export interface CoinbaseProduct {
  product_id: string;
  price?: string;
  price_percentage_change_24h?: string;
  volume_24h?: string;
  approximate_quote_24h_volume?: string;
  base_name?: string;
  base_display_symbol?: string;
  quote_display_symbol?: string;
  quote_currency_id?: string;
  base_currency_id?: string;
  product_type?: string;
  trading_disabled?: boolean;
  is_disabled?: boolean;
  icon_url?: string;
  market_cap?: string;
}

export interface CoinbaseCandlesResponse {
  candles: CoinbaseCandle[];
}

export interface CoinbaseCandle {
  start: string;
  low: string;
  high: string;
  open: string;
  close: string;
  volume: string;
}
