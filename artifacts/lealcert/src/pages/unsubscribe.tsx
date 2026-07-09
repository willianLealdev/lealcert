import { useEffect, useState } from "react";

type State = "loading" | "success" | "already" | "error";

export default function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setState("error");
      return;
    }

    fetch(`/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "GET",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState(data.already ? "already" : "success");
        } else if (res.status === 404) {
          setState("error");
        } else {
          setState("error");
        }
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="LealCert" className="h-16 w-auto object-contain" />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
          {state === "loading" && (
            <>
              <div className="flex justify-center">
                <div className="h-10 w-10 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
              </div>
              <p className="text-white/60 text-sm">Processando seu descadastro…</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-bold text-white">Descadastro realizado</h1>
              <p className="text-white/60 text-sm leading-relaxed">
                Você foi removido da nossa lista de e-mails.<br />
                Não receberá mais comunicações de marketing.
              </p>
              <p className="text-white/30 text-xs">
                Se foi um engano, entre em contato conosco pelo site.
              </p>
            </>
          )}

          {state === "already" && (
            <>
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <svg className="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-bold text-white">Já descadastrado</h1>
              <p className="text-white/60 text-sm">
                Você já estava fora da nossa lista de e-mails.
              </p>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-bold text-white">Link inválido</h1>
              <p className="text-white/60 text-sm">
                Este link de descadastro é inválido ou já expirou.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          © {new Date().getFullYear()} LealCert — Certificados Digitais
        </p>
      </div>
    </div>
  );
}
