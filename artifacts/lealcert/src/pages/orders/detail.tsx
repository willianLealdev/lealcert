import { useParams } from "wouter";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  useGetOrder,
  useUpdateOrder,
  useCreatePayment,
  useGarComprarOrder,
  useSyncGarOrder,
  useSyncProviderOrder,
  useSyncPaymentOrder,
  useGetOrderGarLocais,
  useGetOrderGarDisponibilidade,
  useGarCancelarAgendamento,
  useGarCancelarProtocolo,
  useAgendarOrder,
  useAgendarSafewebOrder,
  useCancelarSafewebOrder,
  useGetSafewebLocais,
  useGetSafewebSlots,
  getGetSafewebSlotsQueryKey,
  useGetSafewebConfig,
  getGetSafewebConfigQueryKey,
  useGetOrderEvents,
  useHopeCreateSolicitation,
  useApprovePaymentManual,
  useTriggerProtocolManual,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, QrCode, Loader2, FileText, Download, RefreshCw,
  ShoppingBag, CheckCircle2, Calendar, MapPin, Video, Clock, ChevronRight, Check,
  Activity, QrCode as PayIcon, Package, Shield, AlertCircle, Tag, Copy, Ban, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect, useRef } from "react";

type PixData = { paymentId: string; pixQrCode: string; pixQrCodeBase64: string };

const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pago",
  protocol_assigned: "Protocolo Atribuído",
  aguardando_validacao: "Aguardando Validação",
  emitido: "Emitido",
  revogado: "Revogado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  created: "secondary",
  pending_payment: "outline",
  paid: "default",
  protocol_assigned: "default",
  aguardando_validacao: "default",
  emitido: "default",
  revogado: "destructive",
  completed: "default",
  cancelled: "destructive",
};

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatDateTime(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-words">{value || "—"}</span>
    </div>
  );
}

// ── Timeline de Eventos ───────────────────────────────────────────────────────
const EVENT_ICONS: Record<string, React.ReactNode> = {
  order_created:        <Package className="h-4 w-4 text-primary" />,
  payment_initiated:    <PayIcon className="h-4 w-4 text-amber-500" />,
  payment_confirmed:    <CheckCircle2 className="h-4 w-4 text-green-600" />,
  gar_sale_registered:  <ShoppingBag className="h-4 w-4 text-blue-600" />,
  gar_protocol_emitted: <Tag className="h-4 w-4 text-blue-600" />,
  scheduling_confirmed: <Calendar className="h-4 w-4 text-green-600" />,
  gar_status_updated:   <RefreshCw className="h-4 w-4 text-muted-foreground" />,
  certificate_emitted:  <Shield className="h-4 w-4 text-green-600" />,
  order_completed:      <CheckCircle2 className="h-4 w-4 text-green-700" />,
  order_cancelled:      <AlertCircle className="h-4 w-4 text-destructive" />,
  status_updated:       <Activity className="h-4 w-4" />,
  admin_action:         <Activity className="h-4 w-4 text-violet-500" />,
  sync_performed:       <RefreshCw className="h-4 w-4 text-muted-foreground" />,
};

const EVENT_LABELS: Record<string, string> = {
  order_created:        "Pedido Criado",
  payment_initiated:    "Pagamento Iniciado",
  payment_confirmed:    "Pagamento Confirmado",
  gar_sale_registered:  "Registro no Provedor",
  gar_protocol_emitted: "Protocolo Emitido",
  scheduling_confirmed: "Atendimento Agendado",
  gar_status_updated:   "Status Atualizado",
  certificate_emitted:  "Certificado Emitido",
  order_completed:      "Pedido Concluído",
  order_cancelled:      "Pedido Cancelado",
  status_updated:       "Status Alterado",
  admin_action:         "Ação do Administrador",
  sync_performed:       "Sincronização",
};

