"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Dev: skip so HMR isn't fighting the SW. Prod / `next start` registers.
    if (process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);

  return null;
}
