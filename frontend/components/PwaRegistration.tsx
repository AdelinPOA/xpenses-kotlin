"use client";

import { useEffect } from "react";
import { useToast } from "./ToastProvider";

export default function PwaRegistration() {
  const { info } = useToast();

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
            info("A new version is available. Refresh to update.");
          }
        });
      });
    }).catch(() => {
      // SW not supported or registration failed — no user-facing error
    });

    return () => {
      cancelled = true;
    };
  }, [info]);

  return null;
}
