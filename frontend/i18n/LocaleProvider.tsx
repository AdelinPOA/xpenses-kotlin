"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { type Locale, LOCALES } from "./config";
import messages, { type Messages } from "./messages";
import { setCurrentLocale } from "@/lib/format";
import { onError, getMessageFallback } from "./runtime";

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: "en",
  setLocale: () => {},
});

export function useLocaleContext() {
  return useContext(LocaleContext);
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeLangCookie(locale: string) {
  const maxAge = 31536000;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `lang=${encodeURIComponent(locale)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function resolveInitialLocale(): Locale {
  const cookie = readCookie("lang");
  if (cookie && LOCALES.includes(cookie as Locale)) {
    return cookie as Locale;
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator.language;
    if (nav.startsWith("ro")) return "ro";
  }
  return "en";
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      return resolveInitialLocale();
    }
    return "en";
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    writeLangCookie(newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  useEffect(() => {
    if (user?.language && LOCALES.includes(user.language as Locale)) {
      setLocale(user.language as Locale);
    } else {
      const cookie = readCookie("lang");
      if (cookie && LOCALES.includes(cookie as Locale)) {
        setLocale(cookie as Locale);
      }
    }
  }, [user?.language, setLocale]);

  useEffect(() => {
    setCurrentLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale] as Messages}
        timeZone="Europe/Bucharest"
        onError={onError}
        getMessageFallback={getMessageFallback}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
