import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Play, Pause, Plus,
  Trash2, RefreshCw, AlertTriangle, CheckCircle2, Mic, Bot,
  Volume2, Users, Clock, TrendingUp, Voicemail, Ban, ChevronDown,
  ChevronUp, FileText, Loader2, PhoneIncoming, User, Mail,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────
interface Campaign {
  id: number; name: string; status: string;
  pauseReason?: string | null; pausedApi?: string | null;
  targetType: string; manualNumber?: string | null;
  aiModel: string; agentName: string; ttsProvider: string; ttsVoiceId?: string | null;
  windowMorningStart: number; windowMorningEnd: number;
  windowAfternoonStart: number; windowAfternoonEnd: number;
  windowDays: string; maxConcurrentCalls: number; maxAttempts: number;
  totalCalled: number; totalAnswered: number; totalVoicemail: number;
  totalOptout: number; totalNoAnswer: number; totalFailed: number;
  startedAt?: string | null; completedAt?: string | null; createdAt: string;
}

interface CallRecord {
  id: number; phoneNumber: string; contactName?: string | null;
  status: string; outcome?: string | null; attemptNumber: number;
  durationSeconds?: number | null; transcript?: string | null;
  recordingUrl?: string | null; startedAt?: string | null;
  endedAt?: string | null; createdAt: string; error?: string | null;
  aiModelUsed?: string | null; ttsProviderUsed?: string | null;
  contactEmail?: string | null; wantsFollowupEmail?: boolean;
  followupEmailSentAt?: string | null;
  twilioCallSid?: string | null;
}

interface CampaignStatus {
  campaign: Campaign;
  activeCalls: { id: number; phone: string; name: string | null; status: string; startedAt: string | null }[];
  totalQueued: number; totalAnswered: number; totalNoAnswer: number;
  totalVoicemail: number; totalFailed: number; totalOptout: number;
  totalDone: number; answerRate: number;
}

interface Contact { id: number; name: string; phone: string | null; type: string; }

const API = (path: string) => `/api${path}`;

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Helpers ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", running: "Em andamento", paused: "Pausada",
  completed: "Concluída", error: "Erro", credit_error: "Crédito esgotado",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  running: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  error: "bg-red-100 text-red-700",
  credit_error: "bg-orange-100 text-orange-700",
};
const CALL_STATUS_LABELS: Record<string, string> = {
  queued: "Na fila", dialing: "Discando", in_progress: "Em conversa",
  answered: "Atendida", no_answer: "Não atendeu", voicemail: "Caixa postal",
  failed: "Falhou", optout: "Opt-out", busy: "Ocupado",
};
const CALL_STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  dialing: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  answered: "bg-green-100 text-green-700",
  no_answer: "bg-yellow-100 text-yellow-700",
  voicemail: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
  optout: "bg-orange-100 text-orange-700",
  busy: "bg-gray-100 text-gray-600",
};

const DAYS_OPTIONS = [
  { value: "mon", label: "Seg" }, { value: "tue", label: "Ter" },
  { value: "wed", label: "Qua" }, { value: "thu", label: "Qui" },
  { value: "fri", label: "Sex" }, { value: "sat", label: "Sáb" },
  { value: "sun", label: "Dom" },
];

function parseDays(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return ["mon","tue","wed","thu"]; }
}

