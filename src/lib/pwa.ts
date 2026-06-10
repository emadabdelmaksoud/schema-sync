// PWA registration + update + connectivity helpers.
// Guarded against Lovable preview / iframe contexts per platform rules.

import { toast } from "sonner";

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isPreviewHost(): boolean {
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

function shouldDisablePWA(): boolean {
  if (typeof window === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (inIframe()) return true;
  if (isPreviewHost()) return true;
  return false;
}

async function unregisterAll() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* noop */
  }
}

export function setupConnectivityToasts() {
  if (typeof window === "undefined") return;
  let wasOffline = !navigator.onLine;
  if (wasOffline) {
    toast.warning("You're offline. Cached pages still work.", { id: "net-status" });
  }
  window.addEventListener("offline", () => {
    wasOffline = true;
    toast.warning("Connection lost. Working offline.", { id: "net-status", duration: Infinity });
  });
  window.addEventListener("online", () => {
    if (!wasOffline) return;
    wasOffline = false;
    toast.dismiss("net-status");
    toast.success("Back online — syncing.", { id: "net-status" });
    navigator.serviceWorker?.controller?.postMessage({ type: "SYNC" });
    // Let app pieces refresh queries
    window.dispatchEvent(new CustomEvent("app:reconnect"));
  });
}

function promptUpdate(reg: ServiceWorkerRegistration) {
  const waiting = reg.waiting;
  if (!waiting) return;
  toast("A new version is available", {
    description: "Reload to get the latest improvements.",
    duration: Infinity,
    action: {
      label: "Update",
      onClick: () => {
        waiting.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}

export async function registerServiceWorker() {
  setupConnectivityToasts();

  if (shouldDisablePWA()) {
    // Clean up any SW that may have been registered in preview/iframe contexts.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      await unregisterAll();
    }
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    if (reg.waiting) promptUpdate(reg);

    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(reg);
        }
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Periodic update check
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
