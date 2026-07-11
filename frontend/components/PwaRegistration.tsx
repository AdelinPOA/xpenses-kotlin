"use client";

import { useEffect } from "react";
import { useToast } from "./ToastProvider";

export default function PwaRegistration() {
  const { info } = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            info("A new version is available. Close tabs to update.");
          }
        });
      });
    }).catch(() => {
      // SW not supported or registration failed — no user-facing error
    });
  }, [info]);

  return null;
}
