// Cached Intl.NumberFormat instances — created once, reused everywhere
const eurFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let f = formatterCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-GB", { style: "currency", currency });
    formatterCache.set(currency, f);
  }
  return f;
}

export function formatEur(amount: number): string {
  return eurFormatter.format(amount);
}

export function formatAmount(amount: number, currency: string): string {
  return getFormatter(currency).format(amount);
}
