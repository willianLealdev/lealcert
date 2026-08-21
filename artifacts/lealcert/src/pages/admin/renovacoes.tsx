import { useState } from "react";
import { useListRenewals, useCheckRenewalAlerts, useSendRenewalAlert } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle, CalendarDays, Mail, Bell, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(d));
}

function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function urgencyBadge(days: number | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (days === null) return { label: "—", variant: "secondary" };
  if (days < 0) return { label: "Vencido", variant: "destructive" };
  if (days === 0) return { label: "Vence hoje!", variant: "destructive" };
  if (days <= 7) return { label: `${days}d`, variant: "destructive" };
  if (days <= 30) return { label: `${days}d`, variant: "outline" };
  return { label: `${days}d`, variant: "secondary" };
}

type AdminRenewalDetails = {
  customerCpfCnpj: string;
  customerEmail?: string | null;
  certificateName: string;
  garPedido?: string | null;
  garProtocolo?: string | null;
  validityMonths: number;
  emittedAt: string | Date;
  orderId?: number | null;
};

function hasAdminRenewalDetails(item: object): item is AdminRenewalDetails {
  return "customerCpfCnpj" in item && "certificateName" in item && "emittedAt" in item;
}

export default function AdminRenovacoes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, refetch, isFetching } = useListRenewals();

  const checkAlerts = useCheckRenewalAlerts({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Alertas verificados",
          description: `${res.sent} e-mail(s) enviado(s) de ${res.processed} registros verificados.`,
        });
        refetch();
      },
      onError: () => toast({ title: "Erro ao verificar alertas", variant: "destructive" }),
    },
  });

  const sendAlert = useSendRenewalAlert({
    mutation: {
      onSuccess: (res) => {
        toast({ title: "Alerta enviado!", description: `Dias restantes: ${res.daysLeft ?? "—"}` });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao enviar e-mail.";
        toast({ title: "Erro ao enviar e-mail", description: msg, variant: "destructive" });
      },
    },
  });

  const filteredData = (data ?? []).filter(item => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    if (!isAdmin || !hasAdminRenewalDetails(item)) return item.customerName.toLowerCase().includes(q);
    return (
      item.customerName.toLowerCase().includes(q) ||
      item.customerCpfCnpj.includes(q) ||
      item.certificateName.toLowerCase().includes(q) ||
      (item.garProtocolo?.toLowerCase().includes(q) ?? false)
    );
  }).sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const expiring30 = (data ?? []).filter(item => {
    const d = daysUntil(item.expiresAt);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const expired = (data ?? []).filter(item => {
    const d = daysUntil(item.expiresAt);
    return d !== null && d < 0;
  }).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Renovações</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Controle de vencimento dos certificados emitidos pelo sistema."
              : "Acompanhe os vencimentos dos certificados emitidos pelo seu escritório."}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkAlerts.mutate()}
              disabled={checkAlerts.isPending || isFetching}
            >
              {checkAlerts.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Bell className="h-4 w-4 mr-2" />}
              Verificar Alertas
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Métricas */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{data.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Vencem em 30d</p>
              <p className={`text-2xl font-bold ${expiring30 > 0 ? "text-amber-600" : ""}`}>{expiring30}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Vencidos</p>
              <p className={`text-2xl font-bold ${expired > 0 ? "text-destructive" : ""}`}>{expired}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Busca */}
      <Input
        placeholder={isAdmin ? "Buscar por nome, CPF/CNPJ, certificado ou protocolo..." : "Buscar cliente por nome..."}
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="max-w-md"
      />

      {/* Conteúdo */}
      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Carregando registros...</p>
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive/60" />
            <p className="font-medium text-destructive">Não foi possível carregar os registros.</p>
          </CardContent>
        </Card>
      ) : !filteredData.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 opacity-30" />
            <p>{busca ? "Nenhum resultado encontrado." : "Nenhum certificado emitido registrado ainda."}</p>
            {!busca && (
              <p className="text-sm max-w-sm">
                Quando um pedido for sincronizado com a Gestão AR e o status indicar emissão, ele aparecerá aqui automaticamente.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{filteredData.length} registro(s)</p>
          {filteredData.map((item) => {
            const days = daysUntil(item.expiresAt);
            const urgency = urgencyBadge(days);
            const alertsSent = [item.alertSent30d, item.alertSent7d, item.alertSent1d].filter(Boolean).length;
            const adminDetails = isAdmin && hasAdminRenewalDetails(item);

            return (
              <Card key={item.id} className={days !== null && days < 0 ? "border-destructive/40 bg-destructive/5" : days !== null && days <= 7 ? "border-amber-400/60 bg-amber-50/40" : ""}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.customerName}</span>
                        <Badge variant={urgency.variant} className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {urgency.label}
                        </Badge>
                        {alertsSent > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Mail className="h-3 w-3 mr-1" />
                            {alertsSent} alerta(s)
                          </Badge>
                        )}
                      </div>
                      {adminDetails && (
                        <>
                          <p className="text-xs text-muted-foreground font-mono">{item.customerCpfCnpj}</p>
                          <p className="text-sm text-foreground">{item.certificateName}</p>
                        </>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-xs text-muted-foreground">Vencimento</p>
                      <p className="font-semibold">{formatDate(item.expiresAt)}</p>
                      {adminDetails && <p className="text-xs text-muted-foreground">Emissão: {formatDate(item.emittedAt)}</p>}
                    </div>
                  </div>

                  {adminDetails && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                      {item.garProtocolo && (
                        <div>
                          <p className="font-medium text-foreground mb-0.5">Protocolo</p>
                          <p className="font-mono">{item.garProtocolo}</p>
                        </div>
                      )}
                      {item.garPedido && (
                        <div>
                          <p className="font-medium text-foreground mb-0.5">Pedido GAR</p>
                          <p className="font-mono">{item.garPedido}</p>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground mb-0.5">Validade</p>
                        <p>{item.validityMonths} meses</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-0.5">Alertas enviados</p>
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${item.alertSent30d ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>30d</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${item.alertSent7d ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>7d</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${item.alertSent1d ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>1d</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                    {adminDetails && item.orderId && (
                      <Link href={`/orders/${item.orderId}`}>
                        <Button variant="outline" size="sm">
                          Ver Pedido
                        </Button>
                      </Link>
                    )}
                    {adminDetails && item.customerEmail && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendAlert.mutate({ id: item.id })}
                        disabled={sendAlert.isPending}
                      >
                        {sendAlert.isPending
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <Mail className="h-3 w-3 mr-1" />}
                        Enviar Alerta
                      </Button>
                    )}
                    {days !== null && days > 0 && days <= 60 && (
                      <Badge variant="outline" className="text-xs items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-amber-500" />
                        Renovação recomendada
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
