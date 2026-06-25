import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { useState } from "react";

export function PwaUpdateBanner() {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, _r) {},
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  if (!needRefresh || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#0f172a] text-white px-4 py-3 rounded-xl shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300 max-w-[calc(100vw-2rem)]">
      <RefreshCw className="h-4 w-4 shrink-0 text-blue-400" />
      <span className="text-sm font-medium">Nova versão disponível!</span>
      <button
        onClick={() => { void updateServiceWorker(true); }}
        className="text-sm font-semibold bg-[#2563eb] hover:bg-blue-700 px-3 py-1 rounded-lg transition-colors shrink-0"
      >
        Atualizar
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
        aria-label="Dispensar"
      >
        <X className="h-3.5 w-3.5 opacity-60" />
      </button>
    </div>
  );
}
