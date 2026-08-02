import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ShoppingCart, TrendingUp, DollarSign, Copy, Trophy, Star, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type DashboardData = {
  totalContadores: number;
  vendasHoje: number;
  vendasMes: number;
  vendasAno: number;
  totalCerts: number;
  ganhos: number;
  bonus: number;
  saldoTotal: number;
  affiliateCode: string;
  ranking: { id: number; name: string; certsEmitidos: number }[];
};

const apiFetch = (url: string) => fetch(url, { credentials: "include" });

function useVendedorDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["vendedor-dashboard"],
    queryFn: async () => {
      const res = await apiFetch("/api/vendedor/dashboard");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

function StatCard({ title, value, sub, icon: Icon, color = "blue" }: { title: string; value: string | number; sub?: string; icon: React.ElementType; color?: "blue" | "green" | "purple" | "amber" }) {
  const colors = {
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    green:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    amber:  "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <Card className={`border ${colors[color]}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium opacity-80">{title}</p>
          <Icon className="h-5 w-5 opacity-60" />
        </div>
        <p className="text-3xl font-extrabold">{value}</p>
        {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function VendedorDashboard() {
  const { toast } = useToast();
  const { data, isLoading } = useVendedorDashboard();
  const siteUrl = window.location.origin;

  function copyLink() {
    if (!data?.affiliateCode) return;
    const url = `${siteUrl}/register?ref=${data.affiliateCode}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "Link copiado!", description: url }));
  }

  function fmtCurrency(v: number) {
    return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="py-10 text-center text-muted-foreground">Erro ao carregar dados.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meu Painel</h1>
        <p className="text-muted-foreground text-sm">Acompanhe seu desempenho e ganhos.</p>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Contadores" value={data.totalContadores} icon={Users} color="blue" sub="cadastrados por você" />
        <StatCard title="Certificados hoje" value={data.vendasHoje} icon={ShoppingCart} color="green" sub={`${data.vendasMes} no mês`} />
        <StatCard title="Certificados no ano" value={data.vendasAno} icon={TrendingUp} color="purple" sub="emitidos pelos seus contadores" />
        <StatCard title="Saldo total" value={fmtCurrency(data.saldoTotal)} icon={DollarSign} color="amber" sub={`Ganhos + Bônus`} />
      </div>

      {/* Card de ganhos detalhado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4 text-emerald-500" /> Meus Ganhos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs text-emerald-700 font-medium mb-1">Certificados emitidos</p>
              <p className="text-3xl font-extrabold text-emerald-700">{data.totalCerts}</p>
            </div>
            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700 font-medium mb-1">Ganhos por certificado</p>
              <p className="text-2xl font-extrabold text-blue-700">{fmtCurrency(data.ganhos)}</p>
            </div>
            <div className="text-center p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 font-medium mb-1">Bônus acumulado</p>
              <p className="text-2xl font-extrabold text-amber-700">{fmtCurrency(data.bonus)}</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-gray-900 rounded-lg text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Saldo Total</p>
            <p className="text-3xl font-black text-yellow-400">{fmtCurrency(data.saldoTotal)}</p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Link href="/vendedor/relatorio"><Button variant="outline" size="sm">Ver Relatório</Button></Link>
            <Link href="/vendedor/ganhos"><Button variant="outline" size="sm">Extrato de Ganhos</Button></Link>
          </div>
        </CardContent>
      </Card>

      {/* Link de afiliado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><LinkIcon className="h-4 w-4 text-blue-500" /> Meu Link de Afiliado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Compartilhe este link para novos contadores se cadastrarem vinculados a você.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md break-all font-mono text-blue-600">
              {siteUrl}/register?ref={data.affiliateCode}
            </code>
            <Button size="sm" onClick={copyLink}><Copy className="h-4 w-4 mr-1.5" /> Copiar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Ranking */}
      {data.ranking.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-yellow-500" /> Ranking de Contadores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.ranking.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? "bg-yellow-100 text-yellow-700" : idx === 1 ? "bg-gray-100 text-gray-600" : idx === 2 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                      {idx + 1}
                    </span>
                    <span className="font-medium text-sm">{item.name}</span>
                  </div>
                  <Badge variant="secondary" className="font-mono">{item.certsEmitidos} cert{item.certsEmitidos !== 1 ? "s" : ""}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
