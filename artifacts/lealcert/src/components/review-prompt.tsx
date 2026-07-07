import { useState, useEffect } from "react";
import { Star, X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "lc_review_dismissed";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              i <= (hover || value) ? "text-amber-400 fill-amber-400" : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", text: "", stars: 5 });

  useEffect(() => {
    if (!user || user.role === "admin" || user.role === "agente") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    fetch("/api/reviews/my-status", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (!data.hasReviewed) {
          setForm(f => ({ ...f, name: user.name || "", role: "Contador" }));
          setTimeout(() => setVisible(true), 2500);
        }
      })
      .catch(() => {});
  }, [user]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setDone(true);
        localStorage.setItem(STORAGE_KEY, "1");
        setTimeout(() => setVisible(false), 3000);
      }
    } catch {}
    setLoading(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[340px] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0f172a]">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="text-white text-sm font-semibold">Sua opinião importa!</span>
        </div>
        <button onClick={dismiss} className="text-white/60 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {done ? (
          <div className="py-4 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-gray-800">Avaliação enviada!</p>
            <p className="text-xs text-gray-500">Será publicada após aprovação. Obrigado!</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-gray-500">Como foi sua experiência com a LealCert?</p>
            <StarPicker value={form.stars} onChange={v => setForm(f => ({ ...f, stars: v }))} />
            <div>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Seu nome"
                required
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <input
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Profissão / Cidade (ex: Contador — SP)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <textarea
                rows={3}
                required
                value={form.text}
                onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                placeholder="Conte como foi sua experiência..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar avaliação
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Agora não
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
