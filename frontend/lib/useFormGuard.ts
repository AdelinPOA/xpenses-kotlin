"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRegisterNavigationGuard } from "./navigationGuard";

/**
 * Guards a form against losing unsaved changes.
 *
 * - `isDirty` is re-evaluated on every render; pass a cheap comparison of
 *   current values against the initial ones.
 * - While dirty, reload/close is guarded via `beforeunload` and in-app
 *   navigation through shared chrome (bottom nav / FAB links) is intercepted
 *   with a confirm dialog.
 * - Call `clearDirty()` right before programmatic navigation after a
 *   successful save so no prompt appears.
 */
export function useFormGuard(isDirty: () => boolean, message: string) {
  // Ref keeps the latest dirty flag without re-registering the interceptor.
  const dirtyRef = useRef(false);
  // Once the form is saved, isDirty() must stop re-arming the guard on
  // subsequent renders (e.g. during a delayed post-save redirect).
  const clearedRef = useRef(false);
  const hasPushedStateRef = useRef(false);
  dirtyRef.current = clearedRef.current ? false : isDirty();

  // Push a history state entry when the form becomes dirty so mobile back gestures fire popstate
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dirtyRef.current && !hasPushedStateRef.current) {
      window.history.pushState({ formGuard: true }, "", window.location.href);
      hasPushedStateRef.current = true;
    }
  });

  // Intercept browser back / swipe-back navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      if (dirtyRef.current) {
        const stay = !window.confirm(message);
        if (stay) {
          window.history.pushState({ formGuard: true }, "", window.location.href);
          return;
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [message]);

  // Reload / close tab / iOS browser
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const check = useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm(message);
  }, [message]);

  useRegisterNavigationGuard(check);

  const clearDirty = useCallback(() => {
    clearedRef.current = true;
    dirtyRef.current = false;
  }, []);

  return { clearDirty };
}
