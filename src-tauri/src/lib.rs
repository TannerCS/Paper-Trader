use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(serde::Deserialize)]
struct ProviderRequestHeader {
    name: String,
    value: String,
}

#[tauri::command]
async fn provider_get(
    url: String,
    headers: Vec<ProviderRequestHeader>,
) -> Result<serde_json::Value, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|error| format!("Invalid provider URL: {error}"))?;
    let host = parsed_url
        .host_str()
        .ok_or_else(|| "Provider URL must include a host.".to_string())?;

    let allowed_hosts = [
        "api.binance.us",
        "api.coinbase.com",
        "www.okx.com",
        "api.mexc.com",
        "api.bybit.com",
        "api.phemex.com",
    ];

    //cors bridge allowlist
    if !allowed_hosts.contains(&host) {
        return Err(format!("Provider host is not allowed: {host}"));
    }

    let mut request = reqwest::Client::new()
        .get(parsed_url)
        .header(reqwest::header::ACCEPT, "application/json");

    for header in headers {
        let header_name = reqwest::header::HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|error| format!("Invalid provider header name: {error}"))?;
        let header_value = reqwest::header::HeaderValue::from_str(&header.value)
            .map_err(|error| format!("Invalid provider header value: {error}"))?;
        request = request.header(header_name, header_value);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Provider request failed: {error}"))?;
    let status = response.status();

    if !status.is_success() {
        let details = response.text().await.unwrap_or_default();
        return Err(format!(
            "Provider returned {}{}",
            status.as_u16(),
            if details.is_empty() {
                String::new()
            } else {
                format!(": {details}")
            }
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("Provider response was not valid JSON: {error}"))
}

fn database_migrations() -> Vec<Migration> {
    //sqlite app schema
    vec![
        Migration {
            version: 1,
            description: "create_paper_trader_core_tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS provider_sync_state (
                provider TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                last_sync_at TEXT,
                last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS coins (
                id TEXT PRIMARY KEY NOT NULL,
                provider TEXT NOT NULL DEFAULT 'binanceus',
                provider_id TEXT,
                symbol TEXT NOT NULL,
                name TEXT NOT NULL,
                image TEXT,
                market_cap_rank INTEGER,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS coin_markets (
                coin_id TEXT PRIMARY KEY NOT NULL,
                provider TEXT NOT NULL DEFAULT 'binanceus',
                vs_currency TEXT NOT NULL DEFAULT 'usd',
                price REAL,
                market_cap REAL,
                volume_24h REAL,
                price_change_percentage_24h REAL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (coin_id) REFERENCES coins(id),
                UNIQUE (coin_id, provider, vs_currency)
            );

            CREATE TABLE IF NOT EXISTS ohlc_candles (
                coin_id TEXT NOT NULL,
                vs_currency TEXT NOT NULL,
                days TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (coin_id, vs_currency, days, timestamp)
            );

            CREATE TABLE IF NOT EXISTS watchlists (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS watchlist_items (
                watchlist_id TEXT NOT NULL,
                coin_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (watchlist_id, coin_id),
                FOREIGN KEY (watchlist_id) REFERENCES watchlists(id),
                FOREIGN KEY (coin_id) REFERENCES coins(id)
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_structured_paper_trading_tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS paper_account (
                id TEXT PRIMARY KEY NOT NULL,
                cash_balance REAL NOT NULL,
                realized_pnl REAL NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS paper_orders (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                asset_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                pair TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                limit_price REAL,
                stop_limit_price REAL,
                profit_limit_price REAL,
                execution_price REAL,
                exit_price REAL,
                profit_amount REAL,
                profit_percent REAL,
                position_id TEXT,
                leverage REAL,
                margin REAL,
                hidden_on_chart INTEGER NOT NULL DEFAULT 0,
                closed_at TEXT,
                close_reason TEXT,
                message TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_paper_orders_asset_status
                ON paper_orders(asset_id, status);

            CREATE TABLE IF NOT EXISTS paper_spot_positions (
                asset_id TEXT PRIMARY KEY NOT NULL,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                average_price REAL NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS paper_perp_positions (
                id TEXT PRIMARY KEY NOT NULL,
                asset_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                entry_price REAL NOT NULL,
                leverage REAL NOT NULL,
                margin REAL NOT NULL,
                opened_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_paper_perp_positions_asset
                ON paper_perp_positions(asset_id);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_historical_sync_queue_tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS history_sync_jobs (
                id TEXT PRIMARY KEY NOT NULL,
                provider TEXT NOT NULL,
                base_currency TEXT NOT NULL,
                status TEXT NOT NULL,
                total_items INTEGER NOT NULL DEFAULT 0,
                completed_items INTEGER NOT NULL DEFAULT 0,
                failed_items INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS history_sync_job_items (
                job_id TEXT NOT NULL,
                coin_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                candle_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                PRIMARY KEY (job_id, coin_id),
                FOREIGN KEY (job_id) REFERENCES history_sync_jobs(id)
            );

            CREATE INDEX IF NOT EXISTS idx_history_sync_jobs_updated
                ON history_sync_jobs(updated_at);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_candle_volume",
            sql: r#"
            ALTER TABLE ohlc_candles ADD COLUMN volume REAL;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_exchange_to_paper_orders",
            sql: r#"
            ALTER TABLE paper_orders ADD COLUMN exchange TEXT NOT NULL DEFAULT 'Binance.US';
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_live_trade_tape_cache",
            sql: r#"
            CREATE TABLE IF NOT EXISTS live_trade_tape (
                id TEXT NOT NULL,
                exchange TEXT NOT NULL,
                asset_id TEXT NOT NULL,
                side TEXT NOT NULL,
                price REAL NOT NULL,
                quantity REAL NOT NULL,
                notional REAL NOT NULL,
                traded_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, exchange, asset_id)
            );

            CREATE INDEX IF NOT EXISTS idx_live_trade_tape_asset_time
                ON live_trade_tape(asset_id, traded_at DESC);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "extend_history_sync_dashboard_fields",
            sql: r#"
            ALTER TABLE history_sync_job_items ADD COLUMN exchange TEXT NOT NULL DEFAULT 'Exchange';
            ALTER TABLE history_sync_job_items ADD COLUMN range_key TEXT NOT NULL DEFAULT 'all';
            ALTER TABLE history_sync_job_items ADD COLUMN requested_from INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE history_sync_job_items ADD COLUMN requested_to INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE history_sync_job_items ADD COLUMN earliest_candle INTEGER;
            ALTER TABLE history_sync_job_items ADD COLUMN latest_candle INTEGER;
        "#,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:paper-trader.db", database_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![provider_get])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
