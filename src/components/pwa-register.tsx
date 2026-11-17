"use client";
import { useEffect } from "react";

const APP_UA_MARKER = "HOACommitteeApp";

/**
 * Registers the service worker (browsers), and inside the iPhone app keeps "open in new tab"
 * links in the app. The app would otherwise hand them to Safari, which isn't signed in.
 */
export function PwaRegister() {
  useEffect(() => {
    const inApp = navigator.userAgent.includes(APP_UA_MARKER);
    if (!inApp && process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (!inApp) return;
    document.documentElement.classList.add("in-app");
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[target=_blank]") as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return; // other websites still open in Safari
      e.preventDefault();
      location.assign(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
