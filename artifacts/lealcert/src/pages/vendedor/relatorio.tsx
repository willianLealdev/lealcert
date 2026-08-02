import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart2, Search } from "lucide-react";

type RelatorioRow = {
  id: number; orderNumber: string; userId: number; contadorName: string;
  certNameSnapshot: string | null; total: string; totalNum: number;
  paymentMethod: string | null; createdAt: string;
};

const apiFetch = (url: string) => fetch(url, { credentials: "include" });

function formatDate(d: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

function useRelatorio(from: string, to: string) {
  return useQuery<RelatorioRow[]>({
    queryKey: ["vendedor-relatorio", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const res = await apiFetch(`/api/vendedor/relatorio?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

export default function VendedorRelatorio() {
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo]     = useState(today.toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const { data, isLoading } = useRelatorio(from, to);

  const filtered = data?.filter(r =>
    !search || r.contadorName.toLowerCase().includes(search.toLowerCase()) ||
    r.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
    (r.certNameSnapshot ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const totalCerts = filtered.length;
  const totalValor = filtered.reduce((s, r) => s + r.totalNum, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="h-7 w-7 text-blue-500" /> Relatório de Vendas
        </h1>
        <p className="text-muted-foreground text-sm">Pedidos concluídos pelos seus contadores.</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Contador, pedido..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-xs text-emerald-700 font-medium">Certificados emitidos</p>
              <p className="text-3xl font-extrabold text-emerald-700">{totalCerts}</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-xs text-blue-700 font-medium">Faturamento dos contadores</p>
              <p className="text-2xl font-extrabold text-blue-700">R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !filtered.length ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado neste período.</div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedido</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contador</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Certificado</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Pagamento</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{r.orderNumber}</td>
                      <td className="px-4 py-3 font-medium">{r.contadorName}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{r.certNameSnapshot ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold">R$ {r.totalNum.toFixed(2)}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <Badge variant="outline" className="text-xs capitalize">{r.paymentMethod ?? "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
