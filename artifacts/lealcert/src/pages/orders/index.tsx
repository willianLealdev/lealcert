import { useState } from "react";
import { Link } from "wouter";
import { useListOrders, useGetMe } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pago",
  protocol_assigned: "Protocolo Atribuído",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  created: "secondary",
  pending_payment: "outline",
  paid: "default",
  protocol_assigned: "default",
  completed: "default",
  cancelled: "destructive",
};

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

interface DeleteDialogProps {
  order: { id: number; orderNumber: string } | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteDialog({ order, onClose, onDeleted }: DeleteDialogProps) {
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  if (!order) return null;

  const last4 = order.orderNumber.slice(-4);

  const handleDelete = async () => {
    if (digits.length !== 4) {
      setError("Digite exatamente 4 dígitos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDigits: digits }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Erro ao excluir pedido.");
        return;
      }
      toast({ title: "Pedido excluído com sucesso." });
      onDeleted();
      onClose();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) { onClose(); setDigits(""); setError(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Excluir pedido?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Você está prestes a excluir o pedido{" "}
                <span className="font-mono font-bold text-foreground">{order.orderNumber}</span>.
                Esta ação não pode ser desfeita.
              </p>
              <p className="text-sm">
                Para confirmar, digite os <strong>últimos 4 dígitos</strong> do número do pedido:{" "}
                <span className="font-mono font-semibold text-foreground">...{last4}</span>
              </p>
              <Input
                placeholder="4 dígitos"
                value={digits}
                maxLength={4}
                inputMode="numeric"
                autoFocus
                onChange={(e) => { setDigits(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleDelete(); }}
                className={error ? "border-destructive" : ""}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={() => { setDigits(""); setError(""); }}>
            Cancelar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={loading || digits.length !== 4}
            onClick={handleDelete}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Excluir pedido
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; orderNumber: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useListOrders({
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const isDeletable = (status: string) => isAdmin && status === "pending_payment";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie e acompanhe seus pedidos.</p>
        </div>
        <Link href="/orders/new" className="shrink-0">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Novo Pedido</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente ou CPF/CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : !orders?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="font-medium">Nenhum pedido encontrado</p>
              <p className="text-sm mt-1">Crie seu primeiro pedido clicando em "Novo Pedido".</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Número</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Certificado</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Protocolo</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`}>
                          <span className="text-primary hover:underline font-mono font-medium cursor-pointer">
                            {order.orderNumber}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerCpfCnpj}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {order.certificateName ?? "—"}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[order.status] ?? "secondary"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell font-mono text-sm text-muted-foreground">
                        {order.protocolNumber || order.garProtocolo || order.safewebSolicitacaoId || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isDeletable(order.status) && (
                          <button
                            type="button"
                            title="Excluir pedido"
                            onClick={() => setDeleteTarget({ id: order.id, orderNumber: order.orderNumber })}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteDialog
        order={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => queryClient.invalidateQueries({ queryKey: ["orders"] })}
      />
    </div>
  );
}
