"use client";

import { useEffect } from "react";

/**
 * Locks body scroll while `locked` is true (e.g. while a drawer/sidebar is open).
 * Restores the previous overflow on cleanup. Prevents iOS scroll bleed behind overlays.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
