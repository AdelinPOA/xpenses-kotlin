export interface PagedResponse<T> {
  data: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
}

export function isPagedResponse<T>(r: T[] | PagedResponse<T>): r is PagedResponse<T> {
  return !Array.isArray(r) && r.data !== undefined;
}

export const CURRENCIES = [
  "EUR", "USD", "GBP", "RON", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
  "HUF", "BGN", "HRK", "TRY", "JPY", "CNY", "KRW", "AUD", "CAD", "NZD",
  "BRL", "MXN", "ARS", "CLP", "COP", "INR", "IDR", "MYR", "SGD", "THB",
  "PHP", "VND", "ZAR", "EGP", "NGN", "KES", "AED", "SAR", "QAR", "ILS",
  "RUB", "UAH", "GEL", "KZT", "MDL", "AZN", "TWD", "HKD", "ISK", "MAD", "TND",
] as const;
export type Currency = (typeof CURRENCIES)[number];
