import { useListOrders } from "@workspace/api-client-react";
import type { Order } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Video, User, FileText, ArrowRight } from "lucide-react";
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
  const dateLabel = order.garAgendamentoDataHora ?? (order.scheduledAt ? formatDate(order.scheduledAt) + " " + formatTime(order.scheduledAt) : "—");
  const localNome = order.garAgendamentoLocalNome;

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
  const { data: allOrders, isLoading } = useListOrders();

  const now = new Date();

  const scheduled = (allOrders ?? [])
    .filter(o => o.garAgendamentoDataHora || o.scheduledAt);

  const upcoming = scheduled
    .filter(o => {
      if (!o.scheduledAt) return true;
      return new Date(o.scheduledAt) >= now;
    })
    .sort((a, b) => {
      const aT = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bT = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return aT - bT;
    });

  const past = scheduled
    .filter(o => o.scheduledAt && new Date(o.scheduledAt) < now)
    .sort((a, b) => new Date(b.scheduledAt!).getTime() - new Date(a.scheduledAt!).getTime());

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
      ) : !scheduled.length ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Calendar className="h-12 w-12 mx-auto opacity-20" />
            <p className="font-semibold text-muted-foreground">Nenhum agendamento realizado ainda</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Após o pagamento ser confirmado e o protocolo emitido, o cliente escolhe o horário
              de videoconferência diretamente na plataforma Gestão AR ou Safeweb.
              Os agendamentos aparecem aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
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

          {past.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                <h2 className="font-semibold">
                  Realizados
                  <span className="ml-2 text-sm font-normal">({past.length})</span>
                </h2>
              </div>
              {past.map(o => <AppointmentRow key={o.id} order={o} past />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
