export const LOCALES = ["en", "ro"] as const;
export type Locale = (typeof LOCALES)[number];

export const mapLocaleToBcp47: Record<Locale, string> = {
  en: "en-EU",
  ro: "ro-RO",
};
