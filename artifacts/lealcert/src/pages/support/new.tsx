import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateTicket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function NewTicket() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const createTicket = useCreateTicket({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Chamado aberto!", description: "Em breve entraremos em contato." });
        setLocation(`/support/${data.id}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao abrir chamado.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createTicket.mutate({ data: { subject, message } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/support">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Chamado</h1>
          <p className="text-muted-foreground">Descreva sua dúvida ou problema.</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Abrir Chamado de Suporte</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Assunto *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Ex: Dúvida sobre pedido"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Descreva sua dúvida ou problema em detalhes..."
                rows={6}
                required
              />
            </div>
            <Button type="submit" disabled={createTicket.isPending}>
              {createTicket.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                : "Abrir Chamado"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
