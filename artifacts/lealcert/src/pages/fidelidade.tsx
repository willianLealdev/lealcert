import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Star, Gift, CheckCircle2, ChevronRight, Loader2, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Cartela {
  id: number;
  userId: number;
  slots: number;
  status: "active" | "completed" | "used";
  createdAt: string;
  completedAt: string | null;
  usedAt: string | null;
}

interface LoyaltyData {
  cartelas: Cartela[];
  availableCortesias: number;
}

// ── Cartela individual estilo premium ─────────────────────────────────────────
function CartelaCard({ cartela, index }: { cartela: Cartela; index: number }) {
  const isCompleted = cartela.status === "completed";
  const isUsed      = cartela.status === "used";
  const isActive    = cartela.status === "active";
  const slots       = Math.min(cartela.slots, 10);

  if (isUsed) {
    return (
      <div className="relative rounded-3xl overflow-hidden bg-[#1e293b]/60 border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Cartela #{index + 1} — Utilizada
          </span>
          {cartela.usedAt && (
            <span className="text-xs text-slate-600">
              {new Date(cartela.usedAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-slate-600 bg-slate-800 border border-slate-700"
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Cores da cartela
  const bg = isCompleted
    ? "bg-gradient-to-br from-[#f59e0b] via-[#f97316] to-[#ea580c]"
    : "bg-gradient-to-br from-[#f59e0b] to-[#f97316]";

  return (
    <div className={`relative rounded-3xl overflow-hidden ${bg} p-6 shadow-xl`}>
      {/* Bolhas decorativas de fundo */}
      <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/10" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 bg-black/20 rounded-full px-3 py-1.5">
          <Star className="h-3.5 w-3.5 text-white fill-white" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {isCompleted ? "Cortesia disponível!" : "Programa de cortesia"}
          </span>
        </div>
        <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">
          #{index + 1}
        </span>
      </div>

      {/* Headline */}
      <div className="relative mb-1">
        <p className="text-sm text-white/80 font-medium">A cada 10 certificados emitidos</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-5xl font-black text-white tracking-tight">+1</span>
          <span className="text-xl font-bold text-white/90">certificado grátis</span>
        </div>
        <p className="text-xs text-white/60 mt-1">
          Cortesia acumulada no portal e disponível para usar como desejar
        </p>
      </div>

      {/* Slots internos */}
      <div className="relative mt-5 bg-white/15 rounded-2xl p-4 backdrop-blur-sm">
        <p className="text-xs font-semibold text-white/70 mb-3">
          {isCompleted ? "Cartela completa — cortesia desbloqueada:" : `Progresso — ${slots}/10 certificados:`}
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const filled = i < slots;
            const isTenth = i === 9 && filled;

            return (
              <div
                key={i}
                className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black transition-all
                  ${
                    isTenth && isCompleted
                      ? "bg-[#0f172a] text-amber-400 shadow-lg shadow-black/40 scale-110"
                      : filled && isCompleted
                      ? "bg-[#0f172a] text-white shadow-md"
                      : filled
                      ? "bg-white/25 text-white border-2 border-white/40 shadow-sm"
                      : "bg-white/10 text-white/40 border border-white/20"
                  }`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>

        {isActive && slots < 10 && (
          <p className="text-xs text-white/60 mt-3">
            A cada 10 emitidos → 1 cortesia disponível no portal
          </p>
        )}
        {isCompleted && (
          <p className="text-xs font-semibold text-white mt-3">
            A cada 10 emitidos → 1 cortesia disponível no portal ✓
          </p>
        )}
      </div>

      {/* Footer bullets */}
      <div className="relative mt-4 space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-white/80">
          <CheckCircle2 className="h-4 w-4 text-white/60 shrink-0" />
          <span>Usa como quiser — para o escritório ou para um cliente</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/80">
          <CheckCircle2 className="h-4 w-4 text-white/60 shrink-0" />
          <span>Acumula sem prazo de validade</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function FidelidadePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if ((user as { userType?: string }).userType !== "contador") {
      navigate("/dashboard");
      return;
    }
    fetch("/api/loyalty/me", { credentials: "include" })
      .then(r => r.json())
      .then(setData)
      .catch(() => toast({ title: "Erro ao carregar fidelidade", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const completedCartelas = data.cartelas.filter(c => c.status === "completed");
  const activeCartelas    = data.cartelas.filter(c => c.status === "active");
  const usedCartelas      = data.cartelas.filter(c => c.status === "used");
  // Ordem: completed primeiro (cortesia p/ usar), depois active, depois used
  const allVisible        = [...completedCartelas, ...activeCartelas, ...usedCartelas];

  const totalSlots = data.cartelas.reduce((s, c) => s + (c.status === "used" ? 10 : c.slots), 0);

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Fidelidade</h1>
          <p className="text-slate-400 text-sm mt-1">
            Seu programa de certificados grátis
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/8">
            <p className="text-slate-400 text-xs font-medium mb-1">Emitidos</p>
            <p className="text-3xl font-black text-white">{totalSlots}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">total acumulado</p>
          </div>
          <div className={`rounded-2xl p-4 border ${data.availableCortesias > 0 ? "bg-amber-500/20 border-amber-500/30" : "bg-white/5 border-white/8"}`}>
            <p className={`text-xs font-medium mb-1 ${data.availableCortesias > 0 ? "text-amber-400" : "text-slate-400"}`}>
              Cortesias
            </p>
            <p className={`text-3xl font-black ${data.availableCortesias > 0 ? "text-amber-400" : "text-white"}`}>
              {data.availableCortesias}
            </p>
            <p className="text-slate-500 text-[10px] mt-0.5">disponíveis</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/8">
            <p className="text-slate-400 text-xs font-medium mb-1">Usadas</p>
            <p className="text-3xl font-black text-white">{usedCartelas.length}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">aproveitadas</p>
          </div>
        </div>

        {/* Banner cortesia disponível */}
        {data.availableCortesias > 0 && (
          <button
            className="w-full flex items-center justify-between gap-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl px-5 py-4 text-left shadow-lg shadow-amber-900/30 hover:opacity-95 transition-opacity"
            onClick={() => navigate("/orders/new")}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">
                  {data.availableCortesias} cortesia{data.availableCortesias > 1 ? "s" : ""} pronta{data.availableCortesias > 1 ? "s" : ""} para usar!
                </p>
                <p className="text-white/70 text-xs mt-0.5">
                  Selecione "Certificado Cortesia" no checkout
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-white/70 shrink-0" />
          </button>
        )}

        {/* Cartelas */}
        {allVisible.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 py-16 text-center space-y-3">
            <Award className="h-10 w-10 mx-auto text-slate-600" />
            <p className="font-semibold text-slate-400">Sua jornada começa aqui</p>
            <p className="text-sm text-slate-600 max-w-xs mx-auto">
              Emita seu primeiro certificado para iniciar a contagem de fidelidade.
            </p>
            <button
              onClick={() => navigate("/orders/new")}
              className="mt-2 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Emitir certificado
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {allVisible.map((c) => (
              <CartelaCard key={c.id} cartela={c} index={allVisible.indexOf(c) + 1} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
