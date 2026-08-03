import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALES, type Locale } from "./config";
import { onError, getMessageFallback } from "./runtime";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("lang")?.value;
  const locale: Locale = raw && LOCALES.includes(raw as Locale) ? (raw as Locale) : "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    onError,
    getMessageFallback,
  };
});
