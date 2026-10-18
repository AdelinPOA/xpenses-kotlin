"use client";

import { useEffect } from "react";
import { useToast } from "./ToastProvider";
import { useTranslations } from "next-intl";

export default function PwaRegistration() {
  const { info } = useToast();
  const t = useTranslations("pwa");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (cancelled) return;

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            info(t("update_available"), {
              label: t("update_now"),
              onClick: () => window.location.reload(),
            });
          }
        });
      });
    }).catch(() => {
      // SW not supported or registration failed — no user-facing error
    });

    return () => {
      cancelled = true;
    };
  }, [info, t]);

  return null;
}
