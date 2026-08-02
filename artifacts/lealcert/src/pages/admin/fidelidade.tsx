import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Gift, Users, CheckCircle2, Clock, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface UserInfo {
  id: number;
  name: string;
  email: string;
  cpfCnpj: string;
}

interface CartelaInfo {
  id: number;
  userId: number;
  slots: number;
  status: "active" | "completed" | "used";
  createdAt: string;
  completedAt: string | null;
  usedAt: string | null;
  usedForOrderId: number | null;
}

interface ContadorEntry {
  user: UserInfo;
  activeCartela: CartelaInfo | null;
  completedCount: number;
  usedCount: number;
  allCartelas: CartelaInfo[];
}

interface UsedEntry {
  cartela: CartelaInfo;
  userName: string | null;
  userEmail: string | null;
}

interface LoyaltyAdminData {
  contadores: ContadorEntry[];
  usedCartelas: UsedEntry[];
}

// ── Cartela visual com edição de slots (admin) ────────────────────────────────
function AdminCartelaEditor({ cartela, onSaved }: { cartela: CartelaInfo; onSaved: () => void }) {
  const { toast } = useToast();
  const [pendingSlots, setPendingSlots] = useState<number>(cartela.slots);
  const [saving, setSaving] = useState(false);

  const changed = pendingSlots !== cartela.slots;

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/loyalty/cartelas/${cartela.id}/slots`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: pendingSlots }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao salvar");
      toast({ title: "Slots atualizados com sucesso" });
      onSaved();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }).map((_, i) => {
          const slotNum = i + 1;
          const filled = i < pendingSlots;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                // Toggle: se clicar num slot já preenchido → setar até ele; se clicar num vazio → preencher até ele
                setPendingSlots(filled && pendingSlots === slotNum ? slotNum - 1 : slotNum);
              }}
              className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black transition-all border-2 ${
                filled
                  ? "bg-[#2563eb] text-white border-blue-400 shadow-sm hover:bg-blue-700"
                  : "bg-gray-50 text-gray-400 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              }`}
              title={`Setar ${slotNum} slot${slotNum > 1 ? "s" : ""}`}
            >
              {slotNum}
            </button>
          );
        })}
      </div>
      {changed && (
        <Button size="sm" onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar ({cartela.slots} → {pendingSlots} slots)
        </Button>
      )}
    </div>
  );
}

// ── Card expandível por contador ──────────────────────────────────────────────
function ContadorCard({ entry, onRefresh }: { entry: ContadorEntry; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const activeSlots = entry.activeCartela?.slots ?? 0;
  const pct = Math.round((activeSlots / 10) * 100);

  return (
    <Card className={`transition-all ${entry.completedCount > 0 ? "border-amber-300 shadow-sm" : ""}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{entry.user.name}</p>
              {entry.completedCount > 0 && (
                <Badge className="bg-amber-400 text-amber-900 text-[10px] gap-1">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  {entry.completedCount} cortesia{entry.completedCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{entry.user.email}</p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Cartela ativa</p>
              <p className="text-sm font-bold">{activeSlots}/10</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Usadas</p>
              <p className="text-sm font-bold">{entry.usedCount}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {entry.activeCartela && (
          <div className="mt-3 space-y-1">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-amber-400" : "bg-[#2563eb]"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{10 - activeSlots} restante{10 - activeSlots !== 1 ? "s" : ""} para cortesia</p>
          </div>
        )}

        {/* Expanded: editor de slots por cartela */}
        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {entry.allCartelas.map((cartela, i) => (
              <div key={cartela.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Cartela #{i + 1}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      cartela.status === "completed" ? "border-amber-300 text-amber-600" :
                      cartela.status === "used" ? "border-gray-300 text-gray-400" :
                      "border-blue-200 text-blue-600"
                    }`}
                  >
                    {cartela.status === "completed" ? "Completa" : cartela.status === "used" ? "Usada" : "Ativa"}
                  </Badge>
                  {cartela.status !== "used" && (
                    <span className="text-[10px] text-muted-foreground ml-auto">Clique nos números para ajustar slots</span>
                  )}
                </div>
                {cartela.status === "used" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold bg-gray-100 text-gray-400 border border-gray-200">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                ) : (
                  <AdminCartelaEditor cartela={cartela} onSaved={onRefresh} />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function AdminFidelidadePage() {
  const [tab, setTab] = useState<"pontuando" | "usadas">("pontuando");
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<LoyaltyAdminData>({
    queryKey: ["admin-loyalty"],
    queryFn: async () => {
      const r = await fetch("/api/admin/loyalty", { credentials: "include" });
      if (!r.ok) throw new Error("Erro ao carregar dados");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const contadoresComAtividade = data?.contadores.filter(
    c => c.activeCartela !== null || c.completedCount > 0 || c.usedCount > 0
  ) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fidelidade — Contadores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe o programa de cortesia e ajuste manualmente os slots das cartelas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Atualizar</Button>
      </div>

      {/* Resumo */}
      {data && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Contadores com cartela</p>
              <p className="text-3xl font-black">{contadoresComAtividade.length}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-amber-600 uppercase tracking-wider mb-1">Cortesias disponíveis</p>
              <p className="text-3xl font-black text-amber-600">
                {data.contadores.reduce((s, c) => s + c.completedCount, 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Cortesias utilizadas</p>
              <p className="text-3xl font-black text-emerald-600">{data.usedCartelas.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === "pontuando" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("pontuando")}
        >
          <Users className="h-4 w-4 inline mr-1.5" />
          Pontuando ({contadoresComAtividade.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === "usadas" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("usadas")}
        >
          <Gift className="h-4 w-4 inline mr-1.5" />
          Cortesias usadas ({data?.usedCartelas.length ?? 0})
        </button>
      </div>

      {/* Tab: Pontuando */}
      {tab === "pontuando" && (
        isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contadoresComAtividade.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 text-center space-y-2">
              <Star className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Nenhum contador pontuando ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contadoresComAtividade.map(entry => (
              <ContadorCard key={entry.user.id} entry={entry} onRefresh={() => refetch()} />
            ))}
          </div>
        )
      )}

      {/* Tab: Cortesias usadas */}
      {tab === "usadas" && (
        isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.usedCartelas.length ?? 0) === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 text-center space-y-2">
              <Gift className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Nenhuma cortesia utilizada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data?.usedCartelas.map(entry => (
              <Card key={entry.cartela.id}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4 flex-wrap">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{entry.userName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{entry.userEmail ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Cartela #{entry.cartela.id}</p>
                    {entry.cartela.usedAt && (
                      <p className="text-xs font-medium text-emerald-700 flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.cartela.usedAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                    {entry.cartela.usedForOrderId && (
                      <p className="text-[10px] text-muted-foreground">Pedido #{entry.cartela.usedForOrderId}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
