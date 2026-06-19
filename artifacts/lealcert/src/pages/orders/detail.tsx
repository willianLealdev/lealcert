import { useParams } from "wouter";
import {
  useGetOrder,
  useUpdateOrder,
  useCreatePayment,
  useGarComprarOrder,
  useSyncGarOrder,
  useSyncProviderOrder,
  useSyncPaymentOrder,
  useGetOrderGarLocais,
  useGetOrderGarSlots,
  useAgendarOrder,
  useAgendarSafewebOrder,
  useGetSafewebSlots,
  useGetOrderEvents,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, QrCode, Loader2, FileText, Download, RefreshCw,
  ShoppingBag, CheckCircle2, Calendar, MapPin, Video, Clock, ChevronRight, Check,
  Activity, QrCode as PayIcon, Package, Shield, AlertCircle, Tag, Copy,
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
  order_created:        <Package className="h-4 w-4" />,
  payment_initiated:    <PayIcon className="h-4 w-4" />,
  payment_confirmed:    <CheckCircle2 className="h-4 w-4 text-green-600" />,
  gar_sale_registered:  <ShoppingBag className="h-4 w-4 text-blue-600" />,
  gar_protocol_emitted: <Tag className="h-4 w-4 text-blue-600" />,
  scheduling_confirmed: <Calendar className="h-4 w-4 text-green-600" />,
  gar_status_updated:   <RefreshCw className="h-4 w-4 text-muted-foreground" />,
  certificate_emitted:  <Shield className="h-4 w-4 text-green-600" />,
  order_completed:      <CheckCircle2 className="h-4 w-4 text-green-700" />,
  order_cancelled:      <AlertCircle className="h-4 w-4 text-destructive" />,
  status_updated:       <Activity className="h-4 w-4" />,
  admin_action:         <Activity className="h-4 w-4 text-muted-foreground" />,
  sync_performed:       <RefreshCw className="h-4 w-4 text-muted-foreground" />,
};

