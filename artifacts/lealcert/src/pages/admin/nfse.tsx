import { useState } from "react";
import { useListNfse, useCancelNfse } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, XCircle, RefreshCw, Receipt, AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react";
import { Link } from "wouter";

const STATUS_LABEL: Record<string, string> = {
  emitting: "Processando",
  emitted: "Emitida",
  failed: "Falhou",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  emitting: "secondary",
  emitted: "default",
  failed: "destructive",
  rejected: "destructive",
  cancelled: "outline",
};

function StatusBadge({ status, ambiente }: { status: string; ambiente: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const variant = STATUS_VARIANT[status] ?? "secondary";
  return (
    <div className="flex flex-col gap-1 items-start">
      <Badge variant={variant}>{label}</Badge>
      {ambiente === "homologacao" && (
        <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Homologação</span>
      )}
    </div>
  );
}

function formatBRL(v: string | null | undefined) {
  const n = parseFloat(v ?? "0");
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function downloadBase64(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function AdminNfse() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Record<string, unknown> | null>(null);

  const { data: invoices = [], isLoading, refetch } = useListNfse(
    undefined,
    { query: { queryKey: ["nfse"], refetchInterval: 10000 } }
  );

  const cancelMutation = useCancelNfse({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ Nota cancelada com sucesso" });
        setCancelId(null);
        void refetch();
      },
      onError: (e: unknown) => {
        toast({ title: "Erro ao cancelar nota", description: (e as Error).message, variant: "destructive" });
        setCancelId(null);
      },
    },
  });

  const filtered = invoices.filter(inv => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!String(inv.orderId ?? "").includes(q) && !String(inv.numeroNfse ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: invoices.length,
    emitted: invoices.filter(i => i.status === "emitted").length,
    failed: invoices.filter(i => i.status === "failed").length,
    processing: invoices.filter(i => i.status === "emitting").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Notas Fiscais (NFS-e)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie todas as notas fiscais de serviço emitidas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Atualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total de notas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.emitted}</div>
            <div className="text-xs text-muted-foreground">Emitidas com sucesso</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Com falha / Rejeitadas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats.processing}</div>
            <div className="text-xs text-muted-foreground">Em processamento</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por pedido ou N° NFS-e..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="emitted">Emitidas</SelectItem>
            <SelectItem value="failed">Com falha</SelectItem>
            <SelectItem value="rejected">Rejeitadas</SelectItem>
            <SelectItem value="emitting">Processando</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} nota{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Receipt className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma nota fiscal encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedido</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">N° NFS-e</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => (
                    <tr key={inv.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        {inv.orderId ? (
                          <Link href={`/orders/${inv.orderId}`}>
                            <span className="text-primary hover:underline font-medium">#{inv.orderId}</span>
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {inv.numeroNfse ? (
                          <span className="text-foreground">{inv.numeroNfse}</span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {inv.valorServico ? formatBRL(inv.valorServico) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.status} ambiente={inv.ambiente} />
                        {inv.errorMsg && (
                          <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={inv.errorMsg}>
                            {inv.errorMsg}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDate(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalhes"
                            onClick={() => setDetailInvoice(inv as unknown as Record<string, unknown>)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {inv.hasPdf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Baixar PDF"
                              onClick={() => window.open(`/api/nfse/${inv.id}/pdf`, "_blank")}
                            >
                              <Download className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {inv.hasXml && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Baixar XML"
                              onClick={() => window.open(`/api/nfse/${inv.id}/xml`, "_blank")}
                            >
                              <FileText className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {inv.status === "emitted" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Cancelar nota"
                              onClick={() => setCancelId(inv.id)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!detailInvoice} onOpenChange={o => !o && setDetailInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              NFS-e #{(detailInvoice?.id as number) ?? ""}
            </DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">#{detailInvoice.orderId as number}</span></div>
                <div><span className="text-muted-foreground">RPS:</span> <span className="font-medium">{(detailInvoice.rpsNumber as number) ?? "—"}</span></div>
                <div><span className="text-muted-foreground">N° NFS-e:</span> <span className="font-mono font-medium">{(detailInvoice.numeroNfse as string) ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Ambiente:</span> <span className="font-medium capitalize">{detailInvoice.ambiente as string}</span></div>
                <div><span className="text-muted-foreground">Valor:</span> <span className="font-medium">{detailInvoice.valorServico ? formatBRL(detailInvoice.valorServico as string) : "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailInvoice.status as string} ambiente={detailInvoice.ambiente as string} /></div>
              </div>
              {(detailInvoice.errorMsg as string) && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />Erro
                  </p>
                  <p className="text-xs text-destructive">{detailInvoice.errorMsg as string}</p>
                </div>
              )}
              {detailInvoice.status === "emitted" && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />Nota emitida com sucesso
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {(detailInvoice.hasPdf as boolean) && (
                  <Button size="sm" variant="outline" onClick={() => window.open(`/api/nfse/${detailInvoice.id as number}/pdf`, "_blank")}>
                    <Download className="h-4 w-4 mr-2" />Baixar PDF
                  </Button>
                )}
                {(detailInvoice.hasXml as boolean) && (
                  <Button size="sm" variant="outline" onClick={() => window.open(`/api/nfse/${detailInvoice.id as number}/xml`, "_blank")}>
                    <Download className="h-4 w-4 mr-2" />Baixar XML
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Emitida em {formatDate(detailInvoice.createdAt as string)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailInvoice(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <AlertDialog open={cancelId !== null} onOpenChange={o => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />Cancelar NFS-e
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá cancelar a nota fiscal junto à prefeitura. Respeitará os prazos e regras municipais. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelId !== null) cancelMutation.mutate({ id: cancelId, data: { motivo: "Cancelamento solicitado pelo emissor" } });
              }}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar NFS-e"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
