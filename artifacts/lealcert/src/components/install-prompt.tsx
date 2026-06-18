import { useEffect, useRef, useState } from "react";
import { X, Download, Share, PlusSquare, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Platform = "android" | "desktop" | "ios" | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (isIOS) return "ios";
  const isAndroid = /Android/.test(ua);
  if (isAndroid) return "android";
  return "desktop";
}

function isRunningStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

const INSTALLED_KEY = "pwa_installed";

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [iosStep, setIosStep] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    // Já instalado → nunca mais mostra
    if (localStorage.getItem(INSTALLED_KEY) === "1") return;
    // Rodando como app instalado → marca e sai
    if (isRunningStandalone()) {
      localStorage.setItem(INSTALLED_KEY, "1");
      return;
    }

    const plt = detectPlatform();
    setPlatform(plt);

    if (plt === "ios") {
      // iOS não tem beforeinstallprompt — mostra instruções após delay
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    // Android / Desktop — aguarda o evento do navegador
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Se o evento já foi disparado antes de montar (alguns browsers)
    // tentamos mostrar mesmo assim após delay
    const fallback = setTimeout(() => {
      if (deferredPromptRef.current) setVisible(true);
    }, 2000);

    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(fallback);
    };
  }, []);

  async function handleInstall() {
    if (platform === "ios") {
      setIosStep(true);
      return;
    }
    if (!deferredPromptRef.current) return;
    deferredPromptRef.current.prompt();
    const { outcome } = await deferredPromptRef.current.userChoice;
    deferredPromptRef.current = null;
    if (outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
    }
    setVisible(false);
  }

  function handleDismiss() {
    setVisible(false);
    // NÃO salva nada — aparecerá novamente na próxima abertura
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="mx-auto max-w-md rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                Instalar LealCert
              </p>
              <p className="text-xs text-slate-400 leading-tight">
                Acesso rápido direto da tela inicial
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Benefícios */}
        {!iosStep && (
          <div className="px-4 py-3 space-y-1.5">
            {[
              "Abre sem precisar do navegador",
              "Notificações de pedidos e suporte",
              "Funciona offline em partes do sistema",
            ].map((b) => (
              <div key={b} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-slate-300">{b}</span>
              </div>
            ))}
          </div>
        )}

        {/* Instruções iOS */}
        {iosStep && (
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-slate-300 font-medium">
              No Safari, siga os passos:
            </p>
            <div className="space-y-2">
              {[
                { icon: Share, label: "Toque no botão Compartilhar" },
                { icon: PlusSquare, label: 'Role e toque em "Adicionar à Tela Inicial"' },
                { icon: Download, label: 'Confirme tocando em "Adicionar"' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-blue-600/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-400">{i + 1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-2 px-4 pb-4 pt-1">
          {!iosStep ? (
            <>
              <Button
                onClick={handleInstall}
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold h-9"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {platform === "ios" ? "Como instalar" : "Instalar agora"}
              </Button>
              <Button
                onClick={handleDismiss}
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-white/10 text-xs h-9 px-3"
              >
                Agora não
              </Button>
            </>
          ) : (
            <Button
              onClick={handleDismiss}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold h-9"
            >
              Entendido!
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
