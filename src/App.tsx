import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DataManager } from "./pages/DataManager";
import { Dashboard } from "./pages/Dashboard";
import { Markets } from "./pages/Markets";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProviderStatusPage } from "./pages/SystemStatus";
import { Settings } from "./pages/Settings";
import { StrategyReplay } from "./pages/StrategyReplay";
import { TradingTerminal } from "./pages/TradingTerminal";
import { Watchlists } from "./pages/Watchlists";
import { WindowStatePersistence } from "./components/system/WindowStatePersistence";

function App() {
  return (
    <>
      <WindowStatePersistence />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/terminal" element={<TradingTerminal />} />
          <Route path="/watchlists" element={<Watchlists />} />
          <Route
            path="/portfolio"
            element={
              <PlaceholderPage
                title="Portfolio"
                description="Track paper account equity, cash, allocations, and realized or unrealized P/L."
                nextStep="Wire this page to the paper trading engine once order simulation is in place."
              />
            }
          />
          <Route path="/markets" element={<Markets />} />
          <Route
            path="/coin-detail"
            element={
              <PlaceholderPage
                title="Coin Detail"
                description="Inspect an individual asset with fundamentals, market data, and chart context."
                nextStep="Connect this view to the selected exchange market detail endpoint after the searchable watchlist flow is persisted."
              />
            }
          />
          <Route
            path="/trending"
            element={
              <PlaceholderPage
                title="Trending"
                description="Surface high-attention assets and momentum candidates from real provider data."
                nextStep="Add exchange momentum endpoints and cache the response in SQLite."
              />
            }
          />
          <Route
            path="/categories"
            element={
              <PlaceholderPage
                title="Categories"
                description="Compare market sectors and token categories from live provider data."
                nextStep="Add category market endpoints and build a table view with change, volume, and market cap."
              />
            }
          />
          <Route
            path="/exchanges"
            element={
              <PlaceholderPage
                title="Exchanges"
                description="Review exchange-level market context for supported assets."
                nextStep="Connect exchange metadata endpoints and add detail drilldowns."
              />
            }
          />
          <Route
            path="/orders"
            element={
              <PlaceholderPage
                title="Orders"
                description="Manage paper orders, order status, and execution history."
                nextStep="Build the SQLite-backed paper order ledger and simulated fill service."
              />
            }
          />
          <Route
            path="/positions"
            element={
              <PlaceholderPage
                title="Positions"
                description="Monitor open paper positions with exposure, average price, and P/L."
                nextStep="Derive positions from executions rather than storing mock holdings."
              />
            }
          />
          <Route
            path="/journal"
            element={
              <PlaceholderPage
                title="Trade Journal"
                description="Capture thesis, tags, screenshots, and outcomes for each paper trade."
                nextStep="Create journal tables and attach entries to executed paper trades."
              />
            }
          />
          <Route
            path="/risk"
            element={
              <PlaceholderPage
                title="Risk Center"
                description="Review exposure, drawdown, concentration, and account guardrails."
                nextStep="Calculate risk metrics from real account state and current market prices."
              />
            }
          />
          <Route
            path="/performance"
            element={
              <PlaceholderPage
                title="Performance"
                description="Analyze equity curve, win rate, profit factor, and drawdown."
                nextStep="Build analytics from closed trades and market-value snapshots."
              />
            }
          />
          <Route
            path="/backtesting"
            element={<StrategyReplay />}
          />
          <Route path="/data-manager" element={<DataManager />} />
          <Route path="/settings" element={<Settings />} />
          <Route
            path="/alerts"
            element={
              <PlaceholderPage
                title="Alerts"
                description="Create local alerts based on price, percent change, and volume conditions."
                nextStep="Persist alert rules in SQLite and evaluate them against refreshed exchange market rows."
              />
            }
          />
          <Route path="/provider-status" element={<ProviderStatusPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
