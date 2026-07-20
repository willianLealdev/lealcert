import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWaCampaigns,
  useCreateWaCampaign,
  useUpdateWaCampaign,
  useDeleteWaCampaign,
  useSendWaCampaign,
  usePauseWaCampaign,
  useResumeWaCampaign,
  useGetWaCampaignProgress,
  useListWaCampaignSends,
  useListMarketingContacts,
  getListWaCampaignSendsQueryKey,
  getListWaCampaignsQueryKey,
} from "@workspace/api-client-react";
import type { WaCampaign, WaSend } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  Pause,
  Play,
  MessageSquare,
  Phone,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  UserX,
  Search,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WaStatus = "draft" | "scheduled" | "sending" | "paused" | "sent" | "cancelled";

const STATUS_LABELS: Record<WaStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  sending: "Enviando",
  paused: "Pausada",
  sent: "Enviada",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<WaStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  sending: "bg-amber-50 text-amber-700 border-amber-200",
  paused: "bg-orange-50 text-orange-700 border-orange-200",
  sent: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const TARGET_LABELS: Record<string, string> = {
  all: "Todos os contatos",
  cliente: "Clientes",
  contador: "Contadores",
  new_contacts: "Novos contatos",
  new_cliente: "Novos clientes",
  new_contador: "Novos contadores",
  opened_all: "Abriram algum e-mail",
  opened_cliente: "Clientes que abriram e-mail",
  opened_contador: "Contadores que abriram e-mail",
  clicked_all: "Clicaram em algum e-mail",
  clicked_cliente: "Clientes que clicaram",
  clicked_contador: "Contadores que clicaram",
  not_opened_cliente: "Clientes sem abertura de e-mail",
  not_opened_contador: "Contadores sem abertura de e-mail",
  specific: "Cliente específico",
  manual: "Destinatário manual",
};

const DAYS_OF_WEEK = [
  { value: "0", label: "Dom" },
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
];

// ── Phone Bubble Preview ──────────────────────────────────────────────────────

function PhoneBubblePreview({ message }: { message: string }) {
  const preview =
    (message || "_Sua mensagem aparecerá aqui…_") +
    "\n\n_Responda *SAIR* para cancelar o recebimento._";

  // Render WhatsApp-style formatting
  function renderText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).map((part, j) => {
        if (part.startsWith("*") && part.endsWith("*")) {
          return <strong key={j}>{part.slice(1, -1)}</strong>;
        }
        if (part.startsWith("_") && part.endsWith("_")) {
          return <em key={j} className="text-white/70">{part.slice(1, -1)}</em>;
        }
        return <span key={j}>{part}</span>;
      });
      return (
        <span key={i}>
          {parts}
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Phone className="h-3 w-3" />
        Prévia do WhatsApp
      </div>
      {/* Phone shell */}
      <div
        className="flex-1 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#0b1419", minHeight: 260 }}
      >
        {/* WA header */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: "#1f2c33" }}
        >
          <div className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
            <Users className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-white leading-none">Contato</p>
            <p className="text-[9px] text-white/50">online</p>
          </div>
        </div>
        {/* Chat area */}
        <div
          className="flex-1 flex flex-col justify-end p-3 gap-1"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E\")",
            background: "#0b1419",
          }}
        >
          {/* Sent message bubble */}
          <div className="flex justify-end">
            <div
              className="max-w-[85%] rounded-lg rounded-tr-sm px-2.5 py-1.5 text-[12px] leading-relaxed text-white shadow-sm relative"
              style={{ background: "#005c4b" }}
            >
              <p className="break-words whitespace-pre-wrap">{renderText(preview)}</p>
              <p className="text-[9px] text-white/50 text-right mt-0.5">
                {new Date().toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" ✓✓"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function CampaignProgress({
  campaignId,
  onDone,
}: {
  campaignId: number;
  onDone: () => void;
}) {
  const { data } = useGetWaCampaignProgress(campaignId, {
    query: { queryKey: ["wa-progress", campaignId], refetchInterval: 2500 },
  });

  useEffect(() => {
    if (data?.status === "sent" || data?.status === "cancelled") {
      onDone();
    }
  }, [data?.status, onDone]);

  if (!data) return null;

  const total = data.totalContacts || 1;
  const done = data.totalSent + data.totalFailed;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="space-y-1">
      <Progress value={pct} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">
        {data.totalSent}/{data.totalContacts} enviados
        {data.totalFailed > 0 && (
          <span className="text-red-500 ml-1">· {data.totalFailed} falhas</span>
        )}
        {data.paused && <span className="text-orange-500 ml-1">· pausada</span>}
      </p>
    </div>
  );
}

