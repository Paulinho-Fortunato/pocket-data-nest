import { useCallback, useEffect, useState } from "react";

/**
 * PWA plumbing: service-worker registration, safe updates, install prompt and
 * online/offline status.
 *
 * The service worker is registered in production builds (and on demand from
 * Definições during development, so the offline flow can be verified without
 * breaking HMR asset caching).
 */

export const SW_URL = "/sw.js";
const DISMISS_KEY = "angostudy:pwa-install-dismissed";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(displayMode || iosStandalone);
}

export function canUseServiceWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function registerServiceWorker(options: { force?: boolean } = {}) {
  if (!canUseServiceWorker()) return null;
  const dev = import.meta.env.DEV;
  if (dev && !options.force) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (error) {
    // A blocked service worker must never break the app.
    console.warn("Service worker não registado:", error);
    return null;
  }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // ignore
    }
    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const media = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => setInstalled(isStandalone());
    media?.addEventListener?.("change", onChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media?.removeEventListener?.("change", onChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!event) return "unavailable" as const;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setEvent(null);
      return choice.outcome;
    } catch {
      return "dismissed" as const;
    }
  }, [event]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setEvent(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  return {
    canInstall: Boolean(event) && !installed && !dismissed,
    installed,
    promptInstall,
    dismiss,
    /** iOS has no beforeinstallprompt; the UI shows manual instructions instead. */
    manualInstructions: !installed && !event,
  };
}

type SwState = {
  supported: boolean;
  registration: ServiceWorkerRegistration | null;
  waiting: ServiceWorker | null;
  updateReady: boolean;
};

export function useServiceWorker(options: { force?: boolean } = {}) {
  const [state, setState] = useState<SwState>({
    supported: canUseServiceWorker(),
    registration: null,
    waiting: null,
    updateReady: false,
  });

  useEffect(() => {
    if (!canUseServiceWorker()) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const track = (reg: ServiceWorkerRegistration) => {
      if (disposed) return;
      registration = reg;
      const waiting = reg.waiting;
      setState({
        supported: true,
        registration: reg,
        waiting: waiting ?? null,
        updateReady: Boolean(waiting),
      });
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setState((prev) => ({
              ...prev,
              registration: reg,
              waiting: reg.waiting,
              updateReady: true,
            }));
          }
        });
      });
    };

    navigator.serviceWorker.ready.then((reg) => !disposed && track(reg)).catch(() => undefined);

    if (options.force) {
      registerServiceWorker({ force: true })
        .then((reg) => reg && track(reg))
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      registration = null;
    };
  }, [options.force]);

  const applyUpdate = useCallback(async () => {
    if (!state.waiting) return;
    state.waiting.postMessage({ type: "SKIP_WAITING" });
    // Reload once the new worker controls the page (safe, explicit update).
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
      setTimeout(done, 3_000);
    });
    window.location.reload();
  }, [state.waiting]);

  const checkForUpdate = useCallback(async () => {
    const reg = state.registration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return false;
    try {
      await reg.update();
      return true;
    } catch {
      return false;
    }
  }, [state.registration]);

  return { ...state, applyUpdate, checkForUpdate };
}

export function resetInstallDismissal() {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
}
