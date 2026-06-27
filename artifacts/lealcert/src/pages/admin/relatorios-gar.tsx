import { useState, useMemo } from "react";
import { useGetGarParceiroVendas, type GarParceiroVendasItem } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart2, Search, ExternalLink, Loader2 } from "lucide-react";

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatBRL(value?: number): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(raw?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_LABELS: Record<number, string> = {
  1: "Aguardando pagamento",
  2: "Pago",
  3: "Cancelado",
  4: "Emitido",
  5: "Expirado",
};

export default function AdminRelatoriosGar() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dataInicial, setDataInicial] = useState(toInputDate(firstDay));
  const [dataFinal, setDataFinal] = useState(toInputDate(now));
  const [query, setQuery] = useState({ dataInicial: toInputDate(firstDay), dataFinal: toInputDate(now) });

  const { data, isFetching, error } = useGetGarParceiroVendas(query);

  const items = data ?? [];

  const totais = useMemo(() => {
    const total = items.reduce((acc: number, i: GarParceiroVendasItem) => acc + (i.ValorTotal ?? 0), 0);
    const encontrados = items.filter((i: GarParceiroVendasItem) => i.localOrderId != null).length;
    return { total, encontrados, count: items.length };
  }, [items]);

  function handleConsultar() {
    setQuery({ dataInicial, dataFinal });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Relatórios GAR</h1>
          <p className="text-sm text-slate-500">Vendas do parceiro consultadas diretamente na Gestão AR</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período</CardTitle>
          <CardDescription>Selecione o intervalo de datas para consultar as vendas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="dataInicial">Data inicial</Label>
              <Input
                id="dataInicial"
                type="date"
                value={dataInicial}
                onChange={e => setDataInicial(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dataFinal">Data final</Label>
              <Input
                id="dataFinal"
                type="date"
                value={dataFinal}
                onChange={e => setDataFinal(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={handleConsultar} disabled={isFetching} className="gap-2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 text-sm text-red-700 space-y-1">
            <p className="font-semibold">Erro ao consultar a Gestão AR (Juntos)</p>
            <p className="text-red-600">
              {(() => {
                const msg = (error as { data?: { error?: string }; message?: string })?.data?.error
                  ?? (error as { message?: string })?.message
                  ?? "";
                if (msg.includes("Hash do Vendedor")) return msg;
                if (msg.includes("502") || msg.includes("<!DOCTYPE") || msg.includes("html"))
                  return "O servidor da Gestão AR retornou erro 502. Verifique se a API Key e o Hash do Vendedor estão corretos nas Configurações.";
                if (msg.includes("401") || msg.includes("403"))
                  return "Credenciais inválidas. Verifique a API Key e o Hash do Vendedor nas Configurações.";
                if (msg.includes("404"))
                  return "Endpoint não encontrado. Verifique as configurações da Gestão AR.";
                return "Não foi possível buscar os dados. Verifique as configurações da Gestão AR e tente novamente.";
              })()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Totalizadores */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total de vendas</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totais.count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Valor total</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatBRL(totais.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Encontrados localmente</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {totais.encontrados}
                <span className="text-sm font-normal text-slate-500 ml-1">/ {totais.count}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isFetching ? "Carregando..." : items.length > 0 ? `${items.length} registro(s) encontrado(s)` : "Resultados"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isFetching ? (
            <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Consultando Gestão AR...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              Nenhum registro encontrado para o período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido GAR</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Forma Pagto.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status GAR</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Pedido local</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: GarParceiroVendasItem, idx: number) => (
                    <TableRow key={item.HashVenda ?? idx}>
                      <TableCell className="font-mono text-xs">{item.PedidoVenda ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate" title={item.ProdutoVenda ?? ""}>
                        {item.ProdutoVenda ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{item.EmailCliente ?? "—"}</TableCell>
                      <TableCell className="text-xs">{item.FormaPagamentoDescricao ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {item.sValor ?? formatBRL(item.ValorTotal)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">
                          {item.Status != null
                            ? STATUS_LABELS[item.Status] ?? `Status ${item.Status}`
                            : item.Descricao ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(item.DataEscrita)}</TableCell>
                      <TableCell>
                        {item.localOrderId != null ? (
                          <Link href={`/orders/${item.localOrderId}`}>
                            <Badge variant="outline" className="gap-1 cursor-pointer border-green-500 text-green-700 hover:bg-green-50">
                              <ExternalLink className="h-3 w-3" />
                              #{item.localOrderId}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-slate-400">
                            Não encontrado
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
