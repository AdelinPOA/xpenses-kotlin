"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/**
 * An interceptor returns true when navigation may proceed, false when it
 * was vetoed (e.g. an unsaved-changes confirm dialog was dismissed).
 */
export type NavigationInterceptor = () => boolean;

interface NavigationGuardValue {
  interceptorsRef: React.RefObject<Set<NavigationInterceptor>>;
}

/**
 * Lightweight context letting forms veto client-side navigations triggered
 * by shared chrome (bottom nav, FABs). Programmatic router.push() calls made
 * *after* a form clears its dirty state are unaffected.
 */
export const NavigationGuardContext = createContext<NavigationGuardValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const interceptorsRef = useRef<Set<NavigationInterceptor>>(new Set());
  return (
    <NavigationGuardContext.Provider value={{ interceptorsRef }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

/** Returns true if every registered interceptor allows the navigation. */
export function useAllowNavigation() {
  const ctx = useContext(NavigationGuardContext);
  return (): boolean => {
    for (const check of ctx?.interceptorsRef.current ?? []) {
      if (!check()) return false;
    }
    return true;
  };
}

export function useRegisterNavigationGuard(check: NavigationInterceptor) {
  const ctx = useContext(NavigationGuardContext);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.interceptorsRef.current.add(check);
    return () => {
      ctx.interceptorsRef.current.delete(check);
    };
  }, [ctx, check]);
}
