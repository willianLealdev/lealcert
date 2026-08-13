/**
 * Hook que registra visitas de página no servidor.
 * Fire-and-forget: não bloqueia a navegação nem exibe erros ao usuário.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// UUID de sessão gerado uma vez por aba/sessão de browser
function getSessionId(): string {
  let id = sessionStorage.getItem("__sv_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("__sv_sid", id);
  }
  return id;
}

export function usePageTracker() {
  const [location] = useLocation();
  const lastTracked = useRef<string>("");

  useEffect(() => {
    if (location === lastTracked.current) return;
    lastTracked.current = location;

    const sid = getSessionId();
    const referrer = document.referrer || "";

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ path: location, referrer, sessionId: sid }),
    }).catch(() => {}); // silencia erros de rede
  }, [location]);
}
