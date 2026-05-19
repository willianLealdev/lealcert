import { useParams } from "wouter";
import { useGetOrder, useUpdateOrder, useCreatePayment } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

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

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatDateTime(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [protocol, setProtocol] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const { data: order, isLoading, refetch } = useGetOrder(Number(id));

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: () => { toast({ title: "Pedido atualizado!" }); refetch(); },
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: (data) => {
        if (data.initPoint) {
          window.open(data.initPoint, "_blank");
        } else {
          toast({ title: "Link gerado", description: "Verifique o painel do MercadoPago." });
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao gerar pagamento.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;
  if (!order) return <div className="text-center py-20 text-muted-foreground">Pedido não encontrado.</div>;

  const isAdmin = user?.role === "admin";

  function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {};
    if (newStatus) data.status = newStatus;
    if (protocol) data.protocolNumber = protocol;
    if (Object.keys(data).length === 0) return;
    updateOrder.mutate({ id: Number(id), data: data as Parameters<typeof updateOrder.mutate>[0]["data"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{order.orderNumber}</h1>
            <Badge variant={STATUS_VARIANTS[order.status] ?? "secondary"}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">Criado em {formatDateTime(order.createdAt)}</p>
        </div>
        {(order.status === "pending_payment" || order.status === "created") && (
          <Button
            onClick={() => createPayment.mutate({ id: Number(id) })}
            disabled={createPayment.isPending}
          >
            {createPayment.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <CreditCard className="h-4 w-4 mr-2" />}
            Pagar com MercadoPago
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <InfoRow label="Nome" value={order.customerName} />
              <InfoRow label={order.clientType === "cnpj" ? "CNPJ" : "CPF"} value={order.customerCpfCnpj} />
              {order.companyName && <InfoRow label="Razão Social" value={order.companyName} />}
              {order.inssNumber && <InfoRow label="INSS" value={order.inssNumber} />}
              <InfoRow label="E-mail" value={order.customerEmail} />
              <InfoRow label="Telefone" value={order.customerPhone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <InfoRow label="CEP" value={order.addressZipcode} />
              <InfoRow label="Logradouro" value={order.addressStreet} />
              <InfoRow label="Número" value={order.addressNumber} />
              <InfoRow label="Bairro" value={order.addressNeighborhood} />
              <InfoRow label="Cidade" value={order.addressCity} />
              <InfoRow label="UF" value={order.addressState} />
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader><CardTitle>Atualizar Pedido</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleStatusUpdate} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Alterar Status</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger><SelectValue placeholder="Manter atual" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Número de Protocolo</Label>
                      <Input value={protocol} onChange={e => setProtocol(e.target.value)} placeholder="Ex: 2024001234" />
                    </div>
                  </div>
                  <Button type="submit" disabled={updateOrder.isPending}>
                    {updateOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Alterações
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Certificado" value={order.certificateName} />
              <InfoRow label="Agendamento" value={formatDateTime(order.scheduledAt ?? null)} />
              {order.protocolNumber && <InfoRow label="Protocolo" value={order.protocolNumber} />}
              {order.extendedWarranty && (
                <p className="text-xs text-muted-foreground">Garantia estendida incluída</p>
              )}
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-xl font-bold text-primary">{formatBRL(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.mpPaymentId && (
            <Card>
              <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="ID MercadoPago" value={order.mpPaymentId} />
              </CardContent>
            </Card>
          )}

          {isAdmin && order.userName && (
            <Card>
              <CardHeader><CardTitle>Atendente</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Responsável" value={order.userName} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
