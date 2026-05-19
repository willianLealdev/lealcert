import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MarketingStats } from "@workspace/api-client-react";
import {
  useGetMarketingStats,
  useListMarketingContacts,
  useCreateMarketingContact,
  useDeleteMarketingContact,
  useUpdateMarketingContact,
  useListMarketingCampaigns,
  useCreateMarketingCampaign,
  useUpdateMarketingCampaign,
  useDeleteMarketingCampaign,
  useSendMarketingCampaign,
  useCancelMarketingCampaign,
  useListMarketingReplies,
  useMarkReplyRead,
  useReplyToContact,
  getGetMarketingStatsQueryKey,
  getListMarketingContactsQueryKey,
  getListMarketingCampaignsQueryKey,
  getListMarketingRepliesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone, Users, Mail, MailOpen, Send, Upload, Plus, Trash2,
  RefreshCw, Calendar, CheckCircle2, XCircle, Clock, AlertCircle,
  ChevronRight, Eye, Reply, Search, BarChart3, MessageSquare,
} from "lucide-react";

type Tab = "overview" | "campanhas" | "clientes" | "contadores" | "respostas";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border rounded-xl p-5 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Rascunho", variant: "secondary" },
    scheduled: { label: "Agendada", variant: "outline" },
    sending: { label: "Enviando…", variant: "default" },
    sent: { label: "Enviada", variant: "default" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };
  const s = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function contactStatusBadge(status: string, bounced: boolean) {
  if (bounced) return <Badge variant="destructive">Bounce</Badge>;
  if (status === "unsubscribed") return <Badge variant="outline">Descadastrado</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-600">Ativo</Badge>;
}

