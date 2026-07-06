import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useGetTicket, useReplyTicket, useCloseTicket, useReopenTicket } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2, CheckCircle, RotateCcw } from "lucide-react";
import { Link } from "wouter";

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

function formatDateTime(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: ticket, isLoading, refetch } = useGetTicket(Number(id));

  const sendMessage = useReplyTicket({
    mutation: {
      onSuccess: () => { setNewMessage(""); refetch(); },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao enviar.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const closeTicket = useCloseTicket({
    mutation: {
      onSuccess: () => { toast({ title: "Chamado encerrado." }); refetch(); },
    },
  });

  const reopenTicket = useReopenTicket({
    mutation: {
      onSuccess: () => { toast({ title: "Chamado reaberto." }); refetch(); },
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages]);

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Chamado não encontrado.</div>;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessage.mutate({ id: Number(id), data: { content: newMessage } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/support">
          <Button variant="outline" size="sm" className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold line-clamp-2">{ticket.subject}</h1>
            <Badge variant={STATUS_VARIANTS[ticket.status] ?? "secondary"} className="shrink-0">
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </Badge>
          </div>
          {user?.role === "admin" && ticket.userName && (
            <p className="text-sm text-muted-foreground">Aberto por: {ticket.userName}</p>
          )}
        </div>
        {ticket.status !== "closed" && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => closeTicket.mutate({ id: Number(id) })} disabled={closeTicket.isPending}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Encerrar
          </Button>
        )}
        {ticket.status === "closed" && user?.role === "admin" && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => reopenTicket.mutate({ id: Number(id) })} disabled={reopenTicket.isPending}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reabrir
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Mensagens</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2 mb-4">
            {ticket.messages?.map(msg => {
              const isMe = msg.userId === user?.id;
              const isAdminMsg = msg.userRole === "admin";
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${isMe ? "bg-primary text-white rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                    <div className={`text-xs mb-1 font-semibold ${isMe ? "text-white/70" : "text-muted-foreground"}`}>
                      {msg.userName ?? "Usuário"}{isAdminMsg && !isMe ? " (Suporte)" : ""}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <div className={`text-xs mt-1.5 ${isMe ? "text-white/50" : "text-muted-foreground"}`}>
                      {formatDateTime(msg.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {ticket.status !== "closed" ? (
            <form onSubmit={handleSend} className="flex gap-2 border-t pt-4">
              <Textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Digite sua mensagem... (Ctrl+Enter para enviar)"
                rows={3}
                className="flex-1"
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend(e); }}
              />
              <Button type="submit" disabled={sendMessage.isPending || !newMessage.trim()} className="self-end px-4">
                {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          ) : (
            <p className="pt-4 border-t text-sm text-center text-muted-foreground">Este chamado foi encerrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
