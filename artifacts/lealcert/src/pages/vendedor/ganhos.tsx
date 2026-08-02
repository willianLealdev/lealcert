import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, Star, Wallet, CheckCircle, Receipt, Filter, X } from "lucide-react";

type GanhosData = {
  meses: { mes: string; certsEmitidos: number; ganho: number }[];
  totalCerts: number;
  ganhos: number;
  bonus: number;
  saldoTotal: number;
  totalPago: number;
  saldoReceber: number;
  valorPorCert: number;
  valorBonus: number;
  qtdCertsBonus: number;
};

type Pagamento = {
  id: number;
  valor: string;
  dataPagamento: string;
  observacao: string | null;
  createdAt: string;
};

const apiFetch = (url: string) => fetch(url, { credentials: "include" });

function useGanhos() {
  return useQuery<GanhosData>({
    queryKey: ["vendedor-ganhos"],
    queryFn: async () => {
      const res = await apiFetch("/api/vendedor/ganhos");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

function usePagamentos(from: string, to: string) {
  return useQuery<Pagamento[]>({
    queryKey: ["vendedor-pagamentos", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await apiFetch(`/api/vendedor/pagamentos${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMes(mes: string) {
  const [year, month] = mes.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function VendedorGanhos() {
  const { data, isLoading } = useGanhos();
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const { data: pagamentos, isLoading: pagLoading } = usePagamentos(appliedFrom, appliedTo);

  function applyFilter() {
    setAppliedFrom(filterFrom);
    setAppliedTo(filterTo);
  }

  function clearFilter() {
    setFilterFrom("");
    setFilterTo("");
    setAppliedFrom("");
    setAppliedTo("");
  }

  const isFiltered = appliedFrom !== "" || appliedTo !== "";

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="py-10 text-center text-muted-foreground">Erro ao carregar dados.</div>;

  const bonusEarnedCount = Math.floor(data.totalCerts / data.qtdCertsBonus);
  const nextBonusAt = data.qtdCertsBonus - (data.totalCerts % data.qtdCertsBonus);

  const totalPago = data.totalPago ?? 0;
  const saldoReceber = data.saldoReceber ?? data.saldoTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-emerald-500" /> Meus Ganhos
        </h1>
        <p className="text-muted-foreground text-sm">Extrato de comissões e bônus acumulados.</p>
      </div>

      {/* Resumo principal */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="pt-5 pb-4 text-center">
            <TrendingUp className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-emerald-700 font-medium">Total certificados</p>
            <p className="text-3xl font-extrabold text-emerald-700">{data.totalCerts}</p>
            <p className="text-xs text-emerald-600 mt-1">{fmtCurrency(data.valorPorCert)} por cert</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-5 pb-4 text-center">
            <DollarSign className="h-6 w-6 text-blue-500 mx-auto mb-2" />
            <p className="text-xs text-blue-700 font-medium">Ganhos por certificado</p>
            <p className="text-2xl font-extrabold text-blue-700">{fmtCurrency(data.ganhos)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-5 pb-4 text-center">
            <Star className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="text-xs text-amber-700 font-medium">Bônus acumulado</p>
            <p className="text-2xl font-extrabold text-amber-700">{fmtCurrency(data.bonus)}</p>
            <p className="text-xs text-amber-600 mt-1">{bonusEarnedCount}× bônus atingido</p>
          </CardContent>
        </Card>
      </div>

      {/* Saldo bruto / pago / a receber */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800 sm:col-span-3">
          <CardContent className="pt-6 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Saldo Bruto Acumulado</p>
                <p className="text-3xl sm:text-4xl font-black text-white">{fmtCurrency(data.saldoTotal)}</p>
                <p className="text-gray-500 text-xs mt-1">{fmtCurrency(data.ganhos)} em certs + {fmtCurrency(data.bonus)} em bônus</p>
              </div>
              <div className="border-t sm:border-t-0 sm:border-l border-gray-700 pt-4 sm:pt-0">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <p className="text-gray-400 text-xs uppercase tracking-widest">Já Pago</p>
                </div>
                <p className="text-3xl sm:text-4xl font-black text-emerald-400">{fmtCurrency(totalPago)}</p>
                <p className="text-gray-500 text-xs mt-1">Pagamentos registrados pelo admin</p>
              </div>
              <div className="border-t sm:border-t-0 sm:border-l border-gray-700 pt-4 sm:pt-0">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-yellow-400" />
                  <p className="text-gray-400 text-xs uppercase tracking-widest">A Receber</p>
                </div>
                <p className="text-3xl sm:text-4xl font-black text-yellow-400">{fmtCurrency(saldoReceber)}</p>
                <p className="text-gray-500 text-xs mt-1">Saldo ainda não pago</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Próximo bônus */}
      {data.qtdCertsBonus > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-amber-800">Próximo bônus de {fmtCurrency(data.valorBonus)}</p>
              <p className="text-xs text-amber-600 font-semibold">{nextBonusAt === data.qtdCertsBonus ? data.qtdCertsBonus : data.qtdCertsBonus - nextBonusAt} / {data.qtdCertsBonus}</p>
            </div>
            <div className="w-full bg-amber-200 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((data.totalCerts % data.qtdCertsBonus) / data.qtdCertsBonus) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-amber-700 mt-1.5">Faltam <strong>{nextBonusAt}</strong> certificados para o próximo bônus.</p>
          </CardContent>
        </Card>
      )}

      {/* Tabela mensal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {data.meses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum certificado emitido ainda.</div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mês</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Certificados</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ganho</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.meses].reverse().map(r => (
                    <tr key={r.mes} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium capitalize">{fmtMes(r.mes)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.certsEmitidos}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmtCurrency(r.ganho)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 font-bold border-t-2">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right font-mono">{data.totalCerts}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{fmtCurrency(data.ganhos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de pagamentos recebidos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle className="text-base flex items-center gap-2 shrink-0">
              <Receipt className="h-4 w-4 text-emerald-500" />
              Pagamentos Recebidos
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="date"
                  value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  className="h-8 text-xs w-36"
                  placeholder="De"
                />
                <span className="text-muted-foreground text-xs">até</span>
                <Input
                  type="date"
                  value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  className="h-8 text-xs w-36"
                  placeholder="Até"
                />
              </div>
              <Button size="sm" variant="default" className="h-8 text-xs px-3" onClick={applyFilter}>
                Filtrar
              </Button>
              {isFiltered && (
                <Button size="sm" variant="ghost" className="h-8 text-xs px-2 text-muted-foreground" onClick={clearFilter}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pagLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Carregando...</div>
          ) : !pagamentos || pagamentos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {isFiltered ? "Nenhum pagamento encontrado nesse período." : "Nenhum pagamento registrado ainda."}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        {new Date(p.dataPagamento).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 font-mono">
                        {fmtCurrency(parseFloat(p.valor))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">{p.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 font-bold border-t-2">
                    <td className="px-4 py-3">Total pago</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-mono">
                      {fmtCurrency(pagamentos.reduce((s, p) => s + parseFloat(p.valor), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
