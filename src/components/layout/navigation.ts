import {
  IconActivity,
  IconAdjustments,
  IconBellRinging,
  IconBook,
  IconBriefcase,
  IconBuildingBank,
  IconChartCandle,
  IconChartDots,
  IconChartHistogram,
  IconDatabase,
  IconExchange,
  IconFlame,
  IconGauge,
  IconListSearch,
  IconNotebook,
  IconReportAnalytics,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: Icon;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const primaryNavigationItems: NavigationItem[] = [
  { label: "Dashboard", path: "/", icon: IconGauge },
  { label: "Trading Terminal", path: "/terminal", icon: IconChartCandle },
  { label: "Watchlists", path: "/watchlists", icon: IconListSearch },
  { label: "Portfolio", path: "/portfolio", icon: IconBriefcase },
];

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Markets",
    items: [
      { label: "Market Explorer", path: "/markets", icon: IconSearch },
      { label: "Coin Detail", path: "/coin-detail", icon: IconSparkles },
      { label: "Trending", path: "/trending", icon: IconFlame },
      { label: "Categories", path: "/categories", icon: IconChartDots },
      { label: "Exchanges", path: "/exchanges", icon: IconExchange },
    ],
  },
  {
    label: "Trading",
    items: [
      { label: "Orders", path: "/orders", icon: IconBook },
      { label: "Positions", path: "/positions", icon: IconBuildingBank },
      { label: "Trade Journal", path: "/journal", icon: IconNotebook },
      { label: "Risk Center", path: "/risk", icon: IconShieldCheck },
    ],
  },
  {
    label: "Analysis",
    items: [
      { label: "Performance", path: "/performance", icon: IconReportAnalytics },
      { label: "Strategy Replay", path: "/backtesting", icon: IconChartHistogram },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Data Manager", path: "/data-manager", icon: IconDatabase },
      { label: "Settings", path: "/settings", icon: IconAdjustments },
      { label: "Alerts", path: "/alerts", icon: IconBellRinging },
      { label: "Exchange Status", path: "/provider-status", icon: IconActivity },
    ],
  },
];
