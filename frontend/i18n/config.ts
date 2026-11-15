export const LOCALES = ["en", "ro"] as const;
export type Locale = (typeof LOCALES)[number];

export const mapLocaleToBcp47: Record<Locale, string> = {
  en: "en-IE",
  ro: "ro-RO",
};

export const LOCALE_TO_INTL = mapLocaleToBcp47;