export default function AdminMarketing() {
  const [tab, setTab] = useState<Tab>("overview");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useGetMarketingStats();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetMarketingStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingContactsQueryKey({}) });
    qc.invalidateQueries({ queryKey: getListMarketingCampaignsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingRepliesQueryKey({}) });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gestão completa de e-mail marketing</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
          <Mail className="h-3.5 w-3.5" />
          mkt@lealcert.com.br
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {([
          { id: "overview", label: "Visão Geral", icon: BarChart3 },
          { id: "campanhas", label: "Campanhas", icon: Send },
          { id: "clientes", label: "Clientes", icon: Users },
          { id: "contadores", label: "Contadores", icon: Users },
          { id: "respostas", label: "Respostas", icon: MessageSquare },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.id === "respostas" && (stats?.unreadReplies ?? 0) > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center ml-1">
                {stats?.unreadReplies}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab stats={stats} />}
      {tab === "campanhas" && <CampanhasTab invalidate={invalidate} toast={toast} />}
      {tab === "clientes" && <ContatosTab type="cliente" invalidate={invalidate} toast={toast} />}
      {tab === "contadores" && <ContatosTab type="contador" invalidate={invalidate} toast={toast} />}
      {tab === "respostas" && <RespostasTab invalidate={invalidate} toast={toast} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({ stats }: { stats: MarketingStats | undefined }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de Contatos" value={stats?.totalContacts ?? 0} icon={Users} color="bg-blue-500" />
        <StatCard label="Contatos Ativos" value={stats?.activeContacts ?? 0} icon={CheckCircle2} color="bg-emerald-500" />
        <StatCard label="Campanhas Enviadas" value={stats?.sentCampaigns ?? 0} icon={Send} color="bg-violet-500" />
        <StatCard label="Respostas Não Lidas" value={stats?.unreadReplies ?? 0} icon={MessageSquare} color="bg-amber-500" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Descadastrados" value={stats?.unsubscribed ?? 0} icon={XCircle} color="bg-slate-500" />
        <StatCard label="Com Bounce" value={stats?.bounced ?? 0} icon={AlertCircle} color="bg-red-500" />
        <StatCard label="Campanhas Agendadas" value={stats?.scheduledCampaigns ?? 0} icon={Clock} color="bg-cyan-500" />
        <StatCard label="Total de Campanhas" value={stats?.totalCampaigns ?? 0} icon={Megaphone} color="bg-pink-500" />
      </div>

      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Webhook de E-mails Recebidos
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Configure seu provedor de e-mail (Sendgrid, Mailgun, Postmark) para encaminhar as respostas dos clientes para o endpoint abaixo. As mensagens aparecerão automaticamente na aba <strong>Respostas</strong>.
        </p>
        <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 font-mono text-sm">
          <span className="text-emerald-600 font-semibold">POST</span>
          <span className="truncate">/api/marketing/webhook/inbound</span>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.origin + "/api/marketing/webhook/inbound"); }}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-xs"
          >Copiar</button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Formatos suportados: Sendgrid Inbound Parse, Mailgun Routes, Postmark Inbound, e qualquer webhook com campos <code>from</code>, <code>subject</code>, <code>text</code>.
        </p>
      </div>

      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <MailOpen className="h-4 w-4 text-primary" /> Variáveis nos E-mails
        </h2>
        <p className="text-sm text-muted-foreground mb-3">Use as variáveis abaixo nos templates para personalizar cada e-mail:</p>
        <div className="grid grid-cols-2 gap-2">
          {[["{{nome}}", "Nome do contato"], ["{{email}}", "E-mail do contato"]].map(([v, d]) => (
            <div key={v} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
              <code className="text-primary font-mono">{v}</code>
              <span className="text-muted-foreground text-xs">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Campanhas ───────────────────────────────────────────────────────────────
function CampanhasTab({ invalidate, toast }: { invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [showForm, setShowForm] = useState(false);
  const [editCampaign, setEditCampaign] = useState<number | null>(null);
  const [showSendDialog, setShowSendDialog] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: campaigns = [], isLoading } = useListMarketingCampaigns();
  const deleteMutation = useDeleteMarketingCampaign({ mutation: {
    onSuccess: () => { toast({ title: "Campanha removida." }); invalidate(); },
    onError: () => toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" }),
  }});
  const sendMutation = useSendMarketingCampaign({ mutation: {
    onSuccess: (data) => { toast({ title: "Sucesso!", description: data.message }); invalidate(); setShowSendDialog(null); },
    onError: () => toast({ title: "Erro ao enviar", variant: "destructive" }),
  }});
  const cancelMutation = useCancelMarketingCampaign({ mutation: {
    onSuccess: () => { toast({ title: "Campanha cancelada." }); invalidate(); },
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  }});

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditCampaign(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-card border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {statusBadge(c.status)}
                    <span className="font-semibold truncate">{c.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{c.subject}</p>
                  {c.scheduledAt && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Agendada para {new Date(c.scheduledAt).toLocaleString("pt-BR")}
                    </p>
                  )}
                  {c.sentAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviada em {new Date(c.sentAt).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.status !== "sent" && c.status !== "sending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { setEditCampaign(c.id); setShowForm(true); }}>Editar</Button>
                      <Button size="sm" onClick={() => setShowSendDialog(c.id)} className="gap-1">
                        <Send className="h-3.5 w-3.5" /> {c.status === "scheduled" ? "Reenviar" : "Enviar"}
                      </Button>
                      {c.status === "scheduled" && (
                        <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate({ id: c.id })}>Cancelar</Button>
                      )}
                    </>
                  )}
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8"
                    onClick={() => { if (confirm("Remover campanha?")) deleteMutation.mutate({ id: c.id }); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {c.status === "sent" && (
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t">
                  {[
                    { label: "Enviados", value: c.totalSent, icon: Send },
                    { label: "Abertos", value: c.totalOpened, icon: MailOpen },
                    { label: "Bounces", value: c.totalBounced, icon: AlertCircle },
                    { label: "Respostas", value: c.totalReplied, icon: Reply },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{label}</span>
                      </div>
                      <p className="text-xl font-bold">{value}</p>
                      {c.totalSent > 0 && (
                        <p className="text-xs text-muted-foreground">{Math.round((value / c.totalSent) * 100)}%</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CampaignFormDialog
          campaignId={editCampaign}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate(); }}
          toast={toast}
        />
      )}

      {showSendDialog !== null && (
        <Dialog open onOpenChange={() => setShowSendDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Escolha enviar agora ou agendar para uma data específica.</p>
              <div className="space-y-2">
                <Label>Data e Hora de Envio (opcional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                <p className="text-xs text-muted-foreground">Deixe em branco para enviar imediatamente.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendDialog(null)}>Cancelar</Button>
              <Button disabled={sendMutation.isPending} onClick={() => {
                sendMutation.mutate({ id: showSendDialog!, data: { scheduledAt: scheduledAt || undefined } });
              }}>
                {scheduledAt ? <><Calendar className="h-4 w-4 mr-2" />Agendar</> : <><Send className="h-4 w-4 mr-2" />Enviar Agora</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CampaignFormDialog({
  campaignId, onClose, onSaved, toast,
}: {
  campaignId: number | null;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { data: campaigns = [] } = useListMarketingCampaigns();
  const existing = campaignId ? campaigns.find(c => c.id === campaignId) : null;

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    subject: existing?.subject ?? "",
    bodyHtml: existing?.bodyHtml ?? "",
    bodyText: existing?.bodyText ?? "",
    fromName: existing?.fromName ?? "LealCert Marketing",
    fromEmail: existing?.fromEmail ?? "mkt@lealcert.com.br",
    replyTo: existing?.replyTo ?? "",
    filterTags: existing?.filterTags ?? "",
  });

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const createMutation = useCreateMarketingCampaign({ mutation: { onSuccess: onSaved, onError: () => toast({ title: "Erro ao criar campanha", variant: "destructive" }) } });
  const updateMutation = useUpdateMarketingCampaign({ mutation: { onSuccess: onSaved, onError: () => toast({ title: "Erro ao atualizar campanha", variant: "destructive" }) } });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form, replyTo: form.replyTo || undefined, bodyText: form.bodyText || undefined, filterTags: form.filterTags || undefined };
    if (campaignId) updateMutation.mutate({ id: campaignId, data });
    else createMutation.mutate({ data });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaignId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome da Campanha *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} required placeholder="Ex: Promoção Julho" />
            </div>
            <div className="space-y-1.5">
              <Label>Assunto do E-mail *</Label>
              <Input value={form.subject} onChange={e => set("subject", e.target.value)} required placeholder="Ex: Oferta especial para você!" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Remetente</Label>
              <Input value={form.fromName} onChange={e => set("fromName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail do Remetente</Label>
              <Input value={form.fromEmail} onChange={e => set("fromEmail", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Responder Para (Reply-To)</Label>
              <Input value={form.replyTo} onChange={e => set("replyTo", e.target.value)} placeholder="mkt@lealcert.com.br" />
            </div>
            <div className="space-y-1.5">
              <Label>Filtrar por Tags (opcional)</Label>
              <Input value={form.filterTags} onChange={e => set("filterTags", e.target.value)} placeholder="Ex: vip, empresa" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Corpo do E-mail (HTML) *</Label>
            <Textarea
              value={form.bodyHtml}
              onChange={e => set("bodyHtml", e.target.value)}
              required
              rows={10}
              placeholder={"<h1>Olá, {{nome}}!</h1>\n<p>Confira nossa oferta especial...</p>"}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Use <code>{"{{nome}}"}</code> e <code>{"{{email}}"}</code> para personalização automática.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Versão Texto (opcional)</Label>
            <Textarea value={form.bodyText} onChange={e => set("bodyText", e.target.value)} rows={4} placeholder="Versão em texto puro..." />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={isPending} onClick={handleSubmit as unknown as React.MouseEventHandler}>
            {isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : "Salvar Campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contatos (Clientes e Contadores) ────────────────────────────────────────
function ContatosTab({ type, invalidate, toast }: { type: "cliente" | "contador"; invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [search, setSearch] = useState("");
  const [page] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isCliente = type === "cliente";
  const label = isCliente ? "cliente" : "contador";
  const labelPl = isCliente ? "clientes" : "contadores";

  const { data, isLoading } = useListMarketingContacts({ page, search: search || undefined, type });
  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;

  const deleteMutation = useDeleteMarketingContact({ mutation: {
    onSuccess: () => { toast({ title: "Contato removido." }); invalidate(); },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  }});
  const updateMutation = useUpdateMarketingContact({ mutation: {
    onSuccess: () => { toast({ title: "Contato atualizado." }); invalidate(); },
  }});

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/marketing/contacts/import", { method: "POST", body: fd, credentials: "include" });
      const result = await res.json() as { imported: number; skipped: number; total: number; errors?: string[] };
      toast({ title: `Importação concluída!`, description: `${result.imported} importados, ${result.skipped} ignorados de ${result.total} registros.` });
      invalidate();
    } catch {
      toast({ title: "Erro na importação", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const csvHint = isCliente
    ? <><strong>Planilha de Clientes:</strong> colunas <code>NOME</code> e <code>EMAIL</code> (obrigatórias). Aceita CSV ou XLSX.</>
    : <><strong>Planilha de Contadores:</strong> colunas <code>CONTATO</code>, <code>E-MAIL</code> e <code>TELEFONE</code>. Aceita CSV ou XLSX. As colunas <em>COM QUEM FAZ</em> e <em>OBSERVAÇÃO</em> são ignoradas automaticamente.</>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Buscar por nome ou e-mail…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-2 shrink-0">
          {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar planilha
        </Button>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm text-muted-foreground">
        <strong>{total}</strong> {labelPl} no total
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className={`grid ${isCliente ? "grid-cols-[2fr_2fr_1fr_auto]" : "grid-cols-[2fr_2fr_1.5fr_1fr_auto]"} text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b bg-muted/30`}>
          <span>Nome{!isCliente && " / Escritório"}</span>
          <span>E-mail</span>
          {!isCliente && <span>Telefone</span>}
          <span>Status</span>
          <span></span>
        </div>
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregando…</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum {label} encontrado.</p>
            <p className="text-xs mt-1">Importe a planilha ou adicione manualmente.</p>
          </div>
        ) : (
          contacts.map(c => (
            <div key={c.id} className={`grid ${isCliente ? "grid-cols-[2fr_2fr_1fr_auto]" : "grid-cols-[2fr_2fr_1.5fr_1fr_auto]"} px-4 py-3 border-b last:border-0 items-center hover:bg-muted/20 transition-colors`}>
              <span className="font-medium text-sm truncate">{c.name}</span>
              <span className="text-sm text-muted-foreground truncate">{c.email}</span>
              {!isCliente && <span className="text-sm text-muted-foreground">{c.phone ?? "—"}</span>}
              <span>{contactStatusBadge(c.status, c.bounced)}</span>
              <div className="flex items-center gap-1">
                {c.status === "active" && (
                  <button onClick={() => updateMutation.mutate({ id: c.id, data: { status: "unsubscribed" } })}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">
                    Descadastrar
                  </button>
                )}
                <button onClick={() => { if (confirm(`Remover ${c.name}?`)) deleteMutation.mutate({ id: c.id }); }}
                  className="text-destructive/70 hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
        {csvHint}
      </div>

      {showAdd && <AddContactDialog type={type} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); invalidate(); }} toast={toast} />}
    </div>
  );
}

function AddContactDialog({ type, onClose, onSaved, toast }: { type: "cliente" | "contador"; onClose: () => void; onSaved: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const isCliente = type === "cliente";
  const [form, setForm] = useState({ name: "", email: "", phone: "", tags: "" });
  const mutation = useCreateMarketingContact({ mutation: {
    onSuccess: onSaved,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Erro ao adicionar contato.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  }});

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const handleSave = () => mutation.mutate({ data: { type, name: form.name, email: form.email, phone: form.phone || undefined, tags: form.tags || undefined } });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar {isCliente ? "Cliente" : "Contador"}</DialogTitle></DialogHeader>
        <form className="space-y-3 py-2" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <div className="space-y-1.5"><Label>{isCliente ? "Nome *" : "Nome / Escritório *"}</Label><Input required value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>E-mail *</Label><Input required type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" /></div>
          {isCliente && <div className="space-y-1.5"><Label>Tags (separadas por vírgula)</Label><Input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="vip, empresa" /></div>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={mutation.isPending} onClick={handleSave}>
            {mutation.isPending ? "Adicionando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Respostas ────────────────────────────────────────────────────────────────
function RespostasTab({ invalidate, toast }: { invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data: replies = [], isLoading } = useListMarketingReplies({ unreadOnly: unreadOnly || undefined });

  const markReadMutation = useMarkReplyRead({ mutation: {
    onSuccess: () => invalidate(),
  }});
  const replyMutation = useReplyToContact({ mutation: {
    onSuccess: () => {
      toast({ title: "Resposta enviada!" });
      setReplyBody("");
      invalidate();
    },
    onError: () => toast({ title: "Erro ao enviar resposta", variant: "destructive" }),
  }});

  const selectedReply = replies.find(r => r.id === selected);

  function handleSelect(id: number) {
    setSelected(id);
    const r = replies.find(r => r.id === id);
    if (r && !r.readAt) markReadMutation.mutate({ id });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setUnreadOnly(!unreadOnly)}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            unreadOnly ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          {unreadOnly ? "Mostrando: Não lidos" : "Mostrar apenas não lidos"}
        </button>
        <span className="text-sm text-muted-foreground">{replies.length} mensagens</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando…</div>
      ) : replies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma resposta recebida ainda.</p>
          <p className="text-xs mt-1">Configure o webhook de inbound na aba Visão Geral.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[360px_1fr] gap-4 h-[600px]">
          {/* List */}
          <div className="border rounded-xl overflow-y-auto bg-card">
            {replies.map(r => (
              <button
                key={r.id}
                onClick={() => handleSelect(r.id)}
                className={`w-full text-left px-4 py-3 border-b last:border-0 transition-colors ${
                  selected === r.id ? "bg-primary/10" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${!r.readAt ? "font-semibold" : "font-medium"}`}>
                      {r.fromName ?? r.fromEmail}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{r.fromEmail}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.subject ?? "(sem assunto)"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!r.readAt && <span className="h-2 w-2 rounded-full bg-primary" />}
                    {r.repliedAt && <Reply className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="border rounded-xl bg-card flex flex-col">
            {!selectedReply ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Selecione uma mensagem</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-5 border-b">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{selectedReply.fromName ?? selectedReply.fromEmail}</p>
                      <p className="text-sm text-muted-foreground">{selectedReply.fromEmail}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(selectedReply.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="font-medium mt-2">{selectedReply.subject ?? "(sem assunto)"}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {selectedReply.bodyHtml ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedReply.bodyHtml }} />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap font-sans">{selectedReply.bodyText ?? "(sem conteúdo)"}</pre>
                  )}

                  {selectedReply.replyBody && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Reply className="h-3 w-3" /> Sua resposta em {selectedReply.repliedAt ? new Date(selectedReply.repliedAt).toLocaleString("pt-BR") : ""}
                      </p>
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                        {selectedReply.replyBody}
                      </div>
                    </div>
                  )}
                </div>

                {!selectedReply.repliedAt && (
                  <div className="p-4 border-t space-y-2">
                    <Textarea
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      placeholder={`Responder para ${selectedReply.fromEmail}…`}
                      rows={4}
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={() => replyMutation.mutate({ id: selectedReply.id, data: { body: replyBody } })}
                        disabled={!replyBody.trim() || replyMutation.isPending}
                        className="gap-2"
                      >
                        {replyMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar Resposta
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
