import { useState } from "react";
import { useGetGarRenovacoes } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle, CalendarDays } from "lucide-react";

function formatDate(d: string | undefined | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(d));
}

function formatBRL(v: number | undefined | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function statusVariant(status: string | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes("vencer") || s.includes("renov")) return "outline";
  if (s.includes("vencido") || s.includes("expirado")) return "destructive";
  return "secondary";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function nDaysAhead(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function AdminRenovacoes() {
  const [dataInicial, setDataInicial] = useState(nDaysAgo(30));
  const [dataFinal, setDataFinal] = useState(nDaysAhead(30));
  const [query, setQuery] = useState({ dataInicial: nDaysAgo(30), dataFinal: nDaysAhead(30) });

  const { data, isLoading, isError, refetch, isFetching } = useGetGarRenovacoes(
    { dataInicial: query.dataInicial, dataFinal: query.dataFinal }
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery({ dataInicial, dataFinal });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Renovações</h1>
          <p className="text-muted-foreground">Extrato de renovações de certificados digitais via Gestão AR.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />Período</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dataInicial}
                onChange={e => setDataInicial(e.target.value)}
                max={today()}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dataFinal}
                onChange={e => setDataFinal(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading || isFetching}>
              {(isLoading || isFetching) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Resultados */}
      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Consultando Gestão AR...</p>
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive/60" />
            <p className="font-medium text-destructive">Não foi possível carregar as renovações.</p>
            <p className="text-sm text-muted-foreground">Verifique se as credenciais da Gestão AR estão configuradas em <strong>Configurações</strong>.</p>
          </CardContent>
        </Card>
      ) : !data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 opacity-30" />
            <p>Nenhuma renovação encontrada para o período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{data.length} renovação(ões) encontrada(s)</p>
          <div className="space-y-3">
            {data.map((item, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{item.Cliente ?? "—"}</span>
                        {item.StatusRenovacao && (
                          <Badge variant={statusVariant(item.StatusRenovacao)}>
                            {item.StatusRenovacao}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{item.CPF ?? item.CNPJ ?? "—"}</p>
                      {item.RazaoSocial && <p className="text-xs text-muted-foreground">{item.RazaoSocial}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-primary">{formatBRL(item.ValorProduto)}</p>
                      <p className="text-xs text-muted-foreground">{item.Produto}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground mb-0.5">Pedido</p>
                      <p className="font-mono">{item.Pedido ?? "—"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-0.5">Emissão</p>
                      <p>{formatDate(item.DataEmissao)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-0.5">Expiração</p>
                      <p>{formatDate(item.DataExpiracao)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-0.5">Contato</p>
                      <p>{item.Telefone ?? item.Email ?? "—"}</p>
                    </div>
                    {item.Observacao && (
                      <div className="col-span-2 sm:col-span-4">
                        <p className="font-medium text-foreground mb-0.5">Observação</p>
                        <p>{item.Observacao}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
