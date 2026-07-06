import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
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
  useDeleteMarketingReply,
  useListMarketingReplies,
  useMarkReplyRead,
  useReplyToContact,
  useValidateContactEmails,
  useBulkDeleteMarketingContacts,
  useGetMarketingCampaignProgress,
  getGetMarketingCampaignProgressQueryKey,
  useResumeMarketingCampaign,
  useListMarketingBounces,
  useRestoreMarketingBounce,
  useDeleteMarketingBounce,
  getGetMarketingStatsQueryKey,
  getListMarketingContactsQueryKey,
  getListMarketingCampaignsQueryKey,
  getListMarketingRepliesQueryKey,
  getListMarketingBouncesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone, Users, Mail, MailOpen, Send, Upload, Plus, Trash2, Pencil,
  RefreshCw, Calendar, CheckCircle2, XCircle, Clock, AlertCircle,
  ChevronRight, Eye, Reply, Search, BarChart3, MessageSquare, ShieldCheck, Copy, MousePointerClick,
  AlertTriangle, RotateCcw,
} from "lucide-react";

type Tab = "overview" | "campanhas" | "clientes" | "contadores" | "respostas" | "bounces";

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

const INVALID_REASON_LABELS: Record<string, string> = {
  bad_format: "Formato inválido",
  no_mx: "Sem servidor MX",
  disposable_domain: "Domínio descartável",
};

function emailStatusBadge(emailStatus: string | null | undefined, reason?: string | null) {
  if (!emailStatus || emailStatus === "unknown") return <Badge variant="outline" className="text-xs">Não validado</Badge>;
  if (emailStatus === "valid") return <Badge className="bg-emerald-500/15 text-emerald-700 text-xs border-emerald-200">Válido</Badge>;
  const reasonLabel = reason ? INVALID_REASON_LABELS[reason] ?? reason : null;
  if (emailStatus === "disposable") return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge className="bg-amber-500/15 text-amber-700 text-xs border-amber-200">Descartável</Badge>
      {reasonLabel && <span className="text-[10px] text-amber-600 leading-none">{reasonLabel}</span>}
    </span>
  );
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge variant="destructive" className="text-xs">Inválido</Badge>
      {reasonLabel && <span className="text-[10px] text-destructive/70 leading-none">{reasonLabel}</span>}
    </span>
  );
}

export default function AdminMarketing() {
  const [tab, setTab] = useState<Tab>("overview");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useGetMarketingStats();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetMarketingStatsQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/marketing/contacts"] });
    qc.invalidateQueries({ queryKey: getListMarketingCampaignsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingRepliesQueryKey({}) });
    qc.invalidateQueries({ queryKey: getListMarketingBouncesQueryKey() });
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
          { id: "bounces", label: "Bounces", icon: AlertTriangle },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className={`h-4 w-4 ${t.id === "bounces" && (stats?.bounced ?? 0) > 0 ? "text-orange-500" : ""}`} />
            {t.label}
            {t.id === "respostas" && (stats?.unreadReplies ?? 0) > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center ml-1">
                {stats?.unreadReplies}
              </span>
            )}
            {t.id === "bounces" && (stats?.bounced ?? 0) > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] flex items-center justify-center ml-1 leading-none">
                {stats?.bounced}
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
      {tab === "bounces" && <BouncesTab invalidate={invalidate} toast={toast} />}
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

