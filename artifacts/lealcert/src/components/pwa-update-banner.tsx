import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function PwaUpdateBanner() {
  const [countdown, setCountdown] = useState<number | null>(null);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, _r) {},
    onRegisterError(error) { console.error("SW registration error:", error); },
  });

  useEffect(() => {
    if (!needRefresh) return;
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          void updateServiceWorker(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh || countdown === null) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#0f172a] text-white px-4 py-3 rounded-xl shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300 max-w-[calc(100vw-2rem)]">
      <RefreshCw className="h-4 w-4 shrink-0 text-blue-400 animate-spin" />
      <span className="text-sm font-medium">
        Nova versão disponível — atualizando em <strong>{countdown}s</strong>
      </span>
      <button
        onClick={() => { void updateServiceWorker(true); }}
        className="text-sm font-semibold bg-[#2563eb] hover:bg-blue-700 px-3 py-1 rounded-lg transition-colors shrink-0"
      >
        Agora
      </button>
    </div>
  );
}
