"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import AuthProvider from "./AuthProvider";
import ThemeProvider from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";
import { NavigationGuardProvider } from "@/lib/navigationGuard";
import LocaleProvider from "@/i18n/LocaleProvider";
import QueryErrorBridge from "./QueryErrorBridge";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
        },
      })
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister().catch(() => {});
        }
      }).catch(() => {});
    } catch {
      // Ignore service worker cleanup errors
    }
    try {
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            void caches.delete(key).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch {
      // Ignore cache storage cleanup errors
    }
    try {
      if ("indexedDB" in window) {
        for (const dbName of ["xpenses-cache", "xpenses-offline"]) {
          try {
            indexedDB.deleteDatabase(dbName);
          } catch {
            // Ignore IndexedDB cleanup errors
          }
        }
      }
    } catch {
      // Ignore IndexedDB cleanup errors
    }
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LocaleProvider>
            <ToastProvider>
              <QueryErrorBridge />
              <NavigationGuardProvider>{children}</NavigationGuardProvider>
            </ToastProvider>
          </LocaleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
