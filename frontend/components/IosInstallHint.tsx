"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "xpenses_ios_install_dismissed";

/**
 * Safari has no install prompt; show a one-time hint explaining
 * Share → "Add to Home Screen" for iOS/iPadOS users in a browser tab.
 */
export default function IosInstallHint() {
  const t = useTranslations("pwa");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    const ua = navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIos && !isStandalone) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Keep the hint dismissed for this session when persistence is unavailable.
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="lg:hidden fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg"
    >
      <Share
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <p className="flex-1 text-xs font-medium text-foreground">
        {t("ios_install_hint")}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("ios_install_dismiss")}
        className="min-w-11 min-h-11 -m-2 -mt-3 flex items-center justify-center rounded-lg text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
