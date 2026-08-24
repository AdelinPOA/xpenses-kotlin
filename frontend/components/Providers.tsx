"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import AuthProvider from "./AuthProvider";
import ThemeProvider from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";
import OfflineSyncProvider from "./OfflineSyncProvider";
import { NavigationGuardProvider } from "@/lib/navigationGuard";
import LocaleProvider from "@/i18n/LocaleProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LocaleProvider>
            <ToastProvider>
              <OfflineSyncProvider>
                <NavigationGuardProvider>{children}</NavigationGuardProvider>
              </OfflineSyncProvider>
            </ToastProvider>
          </LocaleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