// ── Send Dialog ───────────────────────────────────────────────────────────────

function SendDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: WaCampaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sendMutation = useSendWaCampaign();

  const [targetOverride, setTargetOverride] = useState("all");
  const [sendPerMinute, setSendPerMinute] = useState("30");
  const [useBusinessHours, setUseBusinessHours] = useState(false);
  const [sendStartHour, setSendStartHour] = useState("8");
  const [sendEndHour, setSendEndHour] = useState("18");
  const [selectedDays, setSelectedDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [useSchedule, setUseSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [manualPhones, setManualPhones] = useState<string[]>([""]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<{ id: number; name: string; phone?: string | null; email?: string }[]>([]);

  const { data: searchResult } = useListMarketingContacts({
    search: contactSearch.length >= 2 ? contactSearch : undefined,
    page: 1,
  });
  const foundContacts = searchResult?.data ?? [];

  function toggleContact(c: { id: number; name: string; phone?: string | null; email?: string }) {
    setSelectedContacts(prev =>
      prev.some(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    );
  }

  function toggleDay(d: string) {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  function setManualPhone(i: number, val: string) {
    setManualPhones((prev) => prev.map((p, idx) => (idx === i ? val : p)));
  }

  function addManualPhone() {
    setManualPhones((prev) => [...prev, ""]);
  }

  function removeManualPhone(i: number) {
    setManualPhones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSend() {
    const body: Record<string, unknown> = { targetOverride };
    if (sendPerMinute) body.sendPerMinute = Number(sendPerMinute);
    if (useBusinessHours) {
      body.sendStartHour = Number(sendStartHour);
      body.sendEndHour = Number(sendEndHour);
      if (selectedDays.length > 0) body.sendDays = selectedDays.join(",");
    }
    if (useSchedule && scheduledAt) {
      body.scheduledAt = new Date(scheduledAt).toISOString();
    }
    if (targetOverride === "specific") {
      if (!selectedContacts.length) {
        toast({ title: "Selecione ao menos um contato.", variant: "destructive" });
        return;
      }
      body.specificContactIds = selectedContacts.map(c => c.id);
    }
    if (targetOverride === "manual") {
      const phones = manualPhones.map((p) => p.replace(/\D/g, "")).filter(Boolean);
      if (phones.length === 0) {
        toast({ title: "Informe ao menos um número", variant: "destructive" });
        return;
      }
      body.manualPhones = phones;
    }

    sendMutation.mutate(
      { id: campaign.id, data: body as Parameters<typeof sendMutation.mutate>[0]["data"] },
      {
        onSuccess: () => {
          toast({ title: useSchedule ? "Campanha agendada!" : "Campanha iniciada!", description: "Mensagens sendo enviadas em segundo plano." });
          queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Erro ao enviar.";
          toast({ title: "Erro", description: msg, variant: "destructive" });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-green-600" />
            Enviar campanha WhatsApp
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{campaign.name}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div>
            <Label>Público-alvo</Label>
            <Select value={targetOverride} onValueChange={(v) => { setTargetOverride(v); if (v === "manual") setManualPhones([""]); if (v !== "specific") { setContactSearch(""); setSelectedContacts([]); } }}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {Object.entries(TARGET_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetOverride === "specific" && (
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
                    <span key={c.id} className="flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
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
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b last:border-0 transition-colors ${sel ? "bg-green-50" : "hover:bg-muted/50"}`}
                      >
                        <div className={`h-3.5 w-3.5 rounded border shrink-0 ${sel ? "bg-green-600 border-green-600" : "border-muted-foreground/40"}`} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground text-xs truncate ml-auto">{c.phone ?? c.email}</span>
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

          {targetOverride === "manual" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Números de WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Prefixo +55 já incluído. Digite apenas DDD + número (ex: 11912345678).</p>
              <div className="space-y-2">
                {manualPhones.map((phone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-2 rounded-l border border-r-0 border-border shrink-0">+55</span>
                    <Input
                      className="rounded-l-none flex-1"
                      placeholder="11912345678"
                      value={phone}
                      maxLength={11}
                      onChange={(e) => setManualPhone(i, e.target.value.replace(/\D/g, ""))}
                    />
                    {manualPhones.length > 1 && (
                      <button onClick={() => removeManualPhone(i)} className="text-destructive/70 hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addManualPhone}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar número
                </button>
              </div>
            </div>
          )}

          <div>
            <Label>Limite de envio (msgs/minuto)</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={sendPerMinute}
              onChange={(e) => setSendPerMinute(e.target.value)}
              className="mt-1"
              placeholder="Ex: 30"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Recomendado: 20–60 msg/min para evitar bloqueio.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="biz-hours"
              checked={useBusinessHours}
              onCheckedChange={setUseBusinessHours}
            />
            <Label htmlFor="biz-hours">Restringir a horário comercial</Label>
          </div>

          {useBusinessHours && (
            <div className="pl-4 border-l-2 border-muted space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Das</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={sendStartHour}
                    onChange={(e) => setSendStartHour(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={sendEndHour}
                    onChange={(e) => setSendEndHour(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Dias da semana</Label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "px-2 py-1 text-xs rounded border transition-colors",
                        selectedDays.includes(d.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch
              id="use-schedule"
              checked={useSchedule}
              onCheckedChange={setUseSchedule}
            />
            <Label htmlFor="use-schedule">Agendar para data/hora específica</Label>
          </div>

          {useSchedule && (
            <div>
              <Label>Data e horário</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sendMutation.isPending ? "Iniciando…" : useSchedule ? "Agendar" : "Enviar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create/Edit Dialog ────────────────────────────────────────────────────────

function CampaignDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign?: WaCampaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateWaCampaign();
  const updateMutation = useUpdateWaCampaign();

  const [name, setName] = useState(campaign?.name ?? "");
  const [message, setMessage] = useState(campaign?.message ?? "");

  useEffect(() => {
    setName(campaign?.name ?? "");
    setMessage(campaign?.message ?? "");
  }, [campaign, open]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSave() {
    if (!name.trim() || !message.trim()) {
      toast({ title: "Atenção", description: "Nome e mensagem são obrigatórios.", variant: "destructive" });
      return;
    }
    const data = { name, message };
    const opts = {
      onSuccess: () => {
        toast({ title: campaign ? "Campanha atualizada!" : "Campanha criada!" });
        queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
        onOpenChange(false);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
      },
    };
    if (campaign) {
      updateMutation.mutate({ id: campaign.id, data }, opts);
    } else {
      createMutation.mutate({ data }, opts);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Editar campanha WhatsApp" : "Nova campanha WhatsApp"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Promo Certificado A1 – Julho"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                placeholder={"Olá {{nome}}, temos uma oferta especial para você!\n\nCertificado Digital A1 com 30% de desconto este mês.\n\nAcesse: https://lealcert.com.br/comprar"}
                className="mt-1 font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use <code className="bg-muted px-1 rounded">{"{{nome}}"}</code> para personalizar com o nome do contato.
                O rodapé com instrução SAIR é adicionado automaticamente.
              </p>
            </div>
          </div>

          {/* Preview */}
          <div
            className="rounded-xl p-4 flex flex-col"
            style={{ background: "#111b21" }}
          >
            <PhoneBubblePreview message={message} />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando…" : campaign ? "Salvar alterações" : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sends Dialog ──────────────────────────────────────────────────────────────

function WaSendsDialog({ campaignId, campaignName, open, onClose }: { campaignId: number; campaignName: string; open: boolean; onClose: () => void }) {
  const { data: sends = [], isLoading } = useListWaCampaignSends(
    campaignId,
    { query: { queryKey: getListWaCampaignSendsQueryKey(campaignId), enabled: open } },
  );

  const sent = sends.filter(s => s.status === "sent").length;
  const failed = sends.filter(s => s.status === "failed").length;
  const unsub = sends.filter(s => s.unsubscribed).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Envios — {campaignName}</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-4 text-sm flex-wrap border-b pb-3">
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" /> {sent} enviados
          </span>
          {failed > 0 && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <XCircle className="h-4 w-4" /> {failed} falhas
            </span>
          )}
          {unsub > 0 && (
            <span className="flex items-center gap-1 text-slate-500 font-medium">
              <UserX className="h-4 w-4" /> {unsub} descadastrados
            </span>
          )}
          <span className="text-muted-foreground">{sends.length} total</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
          {!isLoading && sends.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum envio registrado.</p>
          )}
          {sends.map((s: WaSend) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.recipientName ?? s.phone}</p>
                <p className="text-xs text-muted-foreground">{s.phone}</p>
                {s.error && <p className="text-xs text-red-500 truncate">{s.error}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.unsubscribed && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border flex items-center gap-1">
                    <UserX className="h-3 w-3" /> Descadastrado
                  </span>
                )}
                <span className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border font-medium",
                  s.status === "sent" ? "bg-green-50 text-green-700 border-green-200" :
                  s.status === "failed" ? "bg-red-50 text-red-600 border-red-200" :
                  "bg-gray-50 text-gray-600 border-gray-200"
                )}>
                  {s.status === "sent" ? "Enviado" : s.status === "failed" ? "Falhou" : s.status}
                </span>
                {s.sentAt && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  onEdit,
  onDelete,
  onSend,
}: {
  campaign: WaCampaign;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pauseMutation = usePauseWaCampaign();
  const resumeMutation = useResumeWaCampaign();
  const [showSends, setShowSends] = useState(false);

  const isSending = campaign.status === "sending";
  const isPaused = campaign.status === "paused";
  const isDone = campaign.status === "sent";
  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";

  function handlePause() {
    pauseMutation.mutate(
      { id: campaign.id },
      {
        onSuccess: () => {
          toast({ title: "Campanha pausada." });
          queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
        },
      },
    );
  }

  function handleResume() {
    resumeMutation.mutate(
      { id: campaign.id },
      {
        onSuccess: () => {
          toast({ title: "Campanha retomada!" });
          queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
        },
      },
    );
  }

  const onProgressDone = () => {
    queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
  };

  const statusKey = campaign.status as WaStatus;

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{campaign.name}</p>
            <span
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border font-medium",
                STATUS_COLORS[statusKey] ?? "bg-gray-100 text-gray-700",
              )}
            >
              {STATUS_LABELS[statusKey] ?? campaign.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(() => {
              const effective = campaign.scheduledTargetOverride ?? campaign.targetType;
              return TARGET_LABELS[effective] ?? effective;
            })()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {campaign.totalSent > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowSends(true)}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              Ver Envios
            </Button>
          )}
          {(isDraft || isDone || isScheduled) && (
            <Button size="sm" variant="outline" onClick={onSend} className="text-green-700 border-green-200 hover:bg-green-50">
              <Send className="h-3.5 w-3.5 mr-1" />
              {isDone ? "Reenviar" : isScheduled ? "Reagendar" : "Enviar"}
            </Button>
          )}
          {isSending && (
            <Button size="sm" variant="outline" onClick={handlePause} disabled={pauseMutation.isPending}>
              <Pause className="h-3.5 w-3.5 mr-1" />
              Pausar
            </Button>
          )}
          {isPaused && (
            <Button size="sm" variant="outline" onClick={handleResume} disabled={resumeMutation.isPending} className="text-amber-700 border-amber-200 hover:bg-amber-50">
              <Play className="h-3.5 w-3.5 mr-1" />
              Retomar
            </Button>
          )}
          {(isDraft || isDone || isScheduled) && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {campaign.totalContacts} contatos
        </span>
        {campaign.totalSent > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            {campaign.totalSent} enviados
          </span>
        )}
        {campaign.totalFailed > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <XCircle className="h-3 w-3" />
            {campaign.totalFailed} falhas
          </span>
        )}
        {campaign.sentAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(campaign.sentAt).toLocaleDateString("pt-BR")}
          </span>
        )}
        {campaign.scheduledAt && isScheduled && (
          <span className="flex items-center gap-1 text-blue-600">
            <Clock className="h-3 w-3" />
            Agendada: {new Date(campaign.scheduledAt).toLocaleString("pt-BR")}
          </span>
        )}
      </div>

      {/* Progress (only while sending/paused) */}
      {(isSending || isPaused) && (
        <CampaignProgress campaignId={campaign.id} onDone={onProgressDone} />
      )}

      {/* Message preview snippet */}
      <p className="text-xs text-muted-foreground italic truncate border-t pt-2">
        "{campaign.message.slice(0, 80)}{campaign.message.length > 80 ? "…" : ""}"
      </p>

      {showSends && (
        <WaSendsDialog
          campaignId={campaign.id}
          campaignName={campaign.name}
          open={showSends}
          onClose={() => setShowSends(false)}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminWhatsAppMarketing() {
  const { data: campaigns = [], isLoading } = useListWaCampaigns({
    query: { queryKey: getListWaCampaignsQueryKey(), refetchInterval: 5000 },
  });
  const deleteMutation = useDeleteWaCampaign();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<WaCampaign | null>(null);
  const [sendCampaign, setSendCampaign] = useState<WaCampaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<WaCampaign | null>(null);

  function handleDelete() {
    if (!deleteCampaign) return;
    deleteMutation.mutate(
      { id: deleteCampaign.id },
      {
        onSuccess: () => {
          toast({ title: "Campanha removida." });
          queryClient.invalidateQueries({ queryKey: getListWaCampaignsQueryKey() });
          setDeleteCampaign(null);
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" });
        },
      },
    );
  }

  const activeCampaigns = campaigns.filter(
    (c) => c.status === "sending" || c.status === "paused",
  );
  const sentCampaigns = campaigns.filter((c) => c.status === "sent");
  const draftOrScheduled = campaigns.filter(
    (c) => c.status === "draft" || c.status === "scheduled",
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6 text-green-600" />
            Campanhas WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Envie mensagens via Evolution API. Contatos que respondam{" "}
            <strong>SAIR</strong> são descadastrados automaticamente.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      {/* Webhook tip */}
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <AlertCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        <div className="text-sm text-green-800">
          <strong>Webhook SAIR</strong> — Configure no painel Evolution a URL:
          <code className="ml-1 bg-green-100 px-1 py-0.5 rounded text-xs break-all">
            POST /api/marketing/wa/webhook/sair
          </code>
          {" "}para detectar descadastros automáticos.
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <MessageSquare className="h-5 w-5 animate-pulse mr-2" />
          Carregando campanhas…
        </div>
      )}

      {/* Active */}
      {activeCampaigns.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Em andamento
          </h2>
          {activeCampaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onEdit={() => setEditCampaign(c)}
              onDelete={() => setDeleteCampaign(c)}
              onSend={() => setSendCampaign(c)}
            />
          ))}
        </section>
      )}

      {/* Draft/Scheduled */}
      {draftOrScheduled.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Rascunhos e agendadas
          </h2>
          {draftOrScheduled.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onEdit={() => setEditCampaign(c)}
              onDelete={() => setDeleteCampaign(c)}
              onSend={() => setSendCampaign(c)}
            />
          ))}
        </section>
      )}

      {/* Sent */}
      {sentCampaigns.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Enviadas
          </h2>
          {sentCampaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onEdit={() => setEditCampaign(c)}
              onDelete={() => setDeleteCampaign(c)}
              onSend={() => setSendCampaign(c)}
            />
          ))}
        </section>
      )}

      {/* Empty */}
      {!isLoading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <MessageSquare className="h-10 w-10 opacity-20" />
          <p className="text-sm">Nenhuma campanha criada ainda.</p>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Criar primeira campanha
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <CampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      {editCampaign && (
        <CampaignDialog
          campaign={editCampaign}
          open={!!editCampaign}
          onOpenChange={(v) => { if (!v) setEditCampaign(null); }}
        />
      )}
      {sendCampaign && (
        <SendDialog
          campaign={sendCampaign}
          open={!!sendCampaign}
          onOpenChange={(v) => { if (!v) setSendCampaign(null); }}
        />
      )}
      <AlertDialog open={!!deleteCampaign} onOpenChange={(v) => { if (!v) setDeleteCampaign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover campanha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteCampaign?.name}</strong>? Todos os registros de envio serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
