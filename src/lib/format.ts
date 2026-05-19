import type { DateTimeFormatId } from "../types/marketData";

interface DateTimeFormatterPreferences {
  timeZone: string;
  dateTimeFormat: DateTimeFormatId;
}

let dateTimeFormatterPreferences: DateTimeFormatterPreferences = {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  dateTimeFormat: "date-time-medium",
};

export function setDateTimeFormatterPreferences(preferences: Partial<DateTimeFormatterPreferences>) {
  dateTimeFormatterPreferences = {
    ...dateTimeFormatterPreferences,
    ...preferences,
  };
}

export function formatCurrency(value: number | null | undefined, currency = "usd") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  const normalizedCurrency = currency.toUpperCase();

  if (isIntlCurrencyCode(normalizedCurrency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: value < 1 ? 6 : 2,
    }).format(value);
  }

  return `${formatNumber(value)} ${normalizedCurrency}`;
}

export function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const { dateTimeFormat, timeZone } = dateTimeFormatterPreferences;

  if (dateTimeFormat === "iso-local") {
    return formatIsoLocal(date, timeZone);
  }

  if (dateTimeFormat === "numeric-date-time") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  if (dateTimeFormat === "date-time-short") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  if (dateTimeFormat === "date-time-long") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }).format(date);
  }

  if (dateTimeFormat === "month-day-time") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (dateTimeFormat === "date-only-medium") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "medium",
    }).format(date);
  }

  if (dateTimeFormat === "time-only-12h") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  if (dateTimeFormat === "time-only-24h") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isIntlCurrencyCode(currency: string) {
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(1);
    return true;
  } catch {
    return false;
  }
}

function formatIsoLocal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
