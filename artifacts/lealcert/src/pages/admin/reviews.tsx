import { useState, useEffect, useCallback } from "react";
import { Star, Check, X, Trash2, Clock, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Review = {
  id: number;
  name: string;
  role: string;
  text: string;
  stars: number;
  status: string;
  userId: number | null;
  createdAt: string;
};

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= value ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`}
        />
      ))}
    </div>
  );
}

const TABS = [
  { key: "pending",  label: "Pendentes",  icon: Clock,       color: "text-amber-600 bg-amber-50 border-amber-200" },
  { key: "approved", label: "Aprovados",  icon: ThumbsUp,    color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { key: "rejected", label: "Rejeitados", icon: ThumbsDown,  color: "text-red-600 bg-red-50 border-red-200" },
] as const;

export default function AdminReviews() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/reviews?status=${status}`, { credentials: "include" });
      const data = await r.json();
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Erro ao carregar avaliações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadCounts = useCallback(async () => {
    try {
      const [p, a, r] = await Promise.all([
        fetch("/api/admin/reviews?status=pending", { credentials: "include" }).then(r => r.json()),
        fetch("/api/admin/reviews?status=approved", { credentials: "include" }).then(r => r.json()),
        fetch("/api/admin/reviews?status=rejected", { credentials: "include" }).then(r => r.json()),
      ]);
      setCounts({
        pending: Array.isArray(p) ? p.length : 0,
        approved: Array.isArray(a) ? a.length : 0,
        rejected: Array.isArray(r) ? r.length : 0,
      });
    } catch {}
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  async function updateStatus(id: number, status: "approved" | "rejected" | "pending") {
    try {
      const r = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      toast({ title: status === "approved" ? "Avaliação aprovada ✓" : status === "rejected" ? "Avaliação rejeitada" : "Movida para pendente" });
      await load(tab);
      await loadCounts();
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  }

  async function deleteReview(id: number) {
    if (!confirm("Excluir esta avaliação permanentemente?")) return;
    try {
      const r = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
      toast({ title: "Avaliação excluída" });
      await load(tab);
      await loadCounts();
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avaliações</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie as avaliações enviadas pelos clientes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { load(tab); loadCounts(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${t.color}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Review cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma avaliação {tab === "pending" ? "pendente" : tab === "approved" ? "aprovada" : "rejeitada"}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reviews.map(review => (
            <div key={review.id} className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{review.name}</p>
                  <p className="text-xs text-muted-foreground">{review.role}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <StarDisplay value={review.stars} />
                </div>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed line-clamp-4">{review.text}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                {review.userId && <span className="ml-2 text-blue-500">• Usuário #{review.userId}</span>}
              </p>
              <div className="flex items-center gap-2 pt-1 border-t">
                {tab !== "approved" && (
                  <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1.5" onClick={() => updateStatus(review.id, "approved")}>
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                )}
                {tab !== "rejected" && (
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-8 text-xs gap-1.5" onClick={() => updateStatus(review.id, "rejected")}>
                    <X className="h-3.5 w-3.5" /> Rejeitar
                  </Button>
                )}
                {tab !== "pending" && (
                  <Button size="sm" variant="ghost" className="text-muted-foreground h-8 text-xs gap-1.5" onClick={() => updateStatus(review.id, "pending")}>
                    <Clock className="h-3.5 w-3.5" /> Pendente
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive h-8 text-xs gap-1.5" onClick={() => deleteReview(review.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