function OrderTimeline({ orderId, onEventsChange }: { orderId: number; onEventsChange?: () => void }) {
  const { data: events, isLoading, refetch: refetchEvents } = useGetOrderEvents(orderId);

  // Polling sempre ativo a cada 5 s (independente do status)
  useEffect(() => {
    const timer = setInterval(() => { void refetchEvents(); }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Avisa o pai quando o número de eventos muda (novo evento registrado)
  const prevCountRef = useRef<number>(0);
  useEffect(() => {
    if (!events) return;
    if (events.length !== prevCountRef.current) {
      if (prevCountRef.current > 0) onEventsChange?.();
      prevCountRef.current = events.length;
    }
  }, [events?.length]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Histórico</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div></CardContent>
      </Card>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Histórico</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Histórico do Pedido
          <Badge variant="secondary" className="ml-auto text-xs">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {events.map((ev, i) => {
            const icon = EVENT_ICONS[ev.type] ?? <Activity className="h-4 w-4" />;
            const isLast = i === events.length - 1;
            return (
              <div key={ev.id} className="flex gap-3 px-4 py-2.5 group hover:bg-muted/40 transition-colors">
                <div className="flex flex-col items-center">
                  <div className="rounded-full bg-muted border p-1.5 mt-0.5 shrink-0">
                    {icon}
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">
                    {EVENT_LABELS[ev.type] ?? ev.type}
                  </p>
                  <p className="text-xs font-medium leading-snug mt-0.5">{ev.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(ev.createdAt))}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Componente de Agendamento ─────────────────────────────────────────────────
function SchedulingCard({ orderId, garProtocolo, garAgendamentoDataHora, garAgendamentoLocalNome, garAgendamentoLink, garHopeUploadUrl, onSuccess }: {
  orderId: number;
  garProtocolo: string;
  garAgendamentoDataHora?: string;
  garAgendamentoLocalNome?: string;
  garAgendamentoLink?: string;
  garHopeUploadUrl?: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [docsConfirmed, setDocsConfirmed] = useState(() => {
    try { return localStorage.getItem(`gar_docs_submitted_${orderId}`) === "1"; } catch { return false; }
  });
  const [step, setStep] = useState<"locais" | "data" | "confirm">("locais");
  const [ufFiltro, setUfFiltro] = useState("");
  const [municipioFiltro, setMunicipioFiltro] = useState("");
  const [localSelecionado, setLocalSelecionado] = useState<{ HashLocal: string; NomeLocalAgendamento: string; NomeCidadeLocalAgendamento?: string; UF: string; Endereco?: string; isVideo: boolean } | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState("");
  const [horarioSelecionado, setHorarioSelecionado] = useState<{ HoraInicial: string; HoraFinal: string } | null>(null);

  const { data: locais, isLoading: loadingLocais } = useGetOrderGarLocais(orderId);
  const { data: disponibilidade, isLoading: loadingDisponibilidade } = useGetOrderGarDisponibilidade(
    orderId,
    {
      hashLocal: localSelecionado?.HashLocal ?? "",
      dataInicial: dataSelecionada ? `${dataSelecionada} 00:00` : "",
      dataFinal: dataSelecionada ? `${dataSelecionada} 23:59` : "",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!localSelecionado && !!dataSelecionada && step === "data" } as any }
  );

  const horarios = useMemo((): Array<{ HoraInicial: string; HoraFinal: string }> => {
    const datas = disponibilidade?.Datas ?? [];
    if (!datas.length) return [];
    const toValid = (h: { HoraInicial?: string; HoraFinal?: string }): { HoraInicial: string; HoraFinal: string } | null =>
      h.HoraInicial && h.HoraFinal ? { HoraInicial: h.HoraInicial, HoraFinal: h.HoraFinal } : null;
    for (const d of datas) {
      if (d.DataAgenda?.startsWith(dataSelecionada)) {
        return (d.Horarios ?? []).map(toValid).filter((h): h is { HoraInicial: string; HoraFinal: string } => h !== null);
      }
    }
    return (datas[0]?.Horarios ?? []).map(toValid).filter((h): h is { HoraInicial: string; HoraFinal: string } => h !== null);
  }, [disponibilidade, dataSelecionada]);

  const cancelarAgendamento = useGarCancelarAgendamento({
    mutation: {
      onSuccess: (data) => {
        if (data?.warning) {
          toast({
            title: "Agendamento removido do sistema",
            description: data.warning,
            variant: "destructive",
            duration: 10000,
          });
        } else {
          toast({ title: "Agendamento cancelado com sucesso." });
        }
        onSuccess();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao cancelar.";
        toast({ title: "Erro ao cancelar agendamento", description: msg, variant: "destructive" });
      },
    },
  });

  const agendar = useAgendarOrder({
    mutation: {
      onSuccess: (data) => {
        setOpen(false);
        toast({
          title: "Agendamento confirmado!",
          description: `${data.localNome} — ${data.dataHora}. Um e-mail foi enviado com os detalhes.`,
        });
        onSuccess();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao agendar.";
        toast({ title: "Erro no agendamento", description: msg, variant: "destructive" });
      },
    },
  });

  const isVideo = (nome: string) => /video/i.test(nome) || /videoconfer/i.test(nome);

  const locaisFiltrados = useMemo(() => {
    if (!locais) return [];
    return locais.filter(l => {
      const ufOk = !ufFiltro || l.UF?.toLowerCase() === ufFiltro.toLowerCase();
      const munOk = !municipioFiltro || l.NomeCidadeLocalAgendamento?.toLowerCase().includes(municipioFiltro.toLowerCase());
      return ufOk && munOk;
    });
  }, [locais, ufFiltro, municipioFiltro]);

  const ufsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (locais ?? []).forEach(l => { if (l.UF) set.add(l.UF); });
    return Array.from(set).sort();
  }, [locais]);

  function handleOpenModal() {
    setStep("locais");
    setLocalSelecionado(null);
    setDataSelecionada("");
    setHorarioSelecionado(null);
    setUfFiltro("");
    setMunicipioFiltro("");
    setOpen(true);
  }

  function handleSelecionarLocal(l: typeof locaisFiltrados[0]) {
    setLocalSelecionado({
      HashLocal: l.HashLocal,
      NomeLocalAgendamento: l.NomeLocalAgendamento,
      NomeCidadeLocalAgendamento: l.NomeCidadeLocalAgendamento,
      UF: l.UF ?? "",
      Endereco: l.Endereco,
      isVideo: isVideo(l.NomeLocalAgendamento),
    });
    setDataSelecionada("");
    setHorarioSelecionado(null);
    setStep("data");
  }

  function handleSelecionarHorario(h: { HoraInicial: string; HoraFinal: string }) {
    setHorarioSelecionado(h);
    setStep("confirm");
  }

  function handleConfirmar() {
    if (!localSelecionado || !dataSelecionada || !horarioSelecionado) return;
    agendar.mutate({
      id: orderId,
      data: {
        hashLocal: localSelecionado.HashLocal,
        localNome: localSelecionado.NomeLocalAgendamento,
        dataInicial: `${dataSelecionada} ${horarioSelecionado.HoraInicial}`,
        dataFinal: `${dataSelecionada} ${horarioSelecionado.HoraFinal}`,
      },
    });
  }

  function handleDocsConfirmar() {
    try { localStorage.setItem(`gar_docs_submitted_${orderId}`, "1"); } catch { /* ignore */ }
    setDocsConfirmed(true);
    setDocsModalOpen(false);
  }

  // Gate: se existe URL do Hope e docs ainda não confirmados, exibe step de envio de documentos
  if (garHopeUploadUrl && !docsConfirmed) {
    return (
      <>
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <FileText className="h-5 w-5" />
              Envio de Documentos Obrigatório
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-amber-800">
              Antes de agendar seu atendimento, você precisa enviar os documentos solicitados pelo portal de documentação.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={() => setDocsModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Enviar Documentos
              </Button>
              <Button variant="outline" className="border-green-400 text-green-800 hover:bg-green-50" onClick={handleDocsConfirmar}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Já enviei os documentos
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={docsModalOpen} onOpenChange={setDocsModalOpen}>
          <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between">
              <DialogTitle className="text-base">Portal de Envio de Documentos</DialogTitle>
              <a
                href={garHopeUploadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Abrir em nova aba"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir em nova aba
              </a>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <iframe
                src={garHopeUploadUrl}
                className="w-full h-full border-0"
                title="Portal de Envio de Documentos"
                allow="camera; microphone"
              />
            </div>
            <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between gap-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Após enviar todos os documentos no portal acima, clique em "Concluir Envio".
              </p>
              <Button onClick={handleDocsConfirmar} className="shrink-0">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Concluir Envio
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Já agendado — mostrar card de confirmação
  if (garAgendamentoDataHora) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Check className="h-5 w-5" />
            Atendimento Agendado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {garAgendamentoLocalNome && (
              <div className="flex items-start gap-2">
                {isVideo(garAgendamentoLocalNome)
                  ? <Video className="h-4 w-4 mt-0.5 text-green-700 shrink-0" />
                  : <MapPin className="h-4 w-4 mt-0.5 text-green-700 shrink-0" />}
                <div>
                  <p className="text-xs text-green-700">Local</p>
                  <p className="text-sm font-semibold text-green-900">{garAgendamentoLocalNome}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-green-700 shrink-0" />
              <div>
                <p className="text-xs text-green-700">Data e hora</p>
                <p className="text-sm font-semibold text-green-900">{garAgendamentoDataHora}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-green-700">
            Um e-mail de confirmação foi enviado com os detalhes do atendimento.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="border-green-400 text-green-800 hover:bg-green-100" onClick={handleOpenModal}>
              <Calendar className="h-4 w-4 mr-2" />
              Reagendar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50" disabled={cancelarAgendamento.isPending}>
                  {cancelarAgendamento.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                  Cancelar Agendamento
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá cancelar o agendamento na Gestão AR. Você poderá reagendar depois.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => cancelarAgendamento.mutate({ id: orderId })}
                  >
                    Confirmar Cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>

        <GarSchedulingDialog
          open={open}
          onOpenChange={setOpen}
          step={step}
          setStep={setStep}
          locais={locaisFiltrados}
          loadingLocais={loadingLocais}
          ufsDisponiveis={ufsDisponiveis}
          ufFiltro={ufFiltro}
          setUfFiltro={setUfFiltro}
          municipioFiltro={municipioFiltro}
          setMunicipioFiltro={setMunicipioFiltro}
          localSelecionado={localSelecionado}
          dataSelecionada={dataSelecionada}
          setDataSelecionada={(v) => { setDataSelecionada(v); setHorarioSelecionado(null); }}
          horarios={horarios}
          loadingDisponibilidade={loadingDisponibilidade}
          horarioSelecionado={horarioSelecionado}
          onSelecionarLocal={handleSelecionarLocal}
          onSelecionarHorario={handleSelecionarHorario}
          onConfirmar={handleConfirmar}
          isPending={agendar.isPending}
          isVideo={isVideo}
        />
      </Card>
    );
  }

  // Protocolo emitido mas sem agendamento — convidar para agendar
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <Calendar className="h-5 w-5" />
          Agendar Atendimento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-blue-800">
          Seu protocolo foi emitido! Agora é só escolher o local e horário mais convenientes para você.
        </p>
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-100 px-3 py-2 rounded-md">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>Escolha o local e horário de atendimento mais conveniente para você.</span>
        </div>
        <Button onClick={handleOpenModal} className="w-full sm:w-auto">
          <Calendar className="h-4 w-4 mr-2" />
          Escolher data e horário
        </Button>
      </CardContent>

      <GarSchedulingDialog
        open={open}
        onOpenChange={setOpen}
        step={step}
        setStep={setStep}
        locais={locaisFiltrados}
        loadingLocais={loadingLocais}
        ufsDisponiveis={ufsDisponiveis}
        ufFiltro={ufFiltro}
        setUfFiltro={setUfFiltro}
        municipioFiltro={municipioFiltro}
        setMunicipioFiltro={setMunicipioFiltro}
        localSelecionado={localSelecionado}
        dataSelecionada={dataSelecionada}
        setDataSelecionada={(v) => { setDataSelecionada(v); setHorarioSelecionado(null); }}
        horarios={horarios}
        loadingDisponibilidade={loadingDisponibilidade}
        horarioSelecionado={horarioSelecionado}
        onSelecionarLocal={handleSelecionarLocal}
        onSelecionarHorario={handleSelecionarHorario}
        onConfirmar={handleConfirmar}
        isPending={agendar.isPending}
        isVideo={isVideo}
      />
    </Card>
  );
}

// ── Modal de Agendamento (GAR) ────────────────────────────────────────────────
type Local = {
  HashLocal: string;
  NomeLocalAgendamento: string;
  NomeCidadeLocalAgendamento?: string;
  UF?: string;
  Endereco?: string;
  isVideo: boolean;
};

function GarSchedulingDialog({
  open, onOpenChange, step, setStep,
  locais, loadingLocais, ufsDisponiveis,
  ufFiltro, setUfFiltro, municipioFiltro, setMunicipioFiltro,
  localSelecionado,
  dataSelecionada, setDataSelecionada,
  horarios, loadingDisponibilidade, horarioSelecionado,
  onSelecionarLocal, onSelecionarHorario, onConfirmar, isPending, isVideo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  step: "locais" | "data" | "confirm";
  setStep: (s: "locais" | "data" | "confirm") => void;
  locais: Array<{ HashLocal: string; NomeLocalAgendamento: string; NomeCidadeLocalAgendamento?: string; UF?: string; Endereco?: string }>;
  loadingLocais: boolean;
  ufsDisponiveis: string[];
  ufFiltro: string;
  setUfFiltro: (v: string) => void;
  municipioFiltro: string;
  setMunicipioFiltro: (v: string) => void;
  localSelecionado: Local | null;
  dataSelecionada: string;
  setDataSelecionada: (v: string) => void;
  horarios: Array<{ HoraInicial: string; HoraFinal: string }>;
  loadingDisponibilidade: boolean;
  horarioSelecionado: { HoraInicial: string; HoraFinal: string } | null;
  onSelecionarLocal: (l: typeof locais[0]) => void;
  onSelecionarHorario: (h: { HoraInicial: string; HoraFinal: string }) => void;
  onConfirmar: () => void;
  isPending: boolean;
  isVideo: (nome: string) => boolean;
}) {
  const stepTitle: Record<string, string> = {
    locais: "1 — Escolha o local de atendimento",
    data: "2 — Escolha a data e horário",
    confirm: "3 — Confirmar agendamento",
  };
  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendamento — {stepTitle[step]}
          </DialogTitle>
        </DialogHeader>

        {/* Breadcrumb de passos */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(["locais", "data", "confirm"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={step === s ? "text-primary font-semibold" : ""}>
                {i + 1}. {s === "locais" ? "Local" : s === "data" ? "Data e Hora" : "Confirmar"}
              </span>
            </span>
          ))}
        </div>

          {/* PASSO 1 — Escolher local */}
          {step === "locais" && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Select value={ufFiltro || "__all__"} onValueChange={v => setUfFiltro(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {ufsDisponiveis.map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Filtrar por cidade..."
                  value={municipioFiltro}
                  onChange={e => setMunicipioFiltro(e.target.value)}
                  className="flex-1 min-w-40"
                />
              </div>
              {loadingLocais ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Buscando locais disponíveis...
                </div>
              ) : locais.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum local encontrado com esse filtro.
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {locais.map((local) => {
                    const video = isVideo(local.NomeLocalAgendamento);
                    return (
                      <button
                        key={local.HashLocal}
                        className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary ${video ? "border-blue-200 bg-blue-50 hover:bg-blue-100" : "bg-background hover:bg-muted"}`}
                        onClick={() => onSelecionarLocal(local)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 rounded-full p-1.5 ${video ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                            {video ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{local.NomeLocalAgendamento}</p>
                              {video && (
                                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
                                  Videoconferência
                                </Badge>
                              )}
                            </div>
                            {(local.NomeCidadeLocalAgendamento || local.UF) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[local.NomeCidadeLocalAgendamento, local.UF].filter(Boolean).join(" — ")}
                              </p>
                            )}
                            {local.Endereco && !video && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{local.Endereco}</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PASSO 2 — Escolher data e horário */}
          {step === "data" && (
            <div className="space-y-3">
              {localSelecionado && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${localSelecionado.isVideo ? "bg-blue-50 text-blue-800" : "bg-muted"}`}>
                  {localSelecionado.isVideo
                    ? <Video className="h-4 w-4 shrink-0" />
                    : <MapPin className="h-4 w-4 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{localSelecionado.NomeLocalAgendamento}</p>
                    {localSelecionado.NomeCidadeLocalAgendamento && (
                      <p className="text-xs opacity-70">{localSelecionado.NomeCidadeLocalAgendamento} — {localSelecionado.UF}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setStep("locais")}>
                    Trocar
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Label className="text-sm shrink-0 font-medium">Data</Label>
                <Input
                  type="date"
                  value={dataSelecionada}
                  onChange={e => setDataSelecionada(e.target.value)}
                  min={today}
                  className="flex-1 max-w-xs"
                />
              </div>

              {dataSelecionada && (
                loadingDisponibilidade ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Buscando horários disponíveis...
                  </div>
                ) : horarios.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum horário disponível para esta data. Tente outra data.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pb-1">
                    {horarios.map((h) => (
                      <button
                        key={`${h.HoraInicial}-${h.HoraFinal}`}
                        className={`rounded-lg border p-3 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                          horarioSelecionado?.HoraInicial === h.HoraInicial
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => onSelecionarHorario(h)}
                      >
                        <Clock className="h-4 w-4 text-primary mx-auto mb-1" />
                        <p className="text-sm font-semibold">{h.HoraInicial}</p>
                        {h.HoraFinal && <p className="text-xs text-muted-foreground">até {h.HoraFinal}</p>}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* PASSO 3 — Confirmar */}
          {step === "confirm" && localSelecionado && dataSelecionada && horarioSelecionado && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {localSelecionado.isVideo
                    ? <Video className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    : <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-xs text-muted-foreground">Local</p>
                    <p className="font-semibold">{localSelecionado.NomeLocalAgendamento}</p>
                    {localSelecionado.NomeCidadeLocalAgendamento && (
                      <p className="text-sm text-muted-foreground">{localSelecionado.NomeCidadeLocalAgendamento} — {localSelecionado.UF}</p>
                    )}
                    {localSelecionado.Endereco && !localSelecionado.isVideo && (
                      <p className="text-sm text-muted-foreground">{localSelecionado.Endereco}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Data e horário</p>
                    <p className="font-semibold">
                      {new Date(dataSelecionada + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" — "}{horarioSelecionado.HoraInicial}
                      {horarioSelecionado.HoraFinal ? ` – ${horarioSelecionado.HoraFinal}` : ""}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <strong>Importante:</strong> apresente documento de identificação original (RG ou CNH). Compareça com 10 minutos de antecedência.
              </div>
              <p className="text-sm text-muted-foreground">
                Após confirmar, um atendente entrará em contato pelo número cadastrado no sistema para iniciar o atendimento.
              </p>
            </div>
          )}

        <DialogFooter className="gap-2">
          {step !== "locais" && (
            <Button
              variant="outline"
              onClick={() => setStep(step === "confirm" ? "data" : "locais")}
              disabled={isPending}
            >
              Voltar
            </Button>
          )}
          {step === "confirm" && (
            <Button onClick={onConfirmar} disabled={isPending} className="min-w-40">
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirmando...</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar Agendamento</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── LocaisAndDateDialogBody — busca locais Safeweb e permite escolha + data ───
type SwLocalItem = {
  id: number;
  titulo: string;
  cnpj?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  uf?: string;
  cep?: string;
  tiposAtendimento?: string[];
  rawData?: Record<string, unknown>;
};
type AgendarSelection = { idLocal: number; localNome: string; data: string; horarioInicio: string; horarioFim?: string };

// Converte Date → "YYYY-MM-DD" no fuso local
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Converte dia Safeweb (ISO: 1=Seg…7=Dom) para JS getDay() (0=Dom…6=Sáb)
function swDiaToJs(d: number): number { return d === 7 ? 0 : d; }

function LocaisAndDateDialogBody({ orderId, onSelect }: {
  orderId: number;
  onSelect: (sel: AgendarSelection | null) => void;
}) {
  const { data: locaisData, isLoading: locaisLoading, isError: locaisError, refetch: refetchLocais } = useGetSafewebLocais(orderId);
  const locais: SwLocalItem[] = (locaisData?.locais ?? []) as SwLocalItem[];

  const [selectedLocal, setSelectedLocal] = useState<SwLocalItem | null>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<{ horarioInicio: string; horarioFim?: string } | null>(null);

  // 1. Verifica se o local tem agenda configurada (existeAgendaConfigurada)
  const configParams = { idLocal: selectedLocal?.id ?? 0 };
  const { data: configData, isLoading: configLoading, isError: configError } = useGetSafewebConfig(
    orderId,
    configParams,
    { query: { queryKey: getGetSafewebConfigQueryKey(orderId, configParams), enabled: !!selectedLocal } },
  );
  const temAgendaConfigurada = configData?.existeAgendaConfigurada ?? false;

  // 2. Busca horários de uma data específica (só após escolher data)
  const slotsParams = selectedLocal && selectedDate
    ? { idLocal: selectedLocal.id, date: selectedDate }
    : { idLocal: 0 };
  const { data: slotsData, isLoading: slotsLoading, isError: slotsError, refetch: refetchSlots } = useGetSafewebSlots(
    orderId,
    slotsParams,
    { query: { queryKey: getGetSafewebSlotsQueryKey(orderId, slotsParams), enabled: !!selectedLocal && !!selectedDate } },
  );
  const slots = slotsData?.slots ?? [];

  // Limpa slot e data quando troca de local
  useEffect(() => {
    setSelectedSlot(null);
    setSelectedDate("");
    setCalendarDate(undefined);
    onSelect(null);
  }, [selectedLocal]);

  // Limpa slot quando troca de data
  useEffect(() => {
    setSelectedSlot(null);
    onSelect(null);
  }, [selectedDate]);

  useEffect(() => {
    if (selectedLocal && selectedSlot && selectedDate) {
      onSelect({ idLocal: selectedLocal.id, localNome: selectedLocal.titulo, data: selectedDate, horarioInicio: selectedSlot.horarioInicio, horarioFim: selectedSlot.horarioFim });
    }
  }, [selectedSlot]);

  if (locaisLoading) return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Buscando locais de atendimento...</span>
    </div>
  );

  if (locaisError) return (
    <div className="space-y-3 text-center py-6">
      <p className="text-sm text-destructive">Não foi possível carregar os locais de atendimento.</p>
      <Button variant="outline" size="sm" onClick={() => refetchLocais()}>Tentar novamente</Button>
    </div>
  );

  if (locais.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">Nenhum local de atendimento disponível</p>
          <p className="text-xs text-muted-foreground mt-1">
            O portal da Safeweb não retornou pontos de atendimento para esta solicitação.<br />
            Entre em contato com a Safeweb ou tente novamente mais tarde.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchLocais()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-1">
      {/* Passo 1: Escolher local */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          1. Escolha o local de atendimento
        </p>
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {locais.map((l) => {
            const isSelected = selectedLocal?.id === l.id;
            const tipos = l.tiposAtendimento ?? [];
            const enderecoCompleto = [l.endereco, l.bairro].filter(Boolean).join(", ");
            const localidade = [l.cidade, l.uf].filter(Boolean).join(" — ");
            return (
              <button
                key={l.id}
                onClick={() => setSelectedLocal(l)}
                className={[
                  "w-full rounded-lg border p-3 text-left text-sm transition-all",
                  isSelected
                    ? "border-primary bg-primary/10 ring-2 ring-primary"
                    : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-tight">{l.titulo}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">ID {l.id}</span>
                </div>
                {enderecoCompleto && <p className="text-xs text-muted-foreground mt-0.5">{enderecoCompleto}</p>}
                {localidade && <p className="text-xs text-muted-foreground">{localidade}{l.cep ? ` · CEP ${l.cep}` : ""}</p>}
                {tipos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tipos.map((t) => (
                      <span key={t} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Passo 2: Calendário — aparece após confirmar que o local tem agenda configurada */}
      {selectedLocal && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            2. Escolha a data
          </p>

          {/* Verificando configuração do local */}
          {configLoading && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando disponibilidade do local...
            </div>
          )}

          {!configLoading && (configError || !temAgendaConfigurada) && (
            <div className="flex flex-col items-center gap-2 py-4 text-center rounded-lg border border-dashed bg-muted/30">
              <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium">Agenda não configurada</p>
              <p className="text-xs text-muted-foreground">
                Este local não possui agenda de atendimento configurada no sistema Safeweb.
              </p>
            </div>
          )}

          {/* Local tem agenda — exibe calendário para o usuário escolher a data */}
          {!configLoading && temAgendaConfigurada && (
            <>
              <div className="flex justify-center rounded-lg border bg-card p-2">
                <CalendarPicker
                  mode="single"
                  selected={calendarDate}
                  onSelect={(d) => {
                    if (!d) return;
                    d.setHours(0, 0, 0, 0);
                    setCalendarDate(d);
                    setSelectedDate(toLocalDateStr(d));
                  }}
                  disabled={(d) => {
                    // Desabilita datas passadas — o restante fica a cargo da Safeweb
                    const dd = new Date(d); dd.setHours(0, 0, 0, 0);
                    return dd < today;
                  }}
                  initialFocus
                />
              </div>
              {calendarDate && (
                <p className="text-center text-xs text-muted-foreground">
                  Data selecionada: <span className="font-medium text-foreground">
                    {calendarDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Passo 3: Horários do dia selecionado — busca no sistema Safeweb */}
      {selectedLocal && selectedDate && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            3. Horários disponíveis
          </p>

          {slotsLoading && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando horários na Safeweb...
            </div>
          )}

          {slotsError && (
            <div className="space-y-2 py-2">
              <p className="text-sm text-destructive">Erro ao buscar horários.</p>
              <Button variant="outline" size="sm" onClick={() => refetchSlots()}>Tentar novamente</Button>
            </div>
          )}

          {!slotsLoading && !slotsError && slots.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-4 text-center rounded-lg border border-dashed bg-muted/30">
              <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nenhum horário disponível nesta data</p>
              <p className="text-xs text-muted-foreground">Escolha outro dia no calendário.</p>
              <Button variant="outline" size="sm" onClick={() => refetchSlots()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Atualizar
              </Button>
            </div>
          )}

          {!slotsLoading && !slotsError && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((sl, i) => {
                const isSelected = selectedSlot?.horarioInicio === sl.horarioInicio;
                return (
                  <button
                    key={`${i}-${sl.horarioInicio}`}
                    onClick={() => setSelectedSlot({ horarioInicio: sl.horarioInicio, horarioFim: sl.horarioFim })}
                    className={[
                      "rounded-lg border p-2 text-center text-xs leading-tight transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary font-semibold text-primary"
                        : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer",
                    ].join(" ")}
                  >
                    <span className="block font-semibold">{sl.horarioInicio}</span>
                    {sl.horarioFim && <span className="block text-muted-foreground">{sl.horarioFim}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SafewebSchedulingCard ──────────────────────────────────────────────────────
function SafewebSchedulingCard({ orderId, safewebAgendamentoId, safewebAgendamentoDataHora, safewebAgendamentoLocalNome, onSuccess, open, onOpenChange }: {
  orderId: number;
  safewebSolicitacaoId: string;
  safewebAgendamentoId?: string | null;
  safewebAgendamentoDataHora?: string | null;
  safewebAgendamentoLocalNome?: string | null;
  onSuccess: () => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [selection, setSelection] = useState<AgendarSelection | null>(null);

  const agendar = useAgendarSafewebOrder({
    mutation: {
      onSuccess: (data) => {
        onOpenChange(false);
        setSelection(null);
        toast({
          title: "✅ Agendamento confirmado!",
          description: `${data.localNome} — ${data.dataHora ? new Date(data.dataHora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}`,
        });
        onSuccess();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao agendar.";
        toast({ title: "Erro no agendamento", description: msg, variant: "destructive" });
      },
    },
  });

  const isScheduled = !!safewebAgendamentoId;
  const title = isScheduled ? "Agendamento Safeweb" : "Agendar Atendimento";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className={`h-4 w-4 ${isScheduled ? "text-emerald-600" : "text-primary"}`} />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isScheduled ? (
            <>
              <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Atendimento agendado</p>
                  {safewebAgendamentoDataHora && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      {new Date(safewebAgendamentoDataHora).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}
                    </p>
                  )}
                  {safewebAgendamentoLocalNome && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {safewebAgendamentoLocalNome}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
                <Calendar className="h-4 w-4 mr-2" />
                Alterar Agendamento
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Seu certificado foi registrado na Safeweb. Selecione o local de atendimento e informe a data e hora.
              </p>
              <Button onClick={() => onOpenChange(true)} className="w-full sm:w-auto">
                <Calendar className="h-4 w-4 mr-2" />
                Escolher Local e Data
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelection(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Agendamento Safeweb</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 pr-1">
            {open && (
              <LocaisAndDateDialogBody
                orderId={orderId}
                onSelect={setSelection}
              />
            )}
          </div>

          {selection && (
            <div className="border-t pt-3 mt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <span className="font-medium text-foreground">{selection.localNome}</span>
                  {" — "}{new Date(selection.data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  {" "}{selection.horarioFim ? `${selection.horarioInicio} – ${selection.horarioFim}` : selection.horarioInicio}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { onOpenChange(false); setSelection(null); }}>Cancelar</Button>
            <Button
              disabled={!selection || agendar.isPending}
              onClick={() => {
                if (!selection) return;
                agendar.mutate({
                  id: orderId,
                  data: {
                    idLocal: selection.idLocal,
                    localNome: selection.localNome,
                    data: selection.data,
                    horarioInicio: selection.horarioInicio,
                    horarioFim: selection.horarioFim,
                  },
                });
              }}
            >
              {agendar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [protocol, setProtocol] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [swSolicitacaoInput, setSwSolicitacaoInput] = useState("");
  const [garHashProduto, setGarHashProduto] = useState("");
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [safewebAgendarOpen, setSafewebAgendarOpen] = useState(false);
  const [representanteOpen, setRepresentanteOpen] = useState(false);

  const prevStatusRef = useRef<string | undefined>(undefined);

  const { data: order, isLoading, refetch } = useGetOrder(Number(id));

  // Polling DB a cada 5 s enquanto pagamento pendente
  useEffect(() => {
    if (!order) return;
    const isPending = order.status === "pending_payment" || order.status === "created";
    if (!isPending) return;
    const timer = setInterval(() => { refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [order?.status]);

  // Polling MercadoPago a cada 10 s (verifica status real no MP e atualiza o banco)
  // Também chama imediatamente quando mpPaymentId aparece pela 1ª vez
  const syncPaymentRef = useRef<typeof syncPayment.mutate | null>(null);
  useEffect(() => { syncPaymentRef.current = syncPayment.mutate; });
  const mpPaymentId = order?.mpPaymentId ?? null;
  useEffect(() => {
    if (!order) return;
    const isPending = order.status === "pending_payment" || order.status === "created";
    if (!isPending || !mpPaymentId) return;
    // Verifica imediatamente ao detectar o ID de pagamento
    syncPaymentRef.current?.({ id: Number(id) });
    const timer = setInterval(() => {
      syncPaymentRef.current?.({ id: Number(id) });
    }, 10_000);
    return () => clearInterval(timer);
  }, [order?.status, mpPaymentId, id]);

  // Detecta transição de pendente → pago e notifica o usuário
  useEffect(() => {
    if (!order) return;
    const prev = prevStatusRef.current;
    if (
      (prev === "pending_payment" || prev === "created") &&
      (order.status === "paid" || order.status === "protocol_assigned" || order.status === "completed")
    ) {
      setPixData(null);
      toast({
        title: "✅ Pagamento confirmado!",
        description: "Atualizando dados do pedido...",
      });
      // Recarrega após 3 s para mostrar protocolo e opções de documento
      setTimeout(() => { refetch(); }, 3000);
    }
    prevStatusRef.current = order.status;
  }, [order?.status]);

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: () => { toast({ title: "Pedido atualizado!" }); refetch(); },
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: (data) => {
        setPixData({ paymentId: data.paymentId, pixQrCode: data.pixQrCode, pixQrCodeBase64: data.pixQrCodeBase64 });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao gerar pagamento.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const hopeGenerate = useHopeCreateSolicitation({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "URL de documentos gerada!", description: data.url ? "Link salvo no pedido." : "Resposta sem URL." });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao gerar URL.";
        toast({ title: "Erro Hope", description: msg, variant: "destructive" });
      },
    },
  });

  const garComprar = useGarComprarOrder({
    mutation: {
      onSuccess: (data) => {
        if (data.ok) {
          toast({ title: "Venda registrada na GAR!", description: "Protocolo emitido com sucesso." });
        } else {
          toast({ title: "Venda registrada", description: "Verifique o status na GAR.", variant: "default" });
        }
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao registrar na GAR.";
        toast({ title: "Erro GAR", description: msg, variant: "destructive" });
      },
    },
  });

  const garSync = useSyncGarOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sincronizado com a GAR!" });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao sincronizar com GAR.";
        toast({ title: "Erro GAR", description: msg, variant: "destructive" });
      },
    },
  });

  const [approvePaymentOpen, setApprovePaymentOpen] = useState(false);
  const [approveMotivo, setApproveMotivo] = useState("");
  const approvePayment = useApprovePaymentManual({
    mutation: {
      onSuccess: () => {
        setApproveMotivo("");
        setApprovePaymentOpen(false);
        toast({ title: "✅ Pagamento aprovado!", description: "Status atualizado e protocolo sendo gerado." });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao aprovar pagamento.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const triggerProtocol = useTriggerProtocolManual({
    mutation: {
      onSuccess: () => {
        toast({ title: "Protocolo sendo gerado!", description: "O processo foi disparado. Aguarde alguns instantes." });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao gerar protocolo.";
        toast({ title: "Erro ao gerar protocolo", description: msg, variant: "destructive" });
      },
    },
  });

  const [cancelMotivo, setCancelMotivo] = useState("");
  const cancelarSafeweb = useCancelarSafewebOrder({
    mutation: {
      onSuccess: () => {
        setCancelMotivo("");
        toast({ title: "Solicitação cancelada", description: "O certificado foi cancelado na Safeweb." });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao cancelar.";
        toast({ title: "Erro ao cancelar", description: msg, variant: "destructive" });
      },
    },
  });

  const [garCancelMotivo, setGarCancelMotivo] = useState("");
  const cancelarGarProtocolo = useGarCancelarProtocolo({
    mutation: {
      onSuccess: () => {
        setGarCancelMotivo("");
        toast({ title: "Protocolo cancelado", description: "O protocolo foi cancelado com sucesso na Safeweb." });
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao cancelar protocolo.";
        toast({ title: "Erro ao cancelar protocolo", description: msg, variant: "destructive" });
      },
    },
  });

  const syncProvider = useSyncProviderOrder({
    mutation: {
      onSuccess: (data) => {
        if (data.ok) {
          toast({ title: "Status sincronizado!", description: data.status ? `Status: ${data.status}` : undefined });
        } else {
          toast({ title: "Aviso", description: data.error ?? "Não foi possível sincronizar.", variant: "destructive" });
        }
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao sincronizar.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const syncPayment = useSyncPaymentOrder({
    mutation: {
      onSuccess: (data) => {
        if (data.ok && (data.status === "paid" || data.status === "approved")) {
          toast({ title: "✅ Pagamento confirmado!", description: "Pedido atualizado para Pago." });
        } else {
          toast({ title: "Pagamento consultado", description: `Status no MercadoPago: ${data.status ?? "desconhecido"}` });
        }
        refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao consultar pagamento.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;
  if (!order) return <div className="text-center py-20 text-muted-foreground">Pedido não encontrado.</div>;

  const isAdmin = user?.role === "admin";
  const isPayable = order.status === "pending_payment" || order.status === "created";

  // GAR fields (now properly typed in the schema)
  const orderExt = order as typeof order & {
    garPedido?: string | null;
    garProtocolo?: string | null;
    garStatus?: string | null;
    garSyncedAt?: string | null;
    garAgendamentoDataHora?: string | null;
    garAgendamentoLocalNome?: string | null;
    garAgendamentoLink?: string | null;
    garHopeUploadUrl?: string | null;
    safewebSolicitacaoId?: string | null;
    safewebStatus?: string | null;
    safewebSyncedAt?: string | null;
    safewebAgendamentoId?: string | null;
    safewebAgendamentoDataHora?: string | null;
    safewebAgendamentoLocalNome?: string | null;
  };
  const hasGar = !!orderExt.garPedido;
  const garPedido = orderExt.garPedido ?? undefined;
  const garProtocolo = orderExt.garProtocolo ?? undefined;
  const garStatus = orderExt.garStatus ?? undefined;
  const garSyncedAt = orderExt.garSyncedAt ?? undefined;
  const garAgendamentoDataHora = orderExt.garAgendamentoDataHora ?? undefined;
  const garAgendamentoLocalNome = orderExt.garAgendamentoLocalNome ?? undefined;
  const garAgendamentoLink = orderExt.garAgendamentoLink ?? undefined;
  const garHopeUploadUrl = orderExt.garHopeUploadUrl ?? undefined;

  const hasSafeweb = !!orderExt.safewebSolicitacaoId;
  const safewebSolicitacaoId = orderExt.safewebSolicitacaoId ?? undefined;
  const safewebStatus = orderExt.safewebStatus ?? undefined;
  const safewebSyncedAt = orderExt.safewebSyncedAt ?? undefined;
  const safewebAgendamentoId = orderExt.safewebAgendamentoId ?? undefined;
  const safewebAgendamentoDataHora = orderExt.safewebAgendamentoDataHora ?? undefined;
  const safewebAgendamentoLocalNome = orderExt.safewebAgendamentoLocalNome ?? undefined;

  const statusOk = order.status === "protocol_assigned" || order.status === "paid" || order.status === "completed";
  // Card de agendamento GAR: precisa de protocolo GAR
  // Card de agendamento GAR: aguardando_validacao é o status pós-agendamento, também deve permitir reagendar/cancelar
  const canScheduleGar = !!garProtocolo && (statusOk || order.status === "aguardando_validacao") && order.status !== "cancelled";
  // Card de agendamento Safeweb: precisa de solicitacaoId; aguardando_validacao é o status pós-agendamento, também deve permitir reagendar
  const canScheduleSafeweb = !!safewebSolicitacaoId && (statusOk || order.status === "aguardando_validacao") && order.status !== "cancelled";

  function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {};
    if (newStatus) data.status = newStatus;
    if (protocol) data.protocolNumber = protocol;
    if (swSolicitacaoInput) data.safewebSolicitacaoId = swSolicitacaoInput;
    if (Object.keys(data).length === 0) return;
    updateOrder.mutate({ id: Number(id), data: data as Parameters<typeof updateOrder.mutate>[0]["data"] });
  }

  function handleGarComprar(e: React.FormEvent) {
    e.preventDefault();
    if (!garHashProduto.trim()) {
      toast({ title: "Atenção", description: "Informe o hash do produto GAR.", variant: "destructive" });
      return;
    }
    garComprar.mutate({ id: Number(id), data: { hashProduto: garHashProduto.trim() } });
  }

  return (
    <div className={`space-y-6 ${isPayable ? "pb-28 md:pb-0" : ""}`}>

      {/* Modal PIX */}
      <Dialog open={!!pixData} onOpenChange={open => { if (!open) { setPixData(null); setPixCopied(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-green-600" />
              Pagamento via PIX
            </DialogTitle>
          </DialogHeader>
          {pixData && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground text-center">
                Escaneie o QR Code abaixo ou copie o código PIX para efetuar o pagamento.
              </p>
              {pixData.pixQrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${pixData.pixQrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-lg border"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center rounded-lg border bg-muted">
                  <QrCode className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              <div className="w-full space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Código PIX (copia e cola)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 break-all select-all">
                    {pixData.pixQrCode}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(pixData.pixQrCode);
                      setPixCopied(true);
                      setTimeout(() => setPixCopied(false), 2500);
                    }}
                  >
                    {pixCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Após o pagamento, o status do pedido será atualizado automaticamente.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => { setPixData(null); setPixCopied(false); }}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barra de pagamento fixa no rodapé — só mobile */}
      {isPayable && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-4 py-3 bg-background/95 backdrop-blur-sm border-t shadow-xl md:hidden">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="lg"
              onClick={() => createPayment.mutate({ id: Number(id) })}
              disabled={createPayment.isPending}
            >
              {createPayment.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <QrCode className="h-4 w-4 mr-2" />}
              Pagar PIX
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => syncPayment.mutate({ id: Number(id) })}
              disabled={syncPayment.isPending}
              title="Verificar se pagamento foi confirmado no MercadoPago"
            >
              {syncPayment.isPending
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <RefreshCw className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/orders">
          <Button variant="outline" size="sm" className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">{order.orderNumber}</h1>
            <Badge variant={STATUS_VARIANTS[order.status] ?? "secondary"}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            {hasGar && (
              <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-50">
                GAR
              </Badge>
            )}
            {hasSafeweb && (
              <Badge variant="outline" className="border-violet-500 text-violet-700 bg-violet-50">
                Safeweb
              </Badge>
            )}
            {garAgendamentoDataHora && (
              <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                <Calendar className="h-3 w-3 mr-1" />
                Agendado
              </Badge>
            )}
          </div>
          {(order.protocolNumber || safewebSolicitacaoId) && (
            <p className="text-sm font-medium text-primary flex items-center gap-1">
              <span className="text-muted-foreground font-normal">Protocolo:</span>
              <span className="font-mono">{order.protocolNumber ?? safewebSolicitacaoId}</span>
            </p>
          )}
          <p className="text-muted-foreground text-sm">Criado em {formatDateTime(order.createdAt)}</p>
        </div>
        {/* Botões de pagamento — apenas desktop */}
        {isPayable && (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Button
              onClick={() => createPayment.mutate({ id: Number(id) })}
              disabled={createPayment.isPending}
            >
              {createPayment.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <QrCode className="h-4 w-4 mr-2" />}
              Pagamento com PIX
            </Button>
            <Button
              variant="outline"
              onClick={() => syncPayment.mutate({ id: Number(id) })}
              disabled={syncPayment.isPending}
              title="Consultar status do pagamento no MercadoPago"
            >
              {syncPayment.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {!syncPayment.isPending && <span className="ml-2">Verificar Pagamento</span>}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Cliente/Empresa</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Nome" value={order.customerName} />
              <InfoRow label={order.clientType === "cnpj" ? "CNPJ" : "CPF"} value={order.customerCpfCnpj} />
              {order.companyName && <InfoRow label="Razão Social" value={order.companyName} />}
              {order.inssNumber && <InfoRow label="INSS" value={order.inssNumber} />}
              <InfoRow label="E-mail" value={order.customerEmail} />
              <InfoRow label="Telefone" value={order.customerPhone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="CEP" value={order.addressZipcode} />
              <InfoRow label="Logradouro" value={order.addressStreet} />
              <InfoRow label="Número" value={order.addressNumber} />
              <InfoRow label="Bairro" value={order.addressNeighborhood} />
              <InfoRow label="Cidade" value={order.addressCity} />
              <InfoRow label="UF" value={order.addressState} />
            </CardContent>
          </Card>

          {/* Dados do Representante — colapsável com chevron */}
          {(() => {
            const DOC_TIPO_LABEL: Record<string, string> = { "1": "RG", "2": "RNE", "3": "Passaporte", "4": "CNH" };
            return (
              <Card>
                <button
                  type="button"
                  onClick={() => setRepresentanteOpen(v => !v)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left rounded-t-xl hover:bg-muted/40 transition-colors"
                >
                  <span className="text-base font-semibold">Dados do Representante</span>
                  <ChevronRight
                    className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${representanteOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {representanteOpen && (
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0 pb-4 border-t">
                    <InfoRow label="Nome" value={order.customerName} />
                    <InfoRow label="Telefone" value={order.customerPhone} />
                    <InfoRow label="E-mail" value={order.customerEmail} />
                    <InfoRow label="CPF do Representante" value={order.representanteCpf} />
                    <InfoRow label="Data de Nascimento" value={order.representanteNascimento} />
                    <InfoRow
                      label="Tipo de Documento"
                      value={order.representanteDocTipo ? (DOC_TIPO_LABEL[order.representanteDocTipo] ?? order.representanteDocTipo) : null}
                    />
                    <InfoRow label="Nº do Documento" value={order.representanteDocNumero} />
                    <InfoRow label="Órgão Emissor" value={order.representanteDocEmissor} />
                    <InfoRow label="CEI" value={order.customerCei} />
                    <InfoRow label="NIS" value={order.customerNis} />
                    <InfoRow label="PIS" value={order.inssNumber} />
                    <InfoRow label="CEP" value={order.representanteAddressZipcode} />
                    <InfoRow label="Logradouro" value={order.representanteAddressStreet} />
                    <InfoRow label="Número" value={order.representanteAddressNumber} />
                    <InfoRow label="Complemento" value={order.representanteAddressComplement} />
                    <InfoRow label="Bairro" value={order.representanteAddressNeighborhood} />
                    <InfoRow label="Cidade" value={order.representanteAddressCity} />
                    <InfoRow label="UF" value={order.representanteAddressState} />
                  </CardContent>
                )}
              </Card>
            );
          })()}

          {/* Admin: gerar URL Hope quando protocolo existir mas URL ainda não foi gerada */}
          {isAdmin && garProtocolo && !garHopeUploadUrl && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-orange-800 text-sm">
                  <FileText className="h-4 w-4" />
                  URL de Documentos Hope não gerada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-orange-700 mb-3">
                  O protocolo GAR foi emitido mas a URL de envio de documentos (Hope) não foi gerada automaticamente. Gere manualmente.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-400 text-orange-800 hover:bg-orange-100"
                  onClick={() => hopeGenerate.mutate({ id: Number(id) })}
                  disabled={hopeGenerate.isPending}
                >
                  {hopeGenerate.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <ExternalLink className="h-4 w-4 mr-2" />}
                  Gerar URL de Documentos
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Admin: mostrar URL Hope gerada com opção de regenerar */}
          {isAdmin && garProtocolo && garHopeUploadUrl && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">URL Hope: <a href={garHopeUploadUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">{garHopeUploadUrl}</a></span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => hopeGenerate.mutate({ id: Number(id) })}
                disabled={hopeGenerate.isPending}
                title="Regenerar URL Hope"
              >
                {hopeGenerate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          )}

          {/* Card de agendamento GAR */}
          {canScheduleGar && (
            <SchedulingCard
              orderId={Number(id)}
              garProtocolo={garProtocolo!}
              garAgendamentoDataHora={garAgendamentoDataHora}
              garAgendamentoLocalNome={garAgendamentoLocalNome}
              garAgendamentoLink={garAgendamentoLink}
              garHopeUploadUrl={garHopeUploadUrl}
              onSuccess={refetch}
            />
          )}

          {/* Card de agendamento Safeweb */}
          {canScheduleSafeweb && (
            <SafewebSchedulingCard
              orderId={Number(id)}
              safewebSolicitacaoId={safewebSolicitacaoId!}
              safewebAgendamentoId={safewebAgendamentoId}
              safewebAgendamentoDataHora={safewebAgendamentoDataHora}
              safewebAgendamentoLocalNome={safewebAgendamentoLocalNome}
              onSuccess={refetch}
              open={safewebAgendarOpen}
              onOpenChange={setSafewebAgendarOpen}
            />
          )}

          {/* Bloco oculto — manter no código para uso futuro */}
          {false && isAdmin && (
            <Card>
              <CardHeader><CardTitle>Atualizar Pedido</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleStatusUpdate} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Alterar Status</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger><SelectValue placeholder="Manter atual" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Campos ocultos — manter no código para uso futuro */}
                    <div className="space-y-2 hidden">
                      <Label>Número de Protocolo</Label>
                      <Input value={protocol} onChange={e => setProtocol(e.target.value)} placeholder="Ex: 2024001234" />
                    </div>
                    <div className="space-y-2 hidden">
                      <Label>ID Solicitação Safeweb</Label>
                      <Input value={swSolicitacaoInput} onChange={e => setSwSolicitacaoInput(e.target.value)} placeholder="Ex: 1234567" />
                    </div>
                  </div>
                  <Button type="submit" disabled={updateOrder.isPending}>
                    {updateOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Alterações
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Provedor — GAR — bloco oculto, manter no código para uso futuro */}
          {false && isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  Gestão AR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasGar ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InfoRow label="Pedido GAR" value={garPedido} />
                      <InfoRow label="Protocolo" value={garProtocolo} />
                      <InfoRow label="Status GAR" value={garStatus} />
                      <InfoRow label="Última sincronização" value={garSyncedAt ? formatDateTime(garSyncedAt ?? null) : "—"} />
                      {garAgendamentoLocalNome && <InfoRow label="Local agendado" value={garAgendamentoLocalNome} />}
                      {garAgendamentoDataHora && <InfoRow label="Data/hora agendada" value={garAgendamentoDataHora} />}
                    </div>
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => garSync.mutate({ orderId: Number(id) })}
                        disabled={garSync.isPending}
                      >
                        {garSync.isPending
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <RefreshCw className="h-4 w-4 mr-2" />}
                        Sincronizar com GAR
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleGarComprar} className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Este pedido ainda não foi registrado na Gestão AR. Informe o hash do produto para registrar a venda e emitir o protocolo.
                    </p>
                    <div className="space-y-2">
                      <Label>Hash do Produto GAR</Label>
                      <Input
                        value={garHashProduto}
                        onChange={e => setGarHashProduto(e.target.value)}
                        placeholder="Hash do produto da tabela de preços GAR"
                      />
                    </div>
                    <Button type="submit" disabled={garComprar.isPending}>
                      {garComprar.isPending
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Registrar Venda na GAR
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {/* Provedor — Safeweb */}
          {isAdmin && hasSafeweb && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-600" />
                  Safeweb
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="ID Solicitação" value={safewebSolicitacaoId} />
                    <InfoRow label="Status Safeweb" value={safewebStatus} />
                    <InfoRow label="Última sincronização" value={safewebSyncedAt ? formatDateTime(safewebSyncedAt) : "—"} />
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncProvider.mutate({ id: Number(id) })}
                      disabled={syncProvider.isPending}
                    >
                      {syncProvider.isPending
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sincronizar com Safeweb
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={cancelarSafeweb.isPending || ["cancelled", "emitido", "completed", "revogado"].includes(order.status)}
                        >
                          {cancelarSafeweb.isPending
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <Ban className="h-4 w-4 mr-2" />}
                          Cancelar Solicitação
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancelar solicitação na Safeweb?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação irá cancelar a solicitação do certificado na Safeweb e alterar o status do pedido para <strong>Cancelado</strong>. Esta operação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="px-1 py-2 space-y-2">
                          <Label htmlFor="cancel-motivo">Motivo do cancelamento</Label>
                          <Textarea
                            id="cancel-motivo"
                            placeholder="Ex: Cliente desistiu da compra, produto incorreto..."
                            value={cancelMotivo}
                            onChange={e => setCancelMotivo(e.target.value)}
                            rows={3}
                          />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setCancelMotivo("")}>Voltar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => cancelarSafeweb.mutate({ id: Number(id), data: { motivo: cancelMotivo.trim() || "Cancelado pelo administrador" } })}
                          >
                            Confirmar Cancelamento
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Certificado" value={order.certificateName} />
              <div className="flex items-center justify-between gap-2">
                <InfoRow label="Agendamento" value={garAgendamentoDataHora ?? formatDateTime(order.scheduledAt ?? null)} />
                {canScheduleSafeweb && (
                  <Button variant="outline" size="sm" className="shrink-0 text-xs h-7 px-2" onClick={() => setSafewebAgendarOpen(true)}>
                    <Calendar className="h-3 w-3 mr-1" />
                    Alterar
                  </Button>
                )}
              </div>
              {order.protocolNumber && <InfoRow label="Protocolo" value={order.protocolNumber} />}
              {garProtocolo && !order.protocolNumber && <InfoRow label="Protocolo GAR" value={garProtocolo} />}
              {order.extendedWarranty && (
                <p className="text-xs text-muted-foreground">Garantia estendida incluída</p>
              )}
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-xl font-bold text-primary">{formatBRL(order.total)}</span>
                </div>
              </div>

              {/* Admin — Aprovar Pagamento Manualmente */}
              {isAdmin && (order.status === "pending_payment" || order.status === "created") && (
                <div className="border-t pt-3">
                  <AlertDialog open={approvePaymentOpen} onOpenChange={setApprovePaymentOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full border-green-300 text-green-700 hover:bg-green-50">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Aprovar Pagamento Manualmente
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Aprovar pagamento manualmente?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O pedido será marcado como <strong>Pago</strong> e o protocolo será gerado automaticamente. Informe o motivo da aprovação manual.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="px-1 py-2 space-y-2">
                        <Label htmlFor="approve-motivo">Motivo da aprovação <span className="text-destructive">*</span></Label>
                        <Textarea
                          id="approve-motivo"
                          placeholder="Ex: Pagamento confirmado via transferência bancária, comprovante recebido via WhatsApp..."
                          value={approveMotivo}
                          onChange={e => setApproveMotivo(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setApproveMotivo("")}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-green-600 text-white hover:bg-green-700"
                          disabled={!approveMotivo.trim() || approvePayment.isPending}
                          onClick={() => {
                            if (!approveMotivo.trim()) return;
                            approvePayment.mutate({ id: Number(id), data: { motivo: approveMotivo.trim() } });
                          }}
                        >
                          {approvePayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Confirmar Aprovação
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin — Cancelar Pedido */}
          {isAdmin && !["cancelled", "emitido", "completed", "revogado"].includes(order.status) && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                  <Ban className="h-4 w-4" />
                  Ações administrativas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Gerar Protocolo Manualmente — visível quando pago mas sem protocolo ainda */}
                {order.status === "paid" && !garProtocolo && !safewebSolicitacaoId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                        {triggerProtocol.isPending
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <RefreshCw className="h-4 w-4 mr-2" />}
                        Gerar Protocolo Manualmente
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Gerar protocolo manualmente?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso irá disparar novamente o processo de geração de protocolo junto ao provedor (GAR / Safeweb). Use quando a geração automática falhou após o pagamento.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => triggerProtocol.mutate({ id: Number(id) })}
                          disabled={triggerProtocol.isPending}
                        >
                          {triggerProtocol.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Confirmar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* GAR com protocolo → cancela via API Safeweb */}
                {hasGar && garProtocolo ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={cancelarGarProtocolo.isPending}>
                        {cancelarGarProtocolo.isPending
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <Ban className="h-4 w-4 mr-2" />}
                        Cancelar Protocolo
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar protocolo GAR?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O protocolo <strong>{garProtocolo}</strong> será cancelado via API Safeweb e o pedido marcado como Cancelado. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="px-1 py-2 space-y-2">
                        <Label htmlFor="gar-cancel-motivo">Motivo do cancelamento</Label>
                        <Textarea
                          id="gar-cancel-motivo"
                          placeholder="Ex: Cliente desistiu da compra..."
                          value={garCancelMotivo}
                          onChange={e => setGarCancelMotivo(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setGarCancelMotivo("")}>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => cancelarGarProtocolo.mutate({ id: Number(id), data: { motivo: garCancelMotivo.trim() || "Cancelado pelo administrador" } })}
                        >
                          Confirmar Cancelamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  /* Sem protocolo GAR → cancela apenas no sistema */
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={updateOrder.isPending}>
                        {updateOrder.isPending
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <Ban className="h-4 w-4 mr-2" />}
                        Cancelar Pedido
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O pedido será marcado como <strong>Cancelado</strong> no sistema. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => updateOrder.mutate({ id: Number(id), data: { status: "cancelled" } })}
                        >
                          Confirmar Cancelamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          )}

          {order.termsAcceptedAt && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Termos de privacidade aceitos em {new Date(order.termsAcceptedAt).toLocaleString("pt-BR")}</span>
            </div>
          )}

          {(order.cnhPath || order.cnhVersoPath || order.cartaoCnpjPath || order.fichaCadastralPath) && (
            <Card>
              <CardHeader><CardTitle>Documentos Anexados</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {order.cnhPath && (
                  <a
                    href={`/api/${order.cnhPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1">CNH / RG — Frente</span>
                    <Download className="h-4 w-4 shrink-0" />
                  </a>
                )}
                {order.cnhVersoPath && (
                  <a
                    href={`/api/${order.cnhVersoPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1">CNH / RG — Verso (QR Code)</span>
                    <Download className="h-4 w-4 shrink-0" />
                  </a>
                )}
                {order.cartaoCnpjPath && (
                  <a
                    href={`/api/${order.cartaoCnpjPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Cartão CNPJ</span>
                    <Download className="h-4 w-4 shrink-0" />
                  </a>
                )}
                {order.fichaCadastralPath && (
                  <a
                    href={`/api/${order.fichaCadastralPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Ficha Cadastral</span>
                    <Download className="h-4 w-4 shrink-0" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {order.chatDocuments && (() => {
            let docs: { name: string; key: string; url: string }[] = [];
            try { docs = JSON.parse(order.chatDocuments); } catch { /* ignore */ }
            if (!docs.length) return null;
            return (
              <Card>
                <CardHeader><CardTitle>Documentos do Suporte</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {docs.map((doc, i) => (
                    <a
                      key={i}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{doc.name}</span>
                      <Download className="h-4 w-4 shrink-0" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {order.mpPaymentId && (
            <Card>
              <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="ID MercadoPago" value={order.mpPaymentId} />
              </CardContent>
            </Card>
          )}

          {isAdmin && order.userName && (
            <Card>
              <CardHeader><CardTitle>Atendente</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Responsável" value={order.userName} />
              </CardContent>
            </Card>
          )}

          <OrderTimeline orderId={Number(id)} onEventsChange={() => { void refetch(); }} />
        </div>
      </div>
    </div>
  );
}