// ─── Campaign Progress Bar (polls while sending) ──────────────────────────────
function CampaignProgress({ campaignId, onComplete, invalidate, toast }: {
  campaignId: number;
  onComplete: () => void;
  invalidate: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const { data: progress } = useGetMarketingCampaignProgress(campaignId);
  const resumeMutation = useResumeMarketingCampaign({ mutation: {
    onSuccess: () => toast({ title: "Envio retomado!", description: "Continuando de onde parou." }),
    onError: () => toast({ title: "Erro ao retomar", variant: "destructive" }),
  }});

  useEffect(() => {
    // Parar polling se não autenticado (evita consumir rate limit quando sessão expira)
    if (!user) return;
    if (progress?.status !== "sending") {
      if (progress) { onComplete(); invalidate(); }
      return;
    }
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, [progress?.status, user]);

  // Re-fetch on tick — usa a query key exata do hook gerado para não invalidar a lista de campanhas
  const qc = useQueryClient();
  useEffect(() => {
    if (tick > 0) qc.invalidateQueries({ queryKey: getGetMarketingCampaignProgressQueryKey(campaignId) });
  }, [tick]);

  const total = progress?.totalContacts ?? 0;
  const sent = progress?.totalSent ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          Enviando em andamento…
        </span>
        <span className="font-semibold tabular-nums">
          {sent.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} e-mails
          <span className="text-muted-foreground font-normal ml-1">({pct}%)</span>
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      {(progress?.totalBounced ?? 0) > 0 && (
        <p className="text-xs text-red-500">{progress!.totalBounced} bounce(s) detectados</p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm" variant="outline"
          disabled={resumeMutation.isPending}
          onClick={() => resumeMutation.mutate({ id: campaignId })}
          className="gap-1.5 text-xs"
        >
          {resumeMutation.isPending
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
          Retomar se pausado
        </Button>
      </div>
    </div>
  );
}

// ─── Campanhas ───────────────────────────────────────────────────────────────
function CampanhasTab({ invalidate, toast }: { invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [showForm, setShowForm] = useState(false);
  const [editCampaign, setEditCampaign] = useState<number | null>(null);
  const [showSendDialog, setShowSendDialog] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useListMarketingCampaigns();
  const deleteMutation = useDeleteMarketingCampaign({ mutation: {
    onSuccess: () => { toast({ title: "Campanha removida." }); invalidate(); },
    onError: () => toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" }),
  }});
  const cancelMutation = useCancelMarketingCampaign({ mutation: {
    onSuccess: () => { toast({ title: "Campanha cancelada." }); invalidate(); },
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  }});

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao duplicar");
      toast({ title: "Campanha duplicada!", description: "Uma cópia em rascunho foi criada." });
      invalidate();
    } catch {
      toast({ title: "Erro ao duplicar campanha.", variant: "destructive" });
    } finally {
      setDuplicating(null);
    }
  }

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
                  {c.status !== "sending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { setEditCampaign(c.id); setShowForm(true); }}>Editar</Button>
                      <Button size="sm" onClick={() => setShowSendDialog(c.id)} className="gap-1">
                        <Send className="h-3.5 w-3.5" />
                        {c.status === "sent" ? "Reenviar" : c.status === "scheduled" ? "Enviar agora" : "Enviar"}
                      </Button>
                      {c.status === "scheduled" && (
                        <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate({ id: c.id })}>Cancelar</Button>
                      )}
                    </>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="gap-1 text-muted-foreground hover:text-foreground"
                    disabled={duplicating === c.id}
                    onClick={() => handleDuplicate(c.id)}
                    title="Duplicar campanha"
                  >
                    {duplicating === c.id
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8"
                    onClick={() => { if (confirm("Remover campanha?")) deleteMutation.mutate({ id: c.id }); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {c.status === "sending" && (
                <CampaignProgress
                  campaignId={c.id}
                  onComplete={() => {}}
                  invalidate={invalidate}
                  toast={toast}
                />
              )}

              {c.status === "sent" && (
                <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t">
                  {[
                    { label: "Enviados", value: c.totalSent, icon: Send, color: "text-muted-foreground" },
                    { label: "Abertos", value: c.totalOpened, icon: MailOpen, color: "text-blue-500" },
                    { label: "Cliques", value: c.totalClicked, icon: MousePointerClick, color: "text-emerald-500" },
                    { label: "Bounces", value: c.totalBounced, icon: AlertCircle, color: "text-red-400" },
                    { label: "Respostas", value: c.totalReplied, icon: Reply, color: "text-violet-500" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="text-center">
                      <div className={`flex items-center justify-center gap-1 mb-0.5 ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{label}</span>
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
        <SendCampaignDialog
          campaignId={showSendDialog}
          onClose={() => setShowSendDialog(null)}
          onSent={() => { setShowSendDialog(null); invalidate(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─── Send Campaign Dialog ─────────────────────────────────────────────────────
type SendTarget = "all" | "cliente" | "contador" | "specific" | "manual";

interface ManualRecipient { name: string; email: string }

function SendCampaignDialog({
  campaignId, onClose, onSent, toast,
}: {
  campaignId: number;
  onClose: () => void;
  onSent: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [target, setTarget] = useState<SendTarget>("all");
  const [scheduledAt, setScheduledAt] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<{ id: number; name: string; email: string }[]>([]);
  const [manualList, setManualList] = useState<ManualRecipient[]>([{ name: "", email: "" }]);

  const { data: searchResult } = useListMarketingContacts({
    search: contactSearch.length >= 2 ? contactSearch : undefined,
    page: 1,
  });
  const foundContacts = searchResult?.data ?? [];

  const sendMutation = useSendMarketingCampaign({ mutation: {
    onSuccess: (data) => { toast({ title: "Sucesso!", description: data.message }); onSent(); },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao enviar campanha.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  }});

  function toggleContact(c: { id: number; name: string; email: string }) {
    setSelectedContacts(prev =>
      prev.some(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    );
  }

  function setManualField(idx: number, field: keyof ManualRecipient, value: string) {
    setManualList(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addManualRow() { setManualList(prev => [...prev, { name: "", email: "" }]); }
  function removeManualRow(idx: number) { setManualList(prev => prev.filter((_, i) => i !== idx)); }

  function handleSend() {
    const body: {
      scheduledAt?: string;
      targetOverride: SendTarget;
      specificContactIds?: number[];
      manualRecipients?: ManualRecipient[];
    } = { targetOverride: target, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined };

    if (target === "specific") {
      if (!selectedContacts.length) {
        toast({ title: "Selecione ao menos um contato.", variant: "destructive" }); return;
      }
      body.specificContactIds = selectedContacts.map(c => c.id);
    }
    if (target === "manual") {
      const valid = manualList.filter(r => r.name.trim() && /\S+@\S+\.\S+/.test(r.email));
      if (!valid.length) {
        toast({ title: "Adicione ao menos um destinatário válido.", variant: "destructive" }); return;
      }
      body.manualRecipients = valid;
    }

    sendMutation.mutate({ id: campaignId, data: body });
  }

  const targetOptions: { id: SendTarget; label: string; desc: string; icon: React.ElementType }[] = [
    { id: "all", label: "Todos os contatos", desc: "Clientes e contadores ativos", icon: Users },
    { id: "contador", label: "Contadores", desc: "Apenas contadores ativos da base", icon: Users },
    { id: "cliente", label: "Lista de clientes", desc: "Apenas clientes ativos da base", icon: Users },
    { id: "specific", label: "Cliente específico", desc: "Busque e selecione da base", icon: Search },
    { id: "manual", label: "Destinatário manual", desc: "Digite nome e e-mail na hora", icon: Plus },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Enviar Campanha
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Target selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Para quem enviar?</Label>
            <div className="space-y-2">
              {targetOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTarget(opt.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                    target === opt.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    target === opt.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <opt.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <div className={`ml-auto h-4 w-4 rounded-full border-2 shrink-0 ${
                    target === opt.id ? "border-primary bg-primary" : "border-muted-foreground/40"
                  }`} />
                </button>
              ))}
            </div>
          </div>

          {/* Specific contact search */}
          {target === "specific" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Buscar contato</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Nome ou e-mail (mín. 2 caracteres)…"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                />
              </div>
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedContacts.map(c => (
                    <span key={c.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                      {c.name}
                      <button onClick={() => toggleContact(c)} className="hover:text-destructive ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
              {contactSearch.length >= 2 && foundContacts.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {foundContacts.map(c => {
                    const sel = selectedContacts.some(x => x.id === c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleContact(c)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b last:border-0 transition-colors ${
                          sel ? "bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className={`h-3.5 w-3.5 rounded border shrink-0 ${sel ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground text-xs truncate ml-auto">{c.email}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {contactSearch.length >= 2 && foundContacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum contato encontrado.</p>
              )}
            </div>
          )}

          {/* Manual recipients */}
          {target === "manual" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Destinatários</Label>
              <div className="space-y-2">
                {manualList.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Nome"
                      value={r.name}
                      onChange={e => setManualField(i, "name", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="E-mail"
                      type="email"
                      value={r.email}
                      onChange={e => setManualField(i, "email", e.target.value)}
                      className="flex-1"
                    />
                    {manualList.length > 1 && (
                      <button onClick={() => removeManualRow(i)} className="text-destructive/70 hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addManualRow} className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Adicionar outro
                </button>
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Data e hora de envio <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Deixe em branco para enviar imediatamente.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={sendMutation.isPending} onClick={handleSend} className="gap-2">
            {sendMutation.isPending
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Enviando…</>
              : scheduledAt
                ? <><Calendar className="h-4 w-4" />Agendar</>
                : <><Send className="h-4 w-4" />Enviar Agora</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const defaultBodyHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#0f172a;padding:24px 30px;text-align:center;">
        <span style="color:#f59e0b;font-size:22px;font-weight:bold;">LealCert</span>
        <span style="color:#ffffff;font-size:18px;"> — Certificação Digital</span>
      </td></tr>
      <tr><td style="padding:40px 30px;">
        <h2 style="color:#0f172a;margin:0 0 16px;">Olá, {{nome}}!</h2>
        <p style="color:#374151;font-size:16px;line-height:26px;margin:0 0 24px;">
          Escreva aqui o conteúdo principal da sua mensagem.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 0 30px;">
          <a href="https://lealcert.com.br" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 40px;font-size:18px;font-weight:bold;border-radius:8px;display:inline-block;">
            Clique Aqui
          </a>
        </td></tr></table>
        <p style="margin-top:20px;font-size:13px;color:#9ca3af;line-height:22px;">
          LealCert • Certificação Digital com Credibilidade e Segurança
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    subject: existing?.subject ?? "",
    bodyHtml: existing?.bodyHtml ?? defaultBodyHtml,
    bodyText: existing?.bodyText ?? "",
    fromName: existing?.fromName ?? "LealCert Marketing",
    fromEmail: existing?.fromEmail ?? "mkt@lealcert.com.br",
    replyTo: existing?.replyTo ?? "",
    filterTags: existing?.filterTags ?? "",
    targetType: existing?.targetType ?? "all",
  });

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const createMutation = useCreateMarketingCampaign({ mutation: { onSuccess: onSaved, onError: () => toast({ title: "Erro ao criar campanha", variant: "destructive" }) } });
  const updateMutation = useUpdateMarketingCampaign({ mutation: { onSuccess: onSaved, onError: () => toast({ title: "Erro ao atualizar campanha", variant: "destructive" }) } });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...form,
      replyTo: form.replyTo || undefined,
      bodyText: form.bodyText || undefined,
      filterTags: form.filterTags || undefined,
    };
    if (campaignId) updateMutation.mutate({ id: campaignId, data });
    else createMutation.mutate({ data });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const targetLabels: Record<string, string> = {
    all: "Todos os contatos (clientes + contadores)",
    cliente: "Somente clientes",
    contador: "Somente contadores",
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaignId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">

          {/* Destinatários — campo principal em destaque */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Destinatários *</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["all", "cliente", "contador"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("targetType", t)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                    form.targetType === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <span className="block text-xs font-bold mb-0.5">
                    {t === "all" ? "Todos" : t === "cliente" ? "Clientes" : "Contadores"}
                  </span>
                  <span className="text-xs opacity-70 leading-tight">
                    {t === "all" ? "4.545 + 1.392" : t === "cliente" ? "4.545 contatos" : "1.392 contatos"}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {targetLabels[form.targetType]}
            </p>
          </div>

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
type EmailStatusFilter = "all" | "unknown" | "valid" | "invalid" | "disposable";

function ContatosTab({ type, invalidate, toast }: { type: "cliente" | "contador"; invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [emailStatusFilter, setEmailStatusFilter] = useState<EmailStatusFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editContact, setEditContact] = useState<{ id: number; name: string; email: string; phone?: string | null; tags?: string | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const isCliente = type === "cliente";
  const label = isCliente ? "cliente" : "contador";
  const labelPl = isCliente ? "clientes" : "contadores";

  const validateMutation = useValidateContactEmails({ mutation: {
    onSuccess: (result) => {
      toast({
        title: "Validação concluída!",
        description: `${result.processed} e-mails processados — ${result.valid} válidos, ${result.invalid} inválidos, ${result.disposable} descartáveis.`,
      });
      invalidate();
    },
    onError: () => toast({ title: "Erro na validação", variant: "destructive" }),
  }});

  const { data, isLoading } = useListMarketingContacts({
    page,
    search: search || undefined,
    type,
    emailStatus: emailStatusFilter !== "all" ? emailStatusFilter : undefined,
  });

  function handleSearchChange(val: string) { setSearch(val); setPage(1); setSelectedIds(new Set()); }
  function handleEmailStatusChange(val: EmailStatusFilter) { setEmailStatusFilter(val); setPage(1); setSelectedIds(new Set()); }
  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;

  const allPageSelected = contacts.length > 0 && contacts.every(c => selectedIds.has(c.id));
  const somePageSelected = contacts.some(c => selectedIds.has(c.id)) && !allPageSelected;

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => { const next = new Set(prev); contacts.forEach(c => next.delete(c.id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); contacts.forEach(c => next.add(c.id)); return next; });
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const deleteMutation = useDeleteMarketingContact({ mutation: {
    onSuccess: () => { toast({ title: "Contato removido." }); invalidate(); },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  }});
  const updateMutation = useUpdateMarketingContact({ mutation: {
    onSuccess: () => { toast({ title: "Contato atualizado." }); invalidate(); },
  }});
  const bulkDeleteMutation = useBulkDeleteMarketingContacts({ mutation: {
    onSuccess: (result) => {
      toast({ title: `${result.deleted} contato(s) removido(s).` });
      setSelectedIds(new Set());
      invalidate();
    },
    onError: () => toast({ title: "Erro ao remover contatos", variant: "destructive" }),
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

  const totalPages = Math.max(1, Math.ceil(total / 50));

  const emailFilterOptions: { id: EmailStatusFilter; label: string; color: string }[] = [
    { id: "all", label: "Todos", color: "" },
    { id: "unknown", label: "Não validado", color: "text-muted-foreground" },
    { id: "valid", label: "Válido", color: "text-emerald-600" },
    { id: "invalid", label: "Inválido", color: "text-destructive" },
    { id: "disposable", label: "Descartável", color: "text-amber-600" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Buscar por nome ou e-mail…`} value={search} onChange={e => handleSearchChange(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-2 shrink-0">
          {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar planilha
        </Button>
        <Button
          variant="outline"
          onClick={() => validateMutation.mutate({ data: { type, limit: 500 } })}
          disabled={validateMutation.isPending}
          className="gap-2 shrink-0"
          title="Valida MX, domínios descartáveis e formato dos e-mails ainda não validados"
        >
          {validateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {validateMutation.isPending ? "Validando…" : "Validar E-mails"}
        </Button>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      {/* Email status filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Filtrar e-mail:</span>
        {emailFilterOptions.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleEmailStatusChange(opt.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              emailStatusFilter === opt.id
                ? "bg-primary text-white border-primary shadow-sm"
                : `border-border hover:border-muted-foreground/50 ${opt.color}`
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          <strong>{total}</strong> {labelPl} {emailStatusFilter !== "all" ? "filtrados" : "no total"}
        </span>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm font-medium text-primary">{selectedIds.size} selecionado(s)</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar seleção
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                if (confirm(`Remover ${selectedIds.size} contato(s) permanentemente?`))
                  bulkDeleteMutation.mutate({ data: { ids: Array.from(selectedIds) } });
              }}
              className="gap-2"
            >
              {bulkDeleteMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Contacts table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className={`grid ${isCliente ? "grid-cols-[auto_2fr_2fr_1fr_1fr_auto]" : "grid-cols-[auto_2fr_2fr_1.5fr_1fr_1fr_auto]"} text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b bg-muted/30 items-center`}>
          <span className="flex items-center pr-3">
            <input
              type="checkbox"
              checked={allPageSelected}
              ref={el => { if (el) el.indeterminate = somePageSelected; }}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
              title="Selecionar todos desta página"
            />
          </span>
          <span>Nome{!isCliente && " / Escritório"}</span>
          <span>E-mail</span>
          {!isCliente && <span>Telefone</span>}
          <span>Status</span>
          <span>E-mail Válido</span>
          <span></span>
        </div>
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-40" />
            Carregando…
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum {label} encontrado.</p>
            <p className="text-xs mt-1">
              {emailStatusFilter !== "all" ? "Tente remover o filtro de status." : "Importe a planilha ou adicione manualmente."}
            </p>
          </div>
        ) : (
          contacts.map(c => (
            <div
              key={c.id}
              className={`grid ${isCliente ? "grid-cols-[auto_2fr_2fr_1fr_1fr_auto]" : "grid-cols-[auto_2fr_2fr_1.5fr_1fr_1fr_auto]"} px-4 py-3 border-b last:border-0 items-center transition-colors ${selectedIds.has(c.id) ? "bg-primary/5" : "hover:bg-muted/20"}`}
            >
              <span className="flex items-center pr-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                />
              </span>
              <span className="font-medium text-sm truncate">{c.name}</span>
              <span className="text-sm text-muted-foreground truncate">{c.email}</span>
              {!isCliente && <span className="text-sm text-muted-foreground">{c.phone ?? "—"}</span>}
              <span>{contactStatusBadge(c.status, c.bounced)}</span>
              <span>{emailStatusBadge(c.emailStatus, c.emailInvalidReason)}</span>
              <div className="flex items-center gap-1">
                {c.status === "active" && (
                  <button onClick={() => updateMutation.mutate({ id: c.id, data: { status: "unsubscribed" } })}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">
                    Descadastrar
                  </button>
                )}
                <button onClick={() => setEditContact({ id: c.id, name: c.name, email: c.email, phone: c.phone, tags: c.tags })}
                  className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { if (confirm(`Remover ${c.name}?`)) deleteMutation.mutate({ id: c.id }); }}
                  className="text-destructive/70 hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4 rotate-180" /> Anterior
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                    p === page ? "bg-primary text-white" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
        {csvHint}
      </div>

      {showAdd && <AddContactDialog type={type} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); invalidate(); }} toast={toast} />}
      {editContact && <EditContactDialog contact={editContact} type={type} onClose={() => setEditContact(null)} onSaved={() => { setEditContact(null); invalidate(); }} toast={toast} />}
    </div>
  );
}

function AddContactDialog({ type, onClose, onSaved, toast }: { type: "cliente" | "contador"; onClose: () => void; onSaved: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const isCliente = type === "cliente";
  const [form, setForm] = useState({ name: "", email: "", phone: "", tags: "" });
  const mutation = useCreateMarketingContact({ mutation: {
    onSuccess: onSaved,
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao adicionar contato.";
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

function EditContactDialog({ contact, type, onClose, onSaved, toast }: {
  contact: { id: number; name: string; email: string; phone?: string | null; tags?: string | null };
  type: "cliente" | "contador";
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const isCliente = type === "cliente";
  const [form, setForm] = useState({
    name: contact.name,
    email: contact.email,
    phone: contact.phone ?? "",
    tags: contact.tags ?? "",
  });
  const mutation = useUpdateMarketingContact({ mutation: {
    onSuccess: () => { toast({ title: "Contato atualizado!" }); onSaved(); },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  }});

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const handleSave = () => mutation.mutate({
    id: contact.id,
    data: { name: form.name, email: form.email, phone: form.phone || undefined, tags: form.tags || undefined },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar {isCliente ? "Cliente" : "Contador"}</DialogTitle></DialogHeader>
        <form className="space-y-3 py-2" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <div className="space-y-1.5"><Label>{isCliente ? "Nome *" : "Nome / Escritório *"}</Label><Input required value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>E-mail *</Label><Input required type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" /></div>
          <div className="space-y-1.5"><Label>Tags / Estado (separados por vírgula)</Label><Input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="SP, vip" /></div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={mutation.isPending} onClick={handleSave}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bounces ──────────────────────────────────────────────────────────────────
function BouncesTab({ invalidate, toast }: { invalidate: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: bounces = [], isLoading } = useListMarketingBounces();

  const restoreMutation = useRestoreMarketingBounce({ mutation: {
    onSuccess: () => { toast({ title: "Contato restaurado!", description: "O e-mail será incluído nos próximos envios." }); invalidate(); },
    onError: () => toast({ title: "Erro ao restaurar contato", variant: "destructive" }),
  }});

  const deleteMutation = useDeleteMarketingBounce({ mutation: {
    onSuccess: () => { toast({ title: "Contato excluído permanentemente." }); invalidate(); },
    onError: () => toast({ title: "Erro ao excluir contato", variant: "destructive" }),
  }});

  function handleRestore(id: number, email: string) {
    if (confirm(`Restaurar ${email}? Ele voltará a receber e-mails nas próximas campanhas.`))
      restoreMutation.mutate({ id });
  }

  function handleDelete(id: number, email: string) {
    if (confirm(`Excluir permanentemente ${email}? Essa ação não pode ser desfeita.`))
      deleteMutation.mutate({ id });
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-orange-800">E-mails rejeitados (bounces)</p>
          <p className="text-orange-700 mt-0.5">
            Esses contatos tiveram e-mails devolvidos pelo servidor de destino. Verifique se o endereço está correto antes de decidir.
            <br />
            <strong>Restaurar</strong> — volta a enviar para este contato nas próximas campanhas. &nbsp;
            <strong>Excluir</strong> — remove permanentemente do sistema.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : bounces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <p className="font-medium">Nenhum bounce registrado</p>
          <p className="text-sm">Todos os e-mails enviados foram aceitos pelos servidores de destino.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_2fr_1fr_2fr_1fr_auto] text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b bg-muted/30">
            <span>Nome</span>
            <span>E-mail</span>
            <span>Tipo</span>
            <span>Motivo do Bounce</span>
            <span>Campanha</span>
            <span></span>
          </div>

          {bounces.map((b, i) => (
            <div
              key={b.id}
              className={`grid grid-cols-[2fr_2fr_1fr_2fr_1fr_auto] px-4 py-3 items-start gap-3 text-sm ${
                i < bounces.length - 1 ? "border-b" : ""
              } hover:bg-muted/20 transition-colors`}
            >
              {/* Nome */}
              <span className="font-medium truncate">{b.name}</span>

              {/* E-mail */}
              <span className="text-muted-foreground truncate font-mono text-xs">{b.email}</span>

              {/* Tipo */}
              <span>
                <Badge variant="outline" className="text-xs capitalize">{b.type}</Badge>
              </span>

              {/* Motivo */}
              <div className="space-y-0.5">
                {b.lastError ? (
                  <>
                    <p className="text-xs text-destructive leading-snug line-clamp-2" title={b.lastError}>
                      {b.lastError}
                    </p>
                    {b.lastSentAt && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(b.lastSentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Sem detalhes registrados</span>
                )}
              </div>

              {/* Campanha */}
              <span className="text-xs text-muted-foreground truncate">
                {b.campaignName ?? "—"}
              </span>

              {/* Ações */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:bg-green-50 hover:text-green-700"
                  title="Restaurar — voltar a enviar e-mails para este contato"
                  disabled={restoreMutation.isPending}
                  onClick={() => handleRestore(b.id, b.email)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title="Excluir permanentemente"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleDelete(b.id, b.email)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">{bounces.length} contato(s) com bounce</p>
    </div>
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
  const deleteMutation = useDeleteMarketingReply({ mutation: {
    onSuccess: () => {
      toast({ title: "Mensagem excluída." });
      setSelected(null);
      invalidate();
    },
    onError: () => toast({ title: "Erro ao excluir mensagem", variant: "destructive" }),
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(selectedReply.createdAt).toLocaleString("pt-BR")}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        disabled={deleteMutation.isPending}
                        onClick={() => { if (confirm("Excluir esta mensagem?")) deleteMutation.mutate({ id: selectedReply.id }); }}
                        title="Excluir mensagem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="font-medium mt-2">{selectedReply.subject ?? "(sem assunto)"}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {selectedReply.bodyHtml ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedReply.bodyHtml) }} />
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
