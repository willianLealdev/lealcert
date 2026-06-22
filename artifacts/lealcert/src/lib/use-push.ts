/**
 * usePush — manages Web Push subscription lifecycle.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface PushState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/public-key", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json() as { publicKey?: string };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function removeSubscription(endpoint: string): Promise<void> {
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}

/**
 * Returns the active SW registration.
 * Tries to register /sw.js if nothing is registered yet.
 * Times out after 10s.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  // If no SW is registered yet, try to register the default one
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch {
      // ignore — ready() below will fail with timeout if truly unavailable
    }
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Notificações indisponíveis neste dispositivo. Tente pelo app instalado ou Chrome.")),
      10_000,
    )
  );

  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export function usePush() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "default",
    subscribed: false,
    loading: false,
    error: null,
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const sw = "serviceWorker" in navigator;
    const push = "PushManager" in window;
    if (!sw || !push) {
      setState(s => ({ ...s, supported: false }));
      return;
    }

    const perm = Notification.permission;
    setState(s => ({ ...s, supported: true, permission: perm }));

    if (perm === "granted") {
      void (async () => {
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
          ]);
          if (!reg) return;
          const existing = await (reg as ServiceWorkerRegistration).pushManager.getSubscription();
          if (existing) setState(s => ({ ...s, subscribed: true }));
        } catch {
          // silently ignore on init
        }
      })();
    }
  }, []);

  const subscribe = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const publicKey = await getPublicKey();
      if (!publicKey) throw new Error("Chave VAPID não configurada. Contate o administrador.");

      const permission = await Notification.requestPermission();
      setState(s => ({ ...s, permission }));

      if (permission !== "granted") {
        setState(s => ({ ...s, loading: false, error: "Permissão negada. Habilite nas configurações do navegador." }));
        return;
      }

      const reg = await getSwRegistration();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      const ok = await saveSubscription(sub);
      if (!ok) throw new Error("Falha ao registrar inscrição no servidor. Tente novamente.");

      setState(s => ({ ...s, subscribed: true, loading: false, error: null }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 0) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
        ]);
        if (reg) {
          const sub = await (reg as ServiceWorkerRegistration).pushManager.getSubscription();
          if (sub) {
            await removeSubscription(sub.endpoint);
            await sub.unsubscribe();
          }
        }
      }
      setState(s => ({ ...s, subscribed: false, loading: false, error: null }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}
