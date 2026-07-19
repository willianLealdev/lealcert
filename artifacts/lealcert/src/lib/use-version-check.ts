import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const INITIAL_DELAY_MS = 30 * 1000;     // aguarda 30s antes do primeiro check

let storedVersion: string | null = null;

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { v?: string };
    return data.v ?? null;
  } catch {
    return null;
  }
}

/**
 * Detecta nova versão do servidor via polling em /api/version.
 * Quando a versão muda (servidor foi reiniciado após deploy), recarrega a página.
 * Funciona independentemente do Service Worker ou cache do browser.
 */
export function useVersionCheck() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Captura a versão inicial — qualquer mudança depois disso indica novo deploy
      const v = await fetchVersion();
      if (cancelled) return;
      storedVersion = v;

      // Aguarda um pouco antes de começar a verificar (evita reload logo ao abrir)
      await new Promise(r => setTimeout(r, INITIAL_DELAY_MS));
      if (cancelled) return;

      async function check() {
        if (cancelled) return;
        const current = await fetchVersion();
        if (current && storedVersion && current !== storedVersion) {
          window.location.reload();
        }
      }

      timerRef.current = setInterval(() => { void check(); }, POLL_INTERVAL_MS);
    }

    void init();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