function formatDuration(secs?: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── Mapa de DDDs do Brasil por região → estado ────────────────────
const DDD_REGIONS = [
  {
    region: "Sudeste",
    color: "text-blue-600",
    states: [
      { uf: "SP", name: "São Paulo",       ddds: ["11","12","13","14","15","16","17","18","19"] },
      { uf: "RJ", name: "Rio de Janeiro",  ddds: ["21","22","24"] },
      { uf: "ES", name: "Espírito Santo",  ddds: ["27","28"] },
      { uf: "MG", name: "Minas Gerais",    ddds: ["31","32","33","34","35","37","38"] },
    ],
  },
  {
    region: "Sul",
    color: "text-green-600",
    states: [
      { uf: "PR", name: "Paraná",           ddds: ["41","42","43","44","45","46"] },
      { uf: "SC", name: "Santa Catarina",   ddds: ["47","48","49"] },
      { uf: "RS", name: "Rio Grande do Sul",ddds: ["51","53","54","55"] },
    ],
  },
  {
    region: "Centro-Oeste",
    color: "text-yellow-600",
    states: [
      { uf: "DF", name: "Distrito Federal", ddds: ["61"] },
      { uf: "GO", name: "Goiás",            ddds: ["62","64"] },
      { uf: "MT", name: "Mato Grosso",      ddds: ["65","66"] },
      { uf: "MS", name: "Mato Grosso do Sul",ddds: ["67"] },
    ],
  },
  {
    region: "Nordeste",
    color: "text-orange-600",
    states: [
      { uf: "BA", name: "Bahia",            ddds: ["71","73","74","75","77"] },
      { uf: "SE", name: "Sergipe",          ddds: ["79"] },
      { uf: "PE", name: "Pernambuco",       ddds: ["81","87"] },
      { uf: "PB", name: "Paraíba",          ddds: ["83"] },
      { uf: "AL", name: "Alagoas",          ddds: ["82"] },
      { uf: "RN", name: "Rio Grande do Norte", ddds: ["84"] },
      { uf: "CE", name: "Ceará",            ddds: ["85","88"] },
      { uf: "PI", name: "Piauí",            ddds: ["86","89"] },
      { uf: "MA", name: "Maranhão",         ddds: ["98","99"] },
    ],
  },
  {
    region: "Norte",
    color: "text-teal-600",
    states: [
      { uf: "PA", name: "Pará",             ddds: ["91","93","94"] },
      { uf: "AM", name: "Amazonas",         ddds: ["92","97"] },
      { uf: "RR", name: "Roraima",          ddds: ["95"] },
      { uf: "AP", name: "Amapá",            ddds: ["96"] },
      { uf: "AC", name: "Acre",             ddds: ["68"] },
      { uf: "RO", name: "Rondônia",         ddds: ["69"] },
      { uf: "TO", name: "Tocantins",        ddds: ["63"] },
    ],
  },
] as const;

// ── Seletor de DDD visual ─────────────────────────────────────────
function DddSelector({
  value,
  onChange,
}: {
  value: string;          // "11,17,21" ou ""
  onChange: (v: string) => void;
}) {
  const selected = useMemo(
    () => new Set(value ? value.split(",").map(d => d.trim()).filter(Boolean) : []),
    [value],
  );

  function toggle(ddd: string) {
    const next = new Set(selected);
    next.has(ddd) ? next.delete(ddd) : next.add(ddd);
    onChange([...next].sort().join(","));
  }

  function toggleState(ddds: readonly string[]) {
    const allSelected = ddds.every(d => selected.has(d));
    const next = new Set(selected);
    ddds.forEach(d => allSelected ? next.delete(d) : next.add(d));
    onChange([...next].sort().join(","));
  }

  function toggleRegion(states: readonly { ddds: readonly string[] }[]) {
    const allDdds = states.flatMap(s => [...s.ddds]);
    const allSelected = allDdds.every(d => selected.has(d));
    const next = new Set(selected);
    allDdds.forEach(d => allSelected ? next.delete(d) : next.add(d));
    onChange([...next].sort().join(","));
  }

  function clearAll() { onChange(""); }
  function selectAll() {
    const all = DDD_REGIONS.flatMap(r => r.states.flatMap(s => [...s.ddds]));
    onChange([...new Set(all)].sort().join(","));
  }

  const total = selected.size;

  return (
    <div className="space-y-3">
      {/* Cabeçalho / resumo */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {total === 0
            ? "Nenhum DDD selecionado — vai ligar para todos"
            : `${total} DDD${total > 1 ? "s" : ""} selecionado${total > 1 ? "s" : ""}`}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={selectAll}
            className="text-xs text-primary hover:underline">Todos</button>
          {total > 0 && (
            <button type="button" onClick={clearAll}
              className="text-xs text-destructive hover:underline">Limpar</button>
          )}
        </div>
      </div>

      {/* Regiões */}
      <div className="space-y-4 max-h-72 overflow-y-auto rounded-lg border bg-muted/30 p-3">
        {DDD_REGIONS.map(({ region, color, states }) => {
          const allDdds = states.flatMap(s => [...s.ddds]);
          const regionSelected = allDdds.filter(d => selected.has(d)).length;
          const regionTotal = allDdds.length;
          const regionFull = regionSelected === regionTotal;

          return (
            <div key={region}>
              {/* Cabeçalho da região */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{region}</span>
                <button type="button"
                  onClick={() => toggleRegion(states)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    regionFull
                      ? "bg-primary text-primary-foreground border-primary"
                      : regionSelected > 0
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "text-muted-foreground border-border hover:border-muted-foreground"
                  }`}>
                  {regionFull ? "✓ Região" : regionSelected > 0 ? `${regionSelected}/${regionTotal}` : "Região"}
                </button>
              </div>

              {/* Estados */}
              <div className="space-y-2 pl-1">
                {states.map(({ uf, name, ddds }) => {
                  const stateSelected = ddds.filter(d => selected.has(d)).length;
                  const stateFull = stateSelected === ddds.length;

                  return (
                    <div key={uf} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button type="button"
                          onClick={() => toggleState(ddds)}
                          className={`text-xs font-medium px-1.5 py-0.5 rounded border transition-colors ${
                            stateFull
                              ? "bg-primary/10 text-primary border-primary/50"
                              : stateSelected > 0
                              ? "bg-primary/5 text-primary border-primary/30"
                              : "text-muted-foreground border-transparent hover:border-border"
                          }`}>
                          {uf}
                        </button>
                        <span className="text-xs text-muted-foreground">{name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pl-8">
                        {ddds.map(ddd => (
                          <button
                            key={ddd}
                            type="button"
                            onClick={() => toggle(ddd)}
                            className={`h-7 w-10 rounded text-xs font-mono font-semibold border transition-all ${
                              selected.has(ddd)
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                            }`}>
                            {ddd}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chips dos selecionados */}
      {total > 0 && (
        <div className="flex flex-wrap gap-1">
          {[...selected].sort().map(ddd => (
            <button key={ddd} type="button" onClick={() => toggle(ddd)}
              className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
              {ddd} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formulário padrão de campanha ─────────────────────────────────
const EMPTY_FORM = {
  name: "", targetType: "all", manualNumber: "", selectedContactIds: [] as number[],
  aiModel: "deepseek", agentName: "Willian", ttsProvider: "elevenlabs", ttsVoiceId: "",
  filterDdd: "",
  windowMorningStart: 9, windowMorningEnd: 12,
  windowAfternoonStart: 13, windowAfternoonEnd: 16,
  windowDays: ["mon","tue","wed","thu"] as string[],
  maxConcurrentCalls: 3, maxAttempts: 2,
};

// ── Componente principal ──────────────────────────────────────────
export default function AdminDiscagem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [callFilter, setCallFilter] = useState("all");
  const [viewCall, setViewCall] = useState<CallRecord | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [showTestModal, setShowTestModal] = useState(false);
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"campanhas" | "relatorio">("campanhas");
  const [reportPeriod, setReportPeriod] = useState<"today" | "week" | "month" | "all">("week");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Queries ───────────────────────────────────────────────────────
  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ["discagem-campaigns"],
    queryFn: () => apiFetch("/admin/discagem/campaigns"),
    refetchInterval: 5000,
  });

  const { data: campaignStatus } = useQuery<CampaignStatus>({
    queryKey: ["discagem-status", selectedCampaignId],
    queryFn: () => apiFetch(`/admin/discagem/campaigns/${selectedCampaignId}/status`),
    enabled: !!selectedCampaignId,
    refetchInterval: 3000,
  });

  const { data: calls = [], refetch: refetchCalls } = useQuery<CallRecord[]>({
    queryKey: ["discagem-calls", selectedCampaignId, callFilter],
    queryFn: () => apiFetch(`/admin/discagem/campaigns/${selectedCampaignId}/calls?status=${callFilter}`),
    enabled: !!selectedCampaignId,
    refetchInterval: 5000,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["discagem-contacts"],
    queryFn: () => apiFetch("/admin/discagem/contacts"),
    staleTime: 30000,
  });

  interface ReportRow {
    phoneNumber: string;
    contactName: string | null;
    totalAttempts: number;
    answered: boolean;
    lastCallAt: string;
    lastStatus: string;
    totalDuration: number;
    campaignNames: string;
  }

  const { data: reportRows = [], isLoading: reportLoading, refetch: refetchReport } = useQuery<ReportRow[]>({
    queryKey: ["discagem-report", reportPeriod],
    queryFn: () => apiFetch(`/admin/discagem/report?period=${reportPeriod}`),
    enabled: activeTab === "relatorio",
    staleTime: 30000,
  });

  // ── Mutations ─────────────────────────────────────────────────────
  const createCampaign = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiFetch("/admin/discagem/campaigns", {
        method: "POST", body: JSON.stringify({
          ...data,
          targetContactIds: data.selectedContactIds.length > 0 ? data.selectedContactIds : undefined,
          windowDays: data.windowDays,
        }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] }); setShowForm(false); toast({ title: "Campanha criada!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCampaign = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_FORM> }) =>
      apiFetch(`/admin/discagem/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] }); setShowForm(false); setEditId(null); toast({ title: "Campanha atualizada!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/discagem/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] });
      if (selectedCampaignId === deleteId) setSelectedCampaignId(null);
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const startCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/discagem/campaigns/${id}/start`, { method: "POST" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] });
      setSelectedCampaignId(id);
      toast({ title: "Campanha iniciada!", description: "Os agentes de IA estão discando." });
    },
    onError: (e: Error) => toast({ title: "Erro ao iniciar", description: e.message, variant: "destructive" }),
  });

  const pauseCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/discagem/campaigns/${id}/pause`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] }); toast({ title: "Campanha pausada." }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resumeCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/discagem/campaigns/${id}/resume`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["discagem-campaigns"] }); toast({ title: "Campanha retomada!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const testCall = useMutation({
    mutationFn: () => apiFetch("/admin/discagem/test-call", { method: "POST", body: JSON.stringify({ phoneNumber: testNumber, aiModel: form.aiModel, agentName: form.agentName, ttsProvider: form.ttsProvider }) }),
    onSuccess: () => { setShowTestModal(false); toast({ title: "Ligação de teste disparada!", description: `Discando para ${testNumber}` }); },
    onError: (e: Error) => toast({ title: "Erro na ligação de teste", description: e.message, variant: "destructive" }),
  });

  // ── Formulário ────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(camp: Campaign) {
    setEditId(camp.id);
    setForm({
      name: camp.name,
      targetType: camp.targetType,
      manualNumber: camp.manualNumber ?? "",
      selectedContactIds: [],
      aiModel: camp.aiModel,
      agentName: (camp as any).agentName ?? "Willian",
      ttsProvider: camp.ttsProvider,
      ttsVoiceId: camp.ttsVoiceId ?? "",
      filterDdd: (camp as any).filterDdd ?? "",
      windowMorningStart: camp.windowMorningStart,
      windowMorningEnd: camp.windowMorningEnd,
      windowAfternoonStart: camp.windowAfternoonStart,
      windowAfternoonEnd: camp.windowAfternoonEnd,
      windowDays: parseDays(camp.windowDays),
      maxConcurrentCalls: camp.maxConcurrentCalls,
      maxAttempts: camp.maxAttempts,
    });
    setShowForm(true);
  }

  function submitForm() {
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (editId) {
      updateCampaign.mutate({ id: editId, data: form });
    } else {
      createCampaign.mutate(form);
    }
  }

  function toggleDay(day: string) {
    setForm(f => ({
      ...f,
      windowDays: f.windowDays.includes(day)
        ? f.windowDays.filter(d => d !== day)
        : [...f.windowDays, day],
    }));
  }

  // ── Transcript viewer ─────────────────────────────────────────────
  function parseTranscript(raw?: string | null): { role: string; text: string; ts: string }[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  // ── Alertas de crédito ────────────────────────────────────────────
  const creditErrors = campaigns.filter(c => c.status === "credit_error");

  // ── Campanha selecionada ──────────────────────────────────────────
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Discagem Automática — IA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agentes de IA autônomos fazem ligações outbound para seus contatos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTestModal(true)}>
            <PhoneIncoming className="h-4 w-4 mr-1" /> Ligar agora
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Nova campanha
          </Button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {([
          { key: "campanhas", label: "Campanhas", icon: <Bot className="h-4 w-4" /> },
          { key: "relatorio", label: "Relatório de contatos", icon: <TrendingUp className="h-4 w-4" /> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "campanhas" && <>
      {/* Alertas de crédito esgotado */}
      {creditErrors.map(c => (
        <div key={c.id} className="rounded-lg border border-orange-300 bg-orange-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-orange-800">Campanha pausada — crédito esgotado</p>
            <p className="text-sm text-orange-700 mt-0.5">
              <strong>{c.name}</strong> — API afetada: <strong>{c.pausedApi}</strong>
            </p>
            <p className="text-xs text-orange-600 mt-1">{c.pauseReason}</p>
          </div>
          <Button size="sm" variant="outline" className="border-orange-400 text-orange-700"
            onClick={() => resumeCampaign.mutate(c.id)}>
            <Play className="h-3 w-3 mr-1" /> Retomar
          </Button>
        </div>
      ))}

      {/* Lista de campanhas */}
      <div className="space-y-3">
        {campaigns.length === 0 && (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma campanha criada ainda.</p>
            <Button className="mt-3" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Criar primeira campanha</Button>
          </div>
        )}

        {campaigns.map(camp => (
          <div key={camp.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Cabeçalho da campanha */}
            <div className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">{camp.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[camp.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABELS[camp.status] ?? camp.status}
                  </span>
                  {camp.status === "running" && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      Ativo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{(camp as any).agentName ?? "Willian"}</span>
                  <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{camp.aiModel === "claude" ? "Claude" : camp.aiModel === "openai" ? "GPT" : "DeepSeek"}</span>
                  <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" />{camp.ttsProvider === "cartesia" ? "Cartesia" : "ElevenLabs"}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />
                    {camp.targetType === "all" ? "Todos" : camp.targetType === "clientes" ? "Clientes" : camp.targetType === "contadores" ? "Contadores" : camp.targetType === "manual_number" ? camp.manualNumber : "Selecionados"}
                    {(camp as any).filterDdd ? (() => {
                      const ddds = ((camp as any).filterDdd as string).split(",").filter(Boolean);
                      // Agrupa por estado para exibição compacta
                      const stateMap = new Map<string, string>();
                      for (const r of DDD_REGIONS) {
                        for (const s of r.states) {
                          for (const d of s.ddds) stateMap.set(d, s.uf);
                        }
                      }
                      const ufs = [...new Set(ddds.map(d => stateMap.get(d) ?? d))];
                      return (
                        <span className="ml-1 text-primary font-medium">
                          · DDD: {ufs.slice(0, 4).join(", ")}{ufs.length > 4 ? ` +${ufs.length - 4}` : ""}
                        </span>
                      );
                    })() : null}
                  </span>
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />
                    {camp.totalCalled} ligadas · {camp.totalAnswered} atendidas
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 shrink-0">
                {(camp.status === "draft" || camp.status === "paused") && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={startCampaign.isPending}
                    onClick={() => startCampaign.mutate(camp.id)}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {camp.status === "paused" ? "Retomar" : "Iniciar"}
                  </Button>
                )}
                {camp.status === "credit_error" && (
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700"
                    onClick={() => resumeCampaign.mutate(camp.id)}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Retomar
                  </Button>
                )}
                {camp.status === "running" && (
                  <Button size="sm" variant="outline"
                    onClick={() => pauseCampaign.mutate(camp.id)}>
                    <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(camp)}>Editar</Button>
                <Button size="sm" variant="ghost"
                  onClick={() => setSelectedCampaignId(selectedCampaignId === camp.id ? null : camp.id)}>
                  {selectedCampaignId === camp.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(camp.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Painel expandido da campanha */}
            {selectedCampaignId === camp.id && campaignStatus && (
              <div className="border-t bg-muted/20 p-4 space-y-4">
                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <StatCard icon={<Phone className="h-4 w-4 text-blue-500" />} label="Na fila" value={campaignStatus.totalQueued} />
                  <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Atendidas" value={campaignStatus.totalAnswered} />
                  <StatCard icon={<PhoneMissed className="h-4 w-4 text-yellow-500" />} label="Não atendeu" value={campaignStatus.totalNoAnswer} />
                  <StatCard icon={<Voicemail className="h-4 w-4 text-purple-500" />} label="Caixa postal" value={campaignStatus.totalVoicemail} />
                  <StatCard icon={<Ban className="h-4 w-4 text-orange-500" />} label="Opt-out" value={campaignStatus.totalOptout} />
                  <StatCard icon={<TrendingUp className="h-4 w-4 text-primary" />} label="Taxa atend." value={`${campaignStatus.answerRate}%`} />
                </div>

                {/* Ligações em andamento agora */}
                {campaignStatus.activeCalls.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                      <PhoneCall className="h-3.5 w-3.5" /> Em ligação agora ({campaignStatus.activeCalls.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {campaignStatus.activeCalls.map(ac => (
                        <div key={ac.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm">
                          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="font-medium">{ac.name ?? ac.phone}</span>
                          <span className="text-muted-foreground text-xs">{ac.phone}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de ligações */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Registros de Ligações</p>
                    <div className="flex gap-1">
                      {["all","queued","answered","no_answer","voicemail","failed","optout"].map(s => (
                        <button key={s}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${callFilter === s ? "bg-primary text-white border-primary" : "bg-background border-border hover:border-primary"}`}
                          onClick={() => setCallFilter(s)}>
                          {s === "all" ? "Todos" : CALL_STATUS_LABELS[s] ?? s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 pl-3 font-medium text-muted-foreground">Contato</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Duração</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Horário</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Tent.</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Call SID</th>
                          <th className="text-left p-2 pr-3 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calls.length === 0 && (
                          <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">Nenhuma ligação encontrada.</td></tr>
                        )}
                        {calls.map(call => (
                          <tr key={call.id} className="border-t hover:bg-muted/30 transition-colors">
                            <td className="p-2 pl-3 font-medium">{call.contactName ?? "—"}</td>
                            <td className="p-2 text-muted-foreground font-mono text-xs">{call.phoneNumber}</td>
                            <td className="p-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${CALL_STATUS_COLORS[call.status] ?? "bg-slate-100 text-slate-600"}`}>
                                {CALL_STATUS_LABELS[call.status] ?? call.status}
                              </span>
                            </td>
                            <td className="p-2 text-muted-foreground">{formatDuration(call.durationSeconds)}</td>
                            <td className="p-2 text-muted-foreground text-xs">{formatDate(call.startedAt)}</td>
                            <td className="p-2 text-center text-muted-foreground">{call.attemptNumber}</td>
                            <td className="p-2">
                              {call.twilioCallSid ? (
                                <a
                                  href={`https://console.twilio.com/us1/monitor/logs/calls/${call.twilioCallSid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs text-primary hover:underline"
                                  title={call.twilioCallSid}
                                >
                                  {call.twilioCallSid.slice(0, 12)}…
                                </a>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="p-2 pr-3">
                              {(call.transcript || call.recordingUrl) && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                  onClick={() => setViewCall(call)}>
                                  <FileText className="h-3.5 w-3.5 mr-1" /> Ver
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* fim aba campanhas */}
      </>}

      {/* ─── Aba: Relatório por contato ──────────────────────────────── */}
      {activeTab === "relatorio" && (
        <div className="space-y-4">
          {/* Filtro de período */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {([
                { key: "today", label: "Hoje" },
                { key: "week",  label: "7 dias" },
                { key: "month", label: "30 dias" },
                { key: "all",   label: "Tudo" },
              ] as const).map(p => (
                <button key={p.key} onClick={() => setReportPeriod(p.key)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    reportPeriod === p.key
                      ? "bg-background shadow text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchReport()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
            </Button>
          </div>

          {/* Resumo rápido */}
          {reportRows.length > 0 && (() => {
            const total = reportRows.length;
            const atendidas = reportRows.filter(r => r.answered).length;
            const naoAtendidas = total - atendidas;
            const totalTent = reportRows.reduce((s, r) => s + r.totalAttempts, 0);
            const pct = total > 0 ? Math.round((atendidas / total) * 100) : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Contatos únicos", value: total, icon: <Users className="h-4 w-4 text-primary" /> },
                  { label: "Atenderam", value: atendidas, icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
                  { label: "Não atenderam", value: naoAtendidas, icon: <PhoneMissed className="h-4 w-4 text-yellow-500" /> },
                  { label: "Taxa de atendimento", value: `${pct}%`, icon: <TrendingUp className="h-4 w-4 text-blue-500" /> },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                    {s.icon}
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="text-xl font-bold">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Tabela */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 pl-3 font-medium text-muted-foreground">Contato</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Telefone</th>
                  <th className="text-center p-2 font-medium text-muted-foreground">Atendeu?</th>
                  <th className="text-center p-2 font-medium text-muted-foreground">Tentativas</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Última ligação</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Duração total</th>
                  <th className="text-left p-2 pr-3 font-medium text-muted-foreground">Campanha</th>
                </tr>
              </thead>
              <tbody>
                {reportLoading && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Carregando relatório...
                  </td></tr>
                )}
                {!reportLoading && reportRows.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nenhuma ligação encontrada no período selecionado.
                  </td></tr>
                )}
                {reportRows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="p-2 pl-3 font-medium">{row.contactName ?? "—"}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{row.phoneNumber}</td>
                    <td className="p-2 text-center">
                      {row.answered
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Sim</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full"><PhoneMissed className="h-3 w-3" /> Não</span>
                      }
                    </td>
                    <td className="p-2 text-center">
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${row.totalAttempts >= 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-foreground"}`}>
                        {row.totalAttempts}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">{formatDate(row.lastCallAt)}</td>
                    <td className="p-2 text-muted-foreground">
                      {row.totalDuration > 0 ? formatDuration(row.totalDuration) : "—"}
                    </td>
                    <td className="p-2 pr-3 text-xs text-muted-foreground truncate max-w-[180px]" title={row.campaignNames}>
                      {row.campaignNames ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reportRows.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {reportRows.length} contato{reportRows.length !== 1 ? "s" : ""} · ordenado por data da última ligação
            </p>
          )}
        </div>
      )}

      {/* ─── Modal: Criar / Editar campanha ─────────────────────────── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Campanha" : "Nova Campanha de Discagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome da campanha</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Prospecção Contadores Agosto" />
            </div>

            <Separator />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Para quem ligar</p>

            <div className="space-y-1.5">
              <Label>Alvo</Label>
              <Select value={form.targetType} onValueChange={v => setForm(f => ({ ...f, targetType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os contatos ativos</SelectItem>
                  <SelectItem value="clientes">Clientes</SelectItem>
                  <SelectItem value="contadores">Contadores</SelectItem>
                  <SelectItem value="manual_number">Número avulso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.targetType === "manual_number" && (
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.manualNumber} onChange={e => setForm(f => ({ ...f, manualNumber: e.target.value }))} placeholder="+5511999990000" />
              </div>
            )}

            {/* Filtro por DDD — só exibe quando alvo não é número avulso */}
            {form.targetType !== "manual_number" && (
              <div className="space-y-2">
                <div>
                  <Label>Filtro por DDD <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Selecione os DDDs que essa campanha vai ligar. Deixe vazio para ligar para todos.</p>
                </div>
                <DddSelector
                  value={form.filterDdd}
                  onChange={v => setForm(f => ({ ...f, filterDdd: v }))}
                />
              </div>
            )}

            <Separator />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Agente e motor de IA</p>

            {/* Seletor de agente */}
            <div className="space-y-1.5">
              <Label>Agente (persona de voz)</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["Willian", "Aline"] as const).map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, agentName: name }))}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${form.agentName === name ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                  >
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {name === "Willian" ? "Voz masculina — formal" : "Voz feminina — formal"}
                    </p>
                    {form.agentName === name && <p className="text-xs text-primary mt-1 font-medium">● Selecionado</p>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">A voz TTS será ajustada automaticamente para o agente. Você pode sobrescrever pelo Voice ID abaixo.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Modelo de IA</Label>
                <Select value={form.aiModel} onValueChange={v => setForm(f => ({ ...f, aiModel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek">DeepSeek — econômico</SelectItem>
                    <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                    <SelectItem value="openai">GPT (OpenAI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Provedor de voz (TTS)</Label>
                <Select value={form.ttsProvider} onValueChange={v => setForm(f => ({ ...f, ttsProvider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartesia">Cartesia</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Voice ID (opcional — sobrescreve o padrão do agente)</Label>
              <Input value={form.ttsVoiceId} onChange={e => setForm(f => ({ ...f, ttsVoiceId: e.target.value }))} placeholder={form.ttsProvider === "cartesia" ? "ID Cartesia — deixe vazio para usar o padrão" : "ID ElevenLabs — deixe vazio para usar o padrão"} />
            </div>

            <Separator />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Janela de horário</p>

            <div>
              <Label className="text-sm mb-2 block">Dias da semana</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS_OPTIONS.map(d => (
                  <button key={d.value} type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${form.windowDays.includes(d.value) ? "bg-primary text-white border-primary" : "bg-background border-border hover:border-primary"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Manhã: início (hora)</Label>
                <Input type="number" min={0} max={23} value={form.windowMorningStart}
                  onChange={e => setForm(f => ({ ...f, windowMorningStart: parseInt(e.target.value) || 9 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Manhã: fim (hora)</Label>
                <Input type="number" min={0} max={23} value={form.windowMorningEnd}
                  onChange={e => setForm(f => ({ ...f, windowMorningEnd: parseInt(e.target.value) || 12 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tarde: início (hora)</Label>
                <Input type="number" min={0} max={23} value={form.windowAfternoonStart}
                  onChange={e => setForm(f => ({ ...f, windowAfternoonStart: parseInt(e.target.value) || 13 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tarde: fim (hora)</Label>
                <Input type="number" min={0} max={23} value={form.windowAfternoonEnd}
                  onChange={e => setForm(f => ({ ...f, windowAfternoonEnd: parseInt(e.target.value) || 16 }))} />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Limites</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ligações simultâneas</Label>
                <Input type="number" min={1} max={10} value={form.maxConcurrentCalls}
                  onChange={e => setForm(f => ({ ...f, maxConcurrentCalls: parseInt(e.target.value) || 3 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tentativas por contato</Label>
                <Input type="number" min={1} max={5} value={form.maxAttempts}
                  onChange={e => setForm(f => ({ ...f, maxAttempts: parseInt(e.target.value) || 2 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</Button>
            <Button onClick={submitForm} disabled={createCampaign.isPending || updateCampaign.isPending}>
              {(createCampaign.isPending || updateCampaign.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editId ? "Salvar" : "Criar campanha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Ligar agora (teste) ──────────────────────────────── */}
      <Dialog open={showTestModal} onOpenChange={setShowTestModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Ligar agora</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Número de destino</Label>
              <Input value={testNumber} onChange={e => setTestNumber(e.target.value)} placeholder="+5511999990000" />
            </div>
            <p className="text-xs text-muted-foreground">
              Usa as configurações padrão de IA/TTS. Ideal para testar o agente antes de iniciar uma campanha.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestModal(false)}>Cancelar</Button>
            <Button onClick={() => testCall.mutate()} disabled={!testNumber || testCall.isPending}>
              {testCall.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Phone className="h-4 w-4 mr-1" />}
              Discar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Transcript + Gravação ───────────────────────────── */}
      {viewCall && (
        <Dialog open onOpenChange={() => setViewCall(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Ligação — {viewCall.contactName ?? viewCall.phoneNumber}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${CALL_STATUS_COLORS[viewCall.status] ?? ""}`}>
                  {CALL_STATUS_LABELS[viewCall.status] ?? viewCall.status}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Gravação */}
              {viewCall.recordingUrl && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Gravação</p>
                  <audio controls className="w-full" src={viewCall.recordingUrl} />
                </div>
              )}

              {/* E-mail de follow-up */}
              {viewCall.wantsFollowupEmail && viewCall.contactEmail && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-0.5">E-mail de follow-up</p>
                    <p className="text-sm font-medium text-blue-900">{viewCall.contactEmail}</p>
                    {viewCall.followupEmailSentAt && (
                      <p className="text-xs text-blue-600 mt-0.5">✓ Enviado em {formatDate(viewCall.followupEmailSentAt)}</p>
                    )}
                  </div>
                  {!viewCall.followupEmailSentAt && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                      onClick={async () => {
                        try {
                          await apiFetch(`/admin/discagem/calls/${viewCall.id}/send-email`, { method: "POST" });
                          toast({ title: "E-mail enviado!", description: `Material enviado para ${viewCall.contactEmail}` });
                          setViewCall(v => v ? { ...v, followupEmailSentAt: new Date().toISOString() } : v);
                          queryClient.invalidateQueries({ queryKey: ["discagem-calls"] });
                        } catch (e: any) {
                          toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
                        }
                      }}>
                      <Mail className="h-3.5 w-3.5 mr-1" /> Enviar e-mail
                    </Button>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Duração</p><p className="font-medium">{formatDuration(viewCall.durationSeconds)}</p></div>
                <div><p className="text-xs text-muted-foreground">Início</p><p className="font-medium">{formatDate(viewCall.startedAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">IA usada</p><p className="font-medium">{viewCall.aiModelUsed ?? "—"}</p></div>
              </div>
              {viewCall.twilioCallSid && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Call SID (Twilio)</p>
                    <p className="font-mono text-xs text-foreground">{viewCall.twilioCallSid}</p>
                  </div>
                  <a
                    href={`https://console.twilio.com/us1/monitor/logs/calls/${viewCall.twilioCallSid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    Ver no Twilio ↗
                  </a>
                </div>
              )}

              {/* Transcript */}
              {viewCall.transcript && (
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Transcrição</p>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {parseTranscript(viewCall.transcript).map((turn, i) => (
                      <div key={i} className={`flex ${turn.role === "assistant" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${turn.role === "assistant" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">
                            {turn.role === "assistant" ? "🤖 Agente" : "👤 Contato"}
                          </p>
                          {turn.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewCall.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  <strong>Erro:</strong> {viewCall.error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewCall(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Confirma exclusão ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os registros de ligações desta campanha também serão excluídos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteId && deleteCampaign.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3 flex items-center gap-2.5">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-foreground text-sm">{value}</p>
      </div>
    </div>
  );
}
