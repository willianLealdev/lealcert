import { useEffect, useState } from "react";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import type { Order } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Video, FileText, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const BRT = "America/Sao_Paulo";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: BRT, weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: BRT, hour: "2-digit", minute: "2-digit",
  });
}

function AppointmentRow({ order, past }: { order: Order; past?: boolean }) {
  const dateLabel = order.scheduledAt
    ? formatDate(order.scheduledAt) + " " + formatTime(order.scheduledAt)
    : order.safewebAgendamentoDataHora ?? order.garAgendamentoDataHora ?? "—";
  const localNome = order.safewebAgendamentoLocalNome ?? order.garAgendamentoLocalNome;

  return (
    <Card className={past ? "opacity-60" : ""}>
      <CardContent className="py-4 px-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 p-2 rounded-lg bg-primary/10 shrink-0">
              <Video className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-semibold text-sm truncate">{order.customerName}</span>
                <Badge variant="outline" className="text-xs font-mono shrink-0">
                  {order.customerCpfCnpj}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  {order.certificateName ?? "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {dateLabel}
                </span>
              </div>
              {localNome && (
                <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                  <Video className="h-3 w-3 shrink-0" />
                  {localNome}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground font-mono">{order.orderNumber}</span>
            <Link href={`/orders/${order.id}`}>
              <Button variant="outline" size="sm">
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSlots() {
  const { data: allOrders, isLoading } = useListOrders(undefined, {
    query: { queryKey: getListOrdersQueryKey(), refetchInterval: 30_000 },
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const nextStart = Math.min(...(allOrders ?? [])
      .map(order => order.scheduledAt ? new Date(order.scheduledAt).getTime() : Number.NaN)
      .filter(time => Number.isFinite(time) && time > now));
    // Atualiza no instante do próximo atendimento, sem depender de navegação/reload.
    const timeout = setTimeout(() => setNow(Date.now()), Math.min(30_000, Math.max(1, nextStart - now)));
    return () => clearTimeout(timeout);
  }, [allOrders, now]);

  // Apenas agendamentos futuros — passados somem automaticamente
  const upcoming = (allOrders ?? [])
    .filter(o => {
      if (!o.garAgendamentoDataHora && !o.safewebAgendamentoDataHora && !o.scheduledAt) return false;
      if (!o.scheduledAt) return true; // garAgendamentoDataHora sem scheduledAt → sempre exibir
      return new Date(o.scheduledAt).getTime() > now;
    })
    .sort((a, b) => {
      const aT = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bT = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return aT - bT;
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Agenda de Atendimentos</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Agendamentos por videoconferência realizados via Gestão AR / Safeweb.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Clock className="h-4 w-4 animate-spin" />
          Carregando agendamentos...
        </div>
      ) : !upcoming.length ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Calendar className="h-12 w-12 mx-auto opacity-20" />
            <p className="font-semibold text-muted-foreground">Nenhum agendamento ativo</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Após o pagamento ser confirmado e o protocolo emitido, o cliente escolhe o horário
              de videoconferência. Os próximos agendamentos aparecem aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">
              Próximos agendamentos
              <span className="ml-2 text-sm font-normal text-muted-foreground">({upcoming.length})</span>
            </h2>
          </div>
          {upcoming.map(o => <AppointmentRow key={o.id} order={o} />)}
        </section>
      )}
    </div>
  );
}
