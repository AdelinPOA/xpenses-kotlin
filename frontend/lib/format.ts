import { mapLocaleToBcp47, type Locale } from "@/i18n/config";

let currentLocale: Locale = "en";

export function setCurrentLocale(locale: Locale) {
  currentLocale = locale;
}

function getBcp47(locale: Locale): string {
  return mapLocaleToBcp47[locale];
}

const eurFormatters = new Map<string, Intl.NumberFormat>();

function getEurFormatter(locale: string): Intl.NumberFormat {
  const key = locale;
  let f = eurFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(getBcp47(currentLocale), {
      style: "currency",
      currency: "EUR",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    eurFormatters.set(key, f);
  }
  return f;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(getBcp47(currentLocale), {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, f);
  }
  return f;
}

export function formatEur(amount: number): string {
  return getEurFormatter(getBcp47(currentLocale)).format(amount);
}

export function formatAmount(amount: number, currency: string): string {
  return getFormatter(currency, getBcp47(currentLocale)).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(getBcp47(currentLocale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
