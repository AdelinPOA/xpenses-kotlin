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
      // The hint remains dismissed for this page if persistence is unavailable.
    }
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="lg:hidden mt-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-card/90 backdrop-blur-md p-3.5 shadow-xs"
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Share className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="flex-1 text-xs font-medium text-foreground leading-relaxed">{t("ios_install_hint")}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("ios_install_dismiss")}
        className="min-w-11 min-h-11 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-surface-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
