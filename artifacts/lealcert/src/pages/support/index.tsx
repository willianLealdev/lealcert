import { Link } from "wouter";
import { useListTickets } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, MessageSquare, AlertCircle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  closed: "Fechado",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "default",
  in_progress: "outline",
  closed: "secondary",
};

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
}

export default function Support() {
  const { user } = useAuth();
  const { data: tickets, isLoading } = useListTickets();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Suporte</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Abra e acompanhe seus chamados.</p>
        </div>
        <Link href="/support/new" className="shrink-0">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Novo Chamado</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : !tickets?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum chamado encontrado</p>
              <p className="text-sm">Abra um novo chamado para receber suporte.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(ticket => {
                const hasUnread = user?.role === "admin" ? ticket.unreadAdmin : ticket.unreadClient;
                return (
                  <Link key={ticket.id} href={`/support/${ticket.id}`}>
                    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5">
                          {hasUnread
                            ? <AlertCircle className="h-4 w-4 text-primary" />
                            : <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{ticket.subject}</p>
                            {hasUnread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                          </div>
                          {user?.role === "admin" && ticket.userName && (
                            <p className="text-xs text-muted-foreground">{ticket.userName}</p>
                          )}
                          <p className="text-xs text-muted-foreground">Atualizado em {formatDate(ticket.updatedAt ?? null)}</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANTS[ticket.status] ?? "secondary"} className="ml-3 shrink-0">
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