function OrderTimeline({ orderId, isPendingPayment }: { orderId: number; isPendingPayment: boolean }) {
  const { data: events, isLoading, refetch: refetchEvents } = useGetOrderEvents(orderId);

  useEffect(() => {
    if (!isPendingPayment) return;
    const timer = setInterval(() => { refetchEvents(); }, 5000);
    return () => clearInterval(timer);
  }, [isPendingPayment]);

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
                  <p className="text-xs font-medium leading-tight">{ev.message}</p>
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
function SchedulingCard({ orderId, garProtocolo, garAgendamentoDataHora, garAgendamentoLocalNome, onSuccess }: {
  orderId: number;
  garProtocolo: string;
  garAgendamentoDataHora?: string;
  garAgendamentoLocalNome?: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"locais" | "slots" | "confirm">("locais");
  const [ufFiltro, setUfFiltro] = useState("");
  const [municipioFiltro, setMunicipioFiltro] = useState("");
  const [localSelecionado, setLocalSelecionado] = useState<{ HashLocal: string; NomeLocalAgendamento: string; NomeCidadeLocalAgendamento?: string; UF: string; Endereco?: string; isVideo: boolean } | null>(null);
  const [slotSelecionado, setSlotSelecionado] = useState<{ HashSlot: string; NomeSlotAgendamento: string } | null>(null);

  const { data: locais, isLoading: loadingLocais } = useGetOrderGarLocais(orderId);
  const { data: slots, isLoading: loadingSlots } = useGetOrderGarSlots(
    orderId,
    localSelecionado?.HashLocal ?? "_",
  );

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
      // Somente videoconferência — presencial nunca é exibido
      if (!isVideo(l.NomeLocalAgendamento)) return false;
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
    setSlotSelecionado(null);
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
    setSlotSelecionado(null);
    setStep("slots");
  }

  function handleSelecionarSlot(s: { HashSlot: string; NomeSlotAgendamento: string }) {
    setSlotSelecionado(s);
    setStep("confirm");
  }

  function handleConfirmar() {
    if (!localSelecionado || !slotSelecionado) return;
    agendar.mutate({
      id: orderId,
      data: {
        hashLocal: localSelecionado.HashLocal,
        hashSlot: slotSelecionado.HashSlot,
        localNome: localSelecionado.NomeLocalAgendamento,
        slotNome: slotSelecionado.NomeSlotAgendamento,
      },
    });
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
          <Button variant="outline" size="sm" className="border-green-400 text-green-800 hover:bg-green-100" onClick={handleOpenModal}>
            <Calendar className="h-4 w-4 mr-2" />
            Reagendar
          </Button>
        </CardContent>

        <SchedulingDialog
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
          slots={slots}
          loadingSlots={loadingSlots}
          slotSelecionado={slotSelecionado}
          onSelecionarLocal={handleSelecionarLocal}
          onSelecionarSlot={handleSelecionarSlot}
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
          <Video className="h-4 w-4 shrink-0" />
          <span>Videoconferência disponível — atendimento no conforto da sua casa.</span>
        </div>
        <Button onClick={handleOpenModal} className="w-full sm:w-auto">
          <Calendar className="h-4 w-4 mr-2" />
          Escolher data e horário
        </Button>
      </CardContent>

      <SchedulingDialog
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
        slots={slots}
        loadingSlots={loadingSlots}
        slotSelecionado={slotSelecionado}
        onSelecionarLocal={handleSelecionarLocal}
        onSelecionarSlot={handleSelecionarSlot}
        onConfirmar={handleConfirmar}
        isPending={agendar.isPending}
        isVideo={isVideo}
      />
    </Card>
  );
}

// ── Modal de Agendamento ──────────────────────────────────────────────────────
type Local = {
  HashLocal: string;
  NomeLocalAgendamento: string;
  NomeCidadeLocalAgendamento?: string;
  UF?: string;
  Endereco?: string;
  isVideo: boolean;
};

function SchedulingDialog({
  open, onOpenChange, step, setStep,
  locais, loadingLocais, ufsDisponiveis,
  ufFiltro, setUfFiltro, municipioFiltro, setMunicipioFiltro,
  localSelecionado, slots, loadingSlots, slotSelecionado,
  onSelecionarLocal, onSelecionarSlot, onConfirmar, isPending, isVideo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  step: "locais" | "slots" | "confirm";
  setStep: (s: "locais" | "slots" | "confirm") => void;
  locais: Array<{ HashLocal: string; NomeLocalAgendamento: string; NomeCidadeLocalAgendamento?: string; UF?: string; Endereco?: string }>;
  loadingLocais: boolean;
  ufsDisponiveis: string[];
  ufFiltro: string;
  setUfFiltro: (v: string) => void;
  municipioFiltro: string;
  setMunicipioFiltro: (v: string) => void;
  localSelecionado: Local | null;
  slots: Array<{ HashSlot: string; NomeSlotAgendamento: string }> | undefined;
  loadingSlots: boolean;
  slotSelecionado: { HashSlot: string; NomeSlotAgendamento: string } | null;
  onSelecionarLocal: (l: typeof locais[0]) => void;
  onSelecionarSlot: (s: { HashSlot: string; NomeSlotAgendamento: string }) => void;
  onConfirmar: () => void;
  isPending: boolean;
  isVideo: (nome: string) => boolean;
}) {
  const stepTitle: Record<string, string> = {
    locais: "1 — Escolha o local de atendimento",
    slots: "2 — Escolha o horário",
    confirm: "3 — Confirmar agendamento",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendamento — {stepTitle[step]}
          </DialogTitle>
        </DialogHeader>

        {/* Breadcrumb de passos */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(["locais", "slots", "confirm"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={step === s ? "text-primary font-semibold" : ""}>
                {i + 1}. {s === "locais" ? "Local" : s === "slots" ? "Horário" : "Confirmar"}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">

          {/* PASSO 1 — Escolher local */}
          {step === "locais" && (
            <div className="flex flex-col h-full gap-3">
              <div className="flex gap-2 flex-wrap">
                <Select value={ufFiltro} onValueChange={setUfFiltro}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
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
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="space-y-2 pb-2">
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
                </ScrollArea>
              )}
            </div>
          )}

          {/* PASSO 2 — Escolher horário */}
          {step === "slots" && (
            <div className="flex flex-col h-full gap-3">
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

              {loadingSlots ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Buscando horários disponíveis...
                </div>
              ) : !slots || slots.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum horário disponível neste local. Tente outro local.
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => setStep("locais")}>
                      Voltar e escolher outro local
                    </Button>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.HashSlot}
                        className="w-full text-left rounded-lg border p-3 bg-background hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                        onClick={() => onSelecionarSlot(slot)}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary shrink-0" />
                          <p className="text-sm font-medium">{slot.NomeSlotAgendamento}</p>
                          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* PASSO 3 — Confirmar */}
          {step === "confirm" && localSelecionado && slotSelecionado && (
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
                    <p className="font-semibold">{slotSelecionado.NomeSlotAgendamento}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <strong>Importante:</strong> apresente documento de identificação original (RG ou CNH). Compareça com 10 minutos de antecedência.
              </div>
              <p className="text-sm text-muted-foreground">
                Após confirmar, você receberá um e-mail com os detalhes do agendamento.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step !== "locais" && (
            <Button
              variant="outline"
              onClick={() => setStep(step === "confirm" ? "slots" : "locais")}
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

// ── ManualSlotInput — fallback quando a Safeweb não retorna horários ──────────
function ManualSlotInput({ selected, onSelect }: {
  selected: { idAgendamento: string | number | null; dataHora: string; local: string } | null;
  onSelect: (slot: { idAgendamento: string | number | null; dataHora: string; local: string }) => void;
}) {
  const [dataHora, setDataHora] = useState(selected?.dataHora ? new Date(selected.dataHora).toISOString().slice(0, 16) : "");
  const [local, setLocal] = useState(selected?.local ?? "Videoconferência");

  const handleChange = (dh: string, loc: string) => {
    if (dh) onSelect({ idAgendamento: null, dataHora: new Date(dh).toISOString(), local: loc });
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Informe a data, horário e modalidade combinados para o atendimento.
      </p>
      <div className="space-y-2">
        <Label>Data e Horário</Label>
        <Input
          type="datetime-local"
          value={dataHora}
          onChange={e => { setDataHora(e.target.value); handleChange(e.target.value, local); }}
        />
      </div>
      <div className="space-y-2">
        <Label>Modalidade / Local</Label>
        <Input
          value={local}
          onChange={e => { setLocal(e.target.value); handleChange(dataHora, e.target.value); }}
          placeholder="Ex: Videoconferência"
        />
      </div>
    </div>
  );
}

// ── SlotsDialogBody — montado só quando o dialog está aberto ─────────────────
function SlotsDialogBody({ orderId, onSelect, selected }: {
  orderId: number;
  selected: { idAgendamento: string | number | null; dataHora: string; local: string } | null;
  onSelect: (slot: { idAgendamento: string | number | null; dataHora: string; local: string }) => void;
}) {
  const { data: slotsData, isLoading, isError, refetch } = useGetSafewebSlots(orderId);
  const slots = slotsData?.slots ?? [];

  const slotsByDate = useMemo(() => {
    const map: Record<string, typeof slots> = {};
    for (const s of slots) {
      if (!s.dataHora) continue;
      const dateKey = new Date(s.dataHora).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(s);
    }
    return map;
  }, [slots]);

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Consultando horários disponíveis...</span>
    </div>
  );

  if (isError) return (
    <div className="space-y-3 text-center py-6">
      <p className="text-sm text-destructive">Não foi possível carregar os horários da Safeweb.</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
    </div>
  );

  if (slots.length === 0) return (
    <ManualSlotInput selected={selected} onSelect={onSelect} />
  );

  return (
    <div className="space-y-4">
      {Object.entries(slotsByDate).map(([dateLabel, daySlots]) => (
        <div key={dateLabel} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{dateLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {daySlots.map((s, idx) => {
              const time = new Date(s.dataHora!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const isSelected = selected?.dataHora === s.dataHora && selected?.local === s.local;
              const isUnavailable = s.disponivel === false;
              return (
                <button
                  key={idx}
                  disabled={isUnavailable}
                  onClick={() => onSelect({ idAgendamento: s.idAgendamento ?? null, dataHora: s.dataHora!, local: s.local })}
                  className={[
                    "rounded-lg border p-3 text-left text-sm transition-all",
                    isUnavailable
                      ? "opacity-40 cursor-not-allowed bg-muted"
                      : isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer",
                  ].join(" ")}
                >
                  <div className="font-semibold">{time}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.local}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SafewebSchedulingCard ──────────────────────────────────────────────────────
function SafewebSchedulingCard({ orderId, safewebAgendamentoId, safewebAgendamentoDataHora, safewebAgendamentoLocalNome, onSuccess }: {
  orderId: number;
  safewebSolicitacaoId: string;
  safewebAgendamentoId?: string | null;
  safewebAgendamentoDataHora?: string | null;
  safewebAgendamentoLocalNome?: string | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ idAgendamento: string | number | null; dataHora: string; local: string } | null>(null);

  const agendar = useAgendarSafewebOrder({
    mutation: {
      onSuccess: (data) => {
        setOpen(false);
        setSelectedSlot(null);
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

  if (isScheduled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600" />
            Agendamento Safeweb
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Agendar Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seu certificado foi registrado na Safeweb. Escolha um dos horários disponíveis para realizar o atendimento por videoconferência.
          </p>
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Calendar className="h-4 w-4 mr-2" />
            Ver Horários Disponíveis
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedSlot(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Escolha o Horário de Atendimento</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {open && (
              <SlotsDialogBody
                orderId={orderId}
                selected={selectedSlot}
                onSelect={setSelectedSlot}
              />
            )}
          </div>

          {selectedSlot && (
            <div className="border-t pt-3 mt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    {new Date(selectedSlot.dataHora).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {" — "}{selectedSlot.local}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setSelectedSlot(null); }}>Cancelar</Button>
            <Button
              disabled={!selectedSlot || agendar.isPending}
              onClick={() => {
                if (!selectedSlot) return;
                agendar.mutate({
                  id: orderId,
                  data: {
                    dataHora: new Date(selectedSlot.dataHora).toISOString(),
                    localNome: selectedSlot.local,
                    idAgendamento: selectedSlot.idAgendamento != null ? String(selectedSlot.idAgendamento) : undefined,
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

  // Polling MercadoPago a cada 30 s (verifica status real no MP e atualiza o banco)
  const syncPaymentRef = useRef<typeof syncPayment.mutate | null>(null);
  useEffect(() => { syncPaymentRef.current = syncPayment.mutate; });
  useEffect(() => {
    if (!order) return;
    const isPending = order.status === "pending_payment" || order.status === "created";
    const hasMpId = !!(order as typeof order & { mpPaymentId?: string | null }).mpPaymentId;
    if (!isPending || !hasMpId) return;
    const timer = setInterval(() => {
      syncPaymentRef.current?.({ id: Number(id) });
    }, 30_000);
    return () => clearInterval(timer);
  }, [order?.status, id]);

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
        description: "Seu pedido foi atualizado automaticamente.",
      });
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

  const hasSafeweb = !!orderExt.safewebSolicitacaoId;
  const safewebSolicitacaoId = orderExt.safewebSolicitacaoId ?? undefined;
  const safewebStatus = orderExt.safewebStatus ?? undefined;
  const safewebSyncedAt = orderExt.safewebSyncedAt ?? undefined;
  const safewebAgendamentoId = orderExt.safewebAgendamentoId ?? undefined;
  const safewebAgendamentoDataHora = orderExt.safewebAgendamentoDataHora ?? undefined;
  const safewebAgendamentoLocalNome = orderExt.safewebAgendamentoLocalNome ?? undefined;

  const statusOk = order.status === "protocol_assigned" || order.status === "paid" || order.status === "completed";
  // Card de agendamento GAR: precisa de protocolo GAR
  const canScheduleGar = !!garProtocolo && statusOk;
  // Card de agendamento Safeweb: precisa de solicitacaoId na Safeweb
  const canScheduleSafeweb = !!safewebSolicitacaoId && statusOk;

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
            <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
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

          {/* Card de agendamento GAR */}
          {canScheduleGar && (
            <SchedulingCard
              orderId={Number(id)}
              garProtocolo={garProtocolo!}
              garAgendamentoDataHora={garAgendamentoDataHora}
              garAgendamentoLocalNome={garAgendamentoLocalNome}
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
                  <div className="pt-2">
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
              <InfoRow label="Agendamento" value={garAgendamentoDataHora ?? formatDateTime(order.scheduledAt ?? null)} />
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
            </CardContent>
          </Card>

          {order.chatDocuments && (() => {
            let docs: { name: string; key: string; url: string }[] = [];
            try { docs = JSON.parse(order.chatDocuments); } catch { /* ignore */ }
            if (!docs.length) return null;
            return (
              <Card>
                <CardHeader><CardTitle>Documentos Enviados</CardTitle></CardHeader>
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

          <OrderTimeline orderId={Number(id)} isPendingPayment={order.status === "pending_payment" || order.status === "created"} />
        </div>
      </div>
    </div>
  );
}
