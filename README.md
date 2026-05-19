# Paper Trader

Desktop crypto paper trading terminal built with Tauri, React, TypeScript, Tailwind CSS, SQLite, and KLineCharts. The goal is to make a fast local simulator for watching real exchange data, placing paper spot/futures orders, replaying historical candles, etc.

## What It Does

- Streams spot market data from supported public exchange APIs and websockets.
- Caches market data, chart preferences, drawings, and paper ledger data.
- Uses KLineCharts for candles, indicators, overlays, and tools.
- Supports paper market orders, limit orders, perps, stop limits, and profit limits.
- Shows a live purchase book.
- Includes Strategy Replay.
- Includes Data Manager.

## Supported Exchanges

Active exchanges:

- Binance.US
- Coinbase
- OKX
- MEXC

## Tech Stack

- Tauri 2
- React 19
- Vite
- Tailwind CSS 4
- KLineCharts 10 beta
- SQLite
- TanStack Query
- Vitest
- Tone.js

## Project Structure

```text
src/
  components/        UI components
  data/              Exchange clients, storage
  pages/
  settings/          User settings
  theme/             Global theme
  types/             Data types
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web dev server:

```bash
npm run dev
```

Run the Tauri desktop app in development:

```bash
npm run tauri dev
```

Run tests:

```bash
npm run test
```

Build the web assets:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri build
```
