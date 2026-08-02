import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Star, Gift, CheckCircle2, Lock, Loader2, Award, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function CartelaCard({ cartela, index }: { cartela: Cartela; index: number }) {
  const isCompleted = cartela.status === "completed";
  const isUsed = cartela.status === "used";
  const isActive = cartela.status === "active";

  const slots = Math.min(cartela.slots, 10);

  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        isCompleted ? "border-amber-400 shadow-lg shadow-amber-100" :
        isUsed ? "border-gray-200 opacity-60" :
        "border-border"
      }`}
    >
      {isCompleted && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-yellow-300" />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Cartela #{index + 1}
          </CardTitle>
          <Badge
            variant="outline"
            className={
              isCompleted ? "border-amber-400 text-amber-600 bg-amber-50" :
              isUsed ? "border-gray-300 text-gray-500" :
              "border-blue-200 text-blue-600 bg-blue-50"
            }
          >
            {isCompleted ? "✦ Cortesia disponível" : isUsed ? "Utilizada" : `${slots}/10`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Slots visual */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const filled = i < slots;
            return (
              <div
                key={i}
                className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black transition-all ${
                  isUsed
                    ? "bg-gray-100 text-gray-400 border border-gray-200"
                    : filled && isCompleted
                    ? "bg-amber-500 text-white border-2 border-amber-400 shadow-sm"
                    : filled
                    ? "bg-[#2563eb] text-white border-2 border-blue-400 shadow-sm"
                    : "bg-gray-50 text-gray-300 border border-gray-200"
                }`}
              >
                {filled ? (isUsed ? i + 1 : <CheckCircle2 className="h-5 w-5" />) : i + 1}
              </div>
            );
          })}
        </div>

        {/* Status info */}
        {isCompleted && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Star className="h-5 w-5 text-amber-500 fill-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              Cartela completa! Você ganhou 1 certificado grátis.
            </p>
          </div>
        )}
        {isUsed && cartela.usedAt && (
          <p className="text-xs text-muted-foreground">
            Utilizada em {new Date(cartela.usedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
        {isActive && slots > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-[#2563eb] h-2 rounded-full transition-all"
              style={{ width: `${(slots / 10) * 100}%` }}
            />
          </div>
        )}
        {isActive && (
          <p className="text-xs text-muted-foreground">
            {10 - slots} certificado{10 - slots !== 1 ? "s" : ""} restante{10 - slots !== 1 ? "s" : ""} para a próxima cortesia
          </p>
        )}
      </CardContent>
    </Card>
  );
}

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

  const activeCartelas  = data.cartelas.filter(c => c.status === "active");
  const completedCartelas = data.cartelas.filter(c => c.status === "completed");
  const usedCartelas    = data.cartelas.filter(c => c.status === "used");
  const allVisible      = [...completedCartelas, ...activeCartelas, ...usedCartelas];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programa de Fidelidade</h1>
        <p className="text-muted-foreground text-sm mt-1">
          A cada 10 certificados emitidos, você ganha 1 certificado grátis.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-[#2563eb] to-blue-700 text-white border-0">
          <CardContent className="pt-5 pb-4">
            <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">Emitidos (total)</p>
            <p className="text-4xl font-black">{data.cartelas.reduce((s, c) => s + (c.status === "used" ? 10 : c.slots), 0)}</p>
            <p className="text-blue-200 text-xs mt-1">certificados na plataforma</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${data.availableCortesias > 0 ? "bg-gradient-to-br from-amber-400 to-yellow-500" : "bg-gradient-to-br from-gray-100 to-gray-200"}`}>
          <CardContent className="pt-5 pb-4">
            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${data.availableCortesias > 0 ? "text-amber-900" : "text-gray-500"}`}>
              Cortesias disponíveis
            </p>
            <p className={`text-4xl font-black ${data.availableCortesias > 0 ? "text-amber-900" : "text-gray-400"}`}>
              {data.availableCortesias}
            </p>
            <p className={`text-xs mt-1 ${data.availableCortesias > 0 ? "text-amber-800" : "text-gray-400"}`}>
              {data.availableCortesias > 0 ? "prontas para usar" : "nenhuma disponível"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-5 pb-4">
            <p className="text-emerald-700 text-xs font-medium uppercase tracking-wider mb-1">Já utilizadas</p>
            <p className="text-4xl font-black text-emerald-800">{usedCartelas.length}</p>
            <p className="text-emerald-600 text-xs mt-1">cortesias aproveitadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Banner cortesia disponível */}
      {data.availableCortesias > 0 && (
        <Card className="border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-md">
          <CardContent className="pt-5 pb-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-amber-400 flex items-center justify-center shrink-0">
                <Gift className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-amber-900">
                  {data.availableCortesias} cortesia{data.availableCortesias > 1 ? "s" : ""} disponível{data.availableCortesias > 1 ? "s" : ""}!
                </p>
                <p className="text-sm text-amber-700">
                  Use na próxima compra — selecione "Certificado Cortesia" no checkout
                </p>
              </div>
            </div>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
              onClick={() => navigate("/orders/new")}
            >
              Usar agora <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cartelas */}
      {allVisible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <Award className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">Sua jornada começa aqui</p>
            <p className="text-sm text-muted-foreground">
              Emita seu primeiro certificado para iniciar a contagem de fidelidade.
            </p>
            <Button variant="outline" onClick={() => navigate("/orders/new")}>
              Emitir certificado
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Suas cartelas</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {allVisible.map((c, i) => (
              <CartelaCard key={c.id} cartela={c} index={allVisible.indexOf(c)} />
            ))}
          </div>
        </div>
      )}

      {/* Como funciona */}
      <Card className="bg-[#0f172a] text-white border-0">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-blue-200/70">
          <div className="flex gap-3">
            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p>A cada certificado <strong className="text-white">emitido e concluído</strong>, um slot é marcado automaticamente na sua cartela.</p>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p>Ao completar 10 slots, você ganha <strong className="text-amber-400">1 certificado grátis</strong> — disponível no checkout.</p>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>Cortesias se <strong className="text-white">acumulam</strong> e não têm prazo de validade.</p>
          </div>
          <div className="flex gap-3">
            <Lock className="h-4 w-4 text-blue-400/60 shrink-0 mt-0.5" />
            <p>A opção "Certificado Cortesia" só aparece no checkout após a validação no servidor — nunca antes.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
