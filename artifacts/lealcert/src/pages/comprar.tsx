import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileText,
  CreditCard,
  Upload,
  Calendar,
  AlertTriangle,
  Lock,
  MapPin,
  Search,
  Fingerprint,
  User,
  Building2,
  QrCode,
  Receipt,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

/* ── helpers ──────────────────────────────────────────────────────────────── */
function maskCpf(v: string) {
  return v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3").replace(/(\d{3})(\d{0,3})/, "$1.$2");
}
function maskCnpj(v: string) {
  return v.replace(/\D/g, "").slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4").replace(/(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3").replace(/(\d{2})(\d{0,3})/, "$1.$2");
}
function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 11) return maskCpf(v);
  return maskCnpj(v);
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/\($/, "(");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}
function maskCep(v: string) {
  return v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{1,3})/, "$1-$2");
}
function maskDate(v: string) {
  return v.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(\d{2})(\d{0,4})/, "$1/$2/$3").replace(/(\d{2})(\d{0,2})/, "$1/$2");
}
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function digitsOnly(v: string) { return v.replace(/\D/g, ""); }

interface Certificate {
  id: number;
  name: string;
  product?: string | null;
  model?: string | null;
  validityMonths: number;
  price: number;
  priceContador?: number | null;
}

/* ── tipos de estado ──────────────────────────────────────────────────────── */
type Step = 1 | 2 | 3 | 4 | 5 | 6; // bio | dados | nf | pag | docs | agenda

interface BioState {
  cpf: string;
  dataNascimento: string;
  validated: boolean;
  customerName: string | null;
  hasPsbio: boolean;
  error: string | null;
  loading: boolean;
}

interface DadosForm {
  nome: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  zipcode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ibge: string;
  // CNPJ extra
  razaoSocial: string;
  nomeResponsavel: string;
  cpfResponsavel: string;
  nascimentoResponsavel: string;
  issuanceType: string;
  extendedWarranty: boolean;
  couponCode: string;
  couponDiscount: number;
  couponValid: boolean | null;
}

interface NfForm {
  nfCpfCnpj: string;
  nfNome: string;
  nfZipcode: string;
  nfStreet: string;
  nfNumber: string;
  nfComplement: string;
  nfNeighborhood: string;
  nfCity: string;
  nfState: string;
  nfIbge: string;
  sameAsHolder: boolean;
}

interface PaymentState {
  method: "pix" | "boleto" | "cartao" | null;
  orderId: number | null;
  orderNumber: string | null;
  pixQr: string | null;
  pixCode: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  totalAmount: number;
  loading: boolean;
  error: string | null;
  paid: boolean;
}

interface AgendaLocal { id?: number; localAtendimentoId?: number; nome?: string; NomeLocalAtendimento?: string; hash?: string; HashLocal?: string; }
interface AgendaSlot { horario?: string; horarioInicio?: string; horarioFim?: string; }

/* ════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ════════════════════════════════════════════════════════════════════════════ */
export default function ComprarPage() {
  const { certId } = useParams<{ certId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* cert */
  const { data: cert, isLoading: certLoading, isError: certError } = useQuery<Certificate>({
    queryKey: ["/api/public/checkout/cert", certId],
    queryFn: async () => {
      const r = await fetch(`/api/public/checkout/cert/${certId}`);
      if (!r.ok) throw new Error("Certificado não encontrado");
      return r.json();
    },
    enabled: !!certId,
  });

  /* price with contador discount */
  const certPrice = cert
    ? (user?.role === "admin" || user?.userType === "cliente") && cert.priceContador != null
      ? cert.priceContador
      : cert.price
    : 0;

  /* ── Step 1 — PSBio ──────────────────────────────────────────────────────── */
  const [bio, setBio] = useState<BioState>({
    cpf: "", dataNascimento: "", validated: false, customerName: null, hasPsbio: false, error: null, loading: false,
  });

  const handleBioSubmit = async () => {
    if (!termsAccepted) { setShowTerms(true); return; }
    setBio(b => ({ ...b, loading: true, error: null }));
    try {
      const r = await fetch("/api/public/checkout/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpf: digitsOnly(bio.cpf), dataNascimento: bio.dataNascimento }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setBio(b => ({ ...b, loading: false, error: data.mensagem || "Erro ao validar CPF." }));
        return;
      }
      setBio(b => ({ ...b, loading: false, validated: true, customerName: data.customerName, hasPsbio: data.hasPsbio }));
      // Pre-fill nome in dados
      if (data.customerName) setDados(d => ({ ...d, nome: data.customerName, cpfCnpj: maskCpf(bio.cpf) }));
      setStep(2);
      window.scrollTo(0, 0);
    } catch {
      setBio(b => ({ ...b, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ── Step 2 — Dados do titular ───────────────────────────────────────────── */
  const [dados, setDados] = useState<DadosForm>({
    nome: "", cpfCnpj: "", email: "", phone: "",
    zipcode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", ibge: "",
    razaoSocial: "", nomeResponsavel: "", cpfResponsavel: "", nascimentoResponsavel: "", issuanceType: "videoconferencia",
    extendedWarranty: false, couponCode: "", couponDiscount: 0, couponValid: null,
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFilled, setCepFilled] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);

  const setDad = (k: keyof DadosForm, v: string | boolean | number) => setDados(d => ({ ...d, [k]: v }));

  const fetchCep = useCallback(async (cep: string) => {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`/api/public/checkout/cep/${d}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setDados(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          ibge: data.ibge || prev.ibge,
        }));
        setCepFilled(true);
      }
    } finally { setCepLoading(false); }
  }, []);

  const [nfCepLoading, setNfCepLoading] = useState(false);
  const [nfCepFilled, setNfCepFilled] = useState(false);
  const [nf, setNf] = useState<NfForm>({
    nfCpfCnpj: "", nfNome: "", nfZipcode: "", nfStreet: "", nfNumber: "", nfComplement: "",
    nfNeighborhood: "", nfCity: "", nfState: "", nfIbge: "", sameAsHolder: false,
  });
  const setNfField = (k: keyof NfForm, v: string | boolean) => setNf(n => ({ ...n, [k]: v }));

  const fetchNfCep = useCallback(async (cep: string) => {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    setNfCepLoading(true);
    try {
      const r = await fetch(`/api/public/checkout/cep/${d}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setNf(prev => ({
          ...prev,
          nfStreet: data.logradouro || prev.nfStreet,
          nfNeighborhood: data.bairro || prev.nfNeighborhood,
          nfCity: data.localidade || prev.nfCity,
          nfState: data.uf || prev.nfState,
          nfIbge: data.ibge || prev.nfIbge,
        }));
        setNfCepFilled(true);
      }
    } finally { setNfCepLoading(false); }
  }, []);

  const validateCoupon = async () => {
    if (!dados.couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const r = await fetch("/api/public/checkout/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: dados.couponCode.trim(), certId: Number(certId) }),
      });
      const data = await r.json();
      if (data.valid) {
        setDad("couponDiscount", data.discount);
        setDad("couponValid", true);
        toast({ title: `Cupom aplicado! Desconto de ${formatBRL(data.discount)}` });
      } else {
        setDad("couponDiscount", 0);
        setDad("couponValid", false);
        toast({ title: data.error || "Cupom inválido", variant: "destructive" });
      }
    } finally { setCouponLoading(false); }
  };

  const isCnpjCert = cert?.product?.toLowerCase().includes("cnpj") || cert?.name?.toLowerCase().includes("cnpj") || cert?.name?.toLowerCase().includes("pj");
  const finalPrice = Math.max(0, certPrice + (dados.extendedWarranty ? 15 : 0) - dados.couponDiscount);

  const goToDados = () => {
    // validate dados
    const cpf = digitsOnly(dados.cpfCnpj);
    if (!dados.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) { toast({ title: "CPF/CNPJ inválido", variant: "destructive" }); return; }
    if (!dados.email.includes("@")) { toast({ title: "E-mail inválido", variant: "destructive" }); return; }
    if (digitsOnly(dados.phone).length < 10) { toast({ title: "Telefone inválido", variant: "destructive" }); return; }
    if (!dados.zipcode || digitsOnly(dados.zipcode).length !== 8) { toast({ title: "CEP inválido", variant: "destructive" }); return; }
    if (!dados.street || !dados.number || !dados.city || !dados.state) { toast({ title: "Endereço incompleto", variant: "destructive" }); return; }
    if (isCnpjCert && !dados.razaoSocial.trim()) { toast({ title: "Razão social obrigatória", variant: "destructive" }); return; }
    setStep(3);
    window.scrollTo(0, 0);
  };

  const goToNf = () => {
    if (!nf.sameAsHolder) {
      const cpf = digitsOnly(nf.nfCpfCnpj);
      if (!nf.nfNome.trim()) { toast({ title: "Nome da NF obrigatório", variant: "destructive" }); return; }
      if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) { toast({ title: "CPF/CNPJ da NF inválido", variant: "destructive" }); return; }
    }
    setStep(4);
    window.scrollTo(0, 0);
  };

  /* ── Step 4 — Pagamento ─────────────────────────────────────────────────── */
  const [payment, setPayment] = useState<PaymentState>({
    method: null, orderId: null, orderNumber: null, pixQr: null, pixCode: null,
    boletoUrl: null, boletoBarcode: null, totalAmount: 0, loading: false, error: null, paid: false,
  });

  const allowedMethods = finalPrice >= 150 ? ["pix", "boleto", "cartao"] : finalPrice >= 125 ? ["pix", "boleto"] : ["pix"];

  const [cardData, setCardData] = useState({ number: "", name: "", expiry: "", cvv: "", token: "" });

  const submitOrder = async (method: "pix" | "boleto" | "cartao") => {
    setPayment(p => ({ ...p, loading: true, error: null, method }));
    try {
      const body = {
        certId: Number(certId),
        bio: { cpf: digitsOnly(bio.cpf), dataNascimento: bio.dataNascimento },
        dados: {
          ...dados,
          cpfCnpj: digitsOnly(dados.cpfCnpj),
          phone: digitsOnly(dados.phone),
          zipcode: digitsOnly(dados.zipcode),
          cpfResponsavel: digitsOnly(dados.cpfResponsavel),
        },
        nf: nf.sameAsHolder ? null : {
          ...nf,
          nfCpfCnpj: digitsOnly(nf.nfCpfCnpj),
          nfZipcode: digitsOnly(nf.nfZipcode),
        },
        payment: { method, cardToken: cardData.token || undefined },
        couponCode: dados.couponValid ? dados.couponCode.trim() : undefined,
      };
      const r = await fetch("/api/public/checkout/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setPayment(p => ({ ...p, loading: false, error: data.error || "Erro ao processar pedido." }));
        return;
      }
      setPayment({
        method,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        pixQr: data.pixQrBase64 || null,
        pixCode: data.pixCode || null,
        boletoUrl: data.boletoUrl || null,
        boletoBarcode: data.boletoBarcode || null,
        totalAmount: data.totalAmount ?? finalPrice,
        loading: false,
        error: null,
        paid: method === "cartao",
      });
      setStep(5);
      window.scrollTo(0, 0);
    } catch {
      setPayment(p => ({ ...p, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ── Step 5 — Docs upload ────────────────────────────────────────────────── */
  const [docs, setDocs] = useState<{ rgFrente: File | null; rgVerso: File | null; selfie: File | null; extra: File | null }>({
    rgFrente: null, rgVerso: null, selfie: null, extra: null,
  });
  const [docsLoading, setDocsLoading] = useState(false);

  const uploadDocs = async () => {
    if (!payment.orderId) return;
    if (!docs.rgFrente && !docs.rgVerso) {
      // allow skipping with confirmation
      setStep(6);
      window.scrollTo(0, 0);
      return;
    }
    setDocsLoading(true);
    try {
      const fd = new FormData();
      if (docs.rgFrente) fd.append("rgFrente", docs.rgFrente);
      if (docs.rgVerso) fd.append("rgVerso", docs.rgVerso);
      if (docs.selfie) fd.append("selfie", docs.selfie);
      if (docs.extra) fd.append("extra", docs.extra);
      await fetch(`/api/orders/${payment.orderId}/documents`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
    } finally {
      setDocsLoading(false);
      setStep(6);
      window.scrollTo(0, 0);
    }
  };

  /* ── Step 6 — Agendamento ────────────────────────────────────────────────── */
  const [locais, setLocais] = useState<AgendaLocal[]>([]);
  const [locaisLoading, setLocaisLoading] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState<AgendaLocal | null>(null);
  const [slots, setSlots] = useState<AgendaSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AgendaSlot | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaDone, setAgendaDone] = useState(false);

  useEffect(() => {
    if (step !== 6 || !payment.orderId) return;
    setLocaisLoading(true);
    fetch(`/api/public/checkout/slots/${payment.orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setLocais(data.locais ?? []);
      })
      .catch(() => setLocais([]))
      .finally(() => setLocaisLoading(false));
  }, [step, payment.orderId]);

  const fetchSlots = async (local: AgendaLocal, date: string) => {
    if (!date || !local) return;
    setSlotsLoading(true);
    setSlots([]);
    try {
      const idLocal = local.localAtendimentoId ?? local.id ?? 0;
      const r = await fetch(`/api/public/checkout/slots/${payment.orderId}?idLocal=${idLocal}&date=${date}`, { credentials: "include" });
      const data = await r.json();
      setSlots(data.horarios ?? data.slots ?? []);
    } finally { setSlotsLoading(false); }
  };

  const handleAgendar = async () => {
    if (!selectedLocal || !selectedDate || !selectedSlot || !payment.orderId) return;
    setAgendaLoading(true);
    try {
      const idLocal = selectedLocal.localAtendimentoId ?? selectedLocal.id ?? 0;
      const localNome = selectedLocal.NomeLocalAtendimento ?? selectedLocal.nome ?? "";
      const horarioInicio = selectedSlot.horarioInicio ?? selectedSlot.horario ?? "";
      const r = await fetch(`/api/public/checkout/agendar/${payment.orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idLocal, localNome, data: selectedDate, horarioInicio, horarioFim: selectedSlot.horarioFim ?? "" }),
      });
      if (r.ok) { setAgendaDone(true); }
      else { toast({ title: "Erro ao agendar. Tente novamente.", variant: "destructive" }); }
    } finally { setAgendaLoading(false); }
  };

  /* ── Render helpers ──────────────────────────────────────────────────────── */
  const STEPS = [
    { n: 1, label: "Validação" },
    { n: 2, label: "Dados" },
    { n: 3, label: "Nota Fiscal" },
    { n: 4, label: "Pagamento" },
    { n: 5, label: "Documentos" },
    { n: 6, label: "Agendamento" },
  ];

  if (certLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (certError || !cert) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="text-lg font-semibold">Certificado não encontrado.</p>
        <Button onClick={() => setLocation("/")}>Voltar ao início</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#0f172a] text-white py-4 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Início
          </button>
          <span className="font-bold text-lg">LEAL<span className="text-blue-400">CERT</span></span>
          <Lock className="h-4 w-4 text-white/60" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Cert summary */}
        <div className="flex items-center justify-between bg-white rounded-xl border px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Certificado</p>
            <p className="font-bold text-foreground">{cert.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cert.validityMonths} meses de validade</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-primary">{formatBRL(certPrice)}</p>
            {user && (user.role === "admin" || user.userType === "cliente") && cert.priceContador != null && (
              <Badge variant="secondary" className="text-xs mt-1">Preço Contador</Badge>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === s.n ? "bg-primary text-white" :
                step > s.n ? "bg-emerald-100 text-emerald-700" :
                "bg-muted text-muted-foreground"
              }`}>
                {step > s.n ? <CheckCircle2 className="h-3 w-3" /> : <span>{s.n}</span>}
                <span>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px w-3 ${step > s.n ? "bg-emerald-400" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1 — PSBio ──────────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-primary" />Validação Biométrica
              </CardTitle>
              <p className="text-sm text-muted-foreground">Informe seus dados para validação. Nenhum cadastro é necessário.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input
                  value={bio.cpf}
                  onChange={e => setBio(b => ({ ...b, cpf: maskCpf(e.target.value), error: null }))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento *</Label>
                <Input
                  type="date"
                  value={bio.dataNascimento}
                  onChange={e => setBio(b => ({ ...b, dataNascimento: e.target.value, error: null }))}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>

              {bio.error && (
                <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">{bio.error}</span>
                </div>
              )}

              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Seus dados são usados exclusivamente para validação junto à ICP-Brasil e não serão compartilhados com terceiros.</p>
              </div>

              {!termsAccepted ? (
                <Button className="w-full h-12 text-base" onClick={() => setShowTerms(true)} disabled={bio.loading}>
                  <ShieldCheck className="h-4 w-4 mr-2" />Aceitar Termos e Continuar
                </Button>
              ) : (
                <Button className="w-full h-12 text-base" onClick={handleBioSubmit} disabled={bio.loading}>
                  {bio.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  {bio.loading ? "Validando..." : "Validar e Continuar"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2 — Dados do titular ───────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />Dados do Titular
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nome Completo *</Label>
                    <Input value={dados.nome} onChange={e => setDad("nome", e.target.value)} placeholder="Como no RG" />
                  </div>
                  <div className="space-y-2">
                    <Label>{isCnpjCert ? "CPF do Responsável *" : "CPF *"}</Label>
                    <Input value={dados.cpfCnpj} onChange={e => setDad("cpfCnpj", maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={dados.email} onChange={e => setDad("email", e.target.value)} placeholder="seu@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone / WhatsApp *</Label>
                    <Input value={dados.phone} onChange={e => setDad("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
                  </div>
                </div>

                {isCnpjCert && (
                  <>
                    <Separator />
                    <p className="text-sm font-medium flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" />Dados da Empresa</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>CNPJ *</Label>
                        <Input value={dados.razaoSocial} onChange={e => setDad("razaoSocial", e.target.value)} placeholder="00.000.000/0001-00" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Razão Social *</Label>
                        <Input value={dados.nomeResponsavel} onChange={e => setDad("nomeResponsavel", e.target.value)} placeholder="Empresa LTDA" />
                      </div>
                    </div>
                  </>
                )}

                <Separator />
                <p className="text-sm font-medium flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />Endereço</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>CEP *</Label>
                    <div className="relative">
                      <Input value={dados.zipcode} onChange={e => { const m = maskCep(e.target.value); setDad("zipcode", m); fetchCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Rua / Logradouro *</Label>
                    <Input value={dados.street} onChange={e => setDad("street", e.target.value)} className={cepFilled && dados.street ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Número *</Label>
                    <Input value={dados.number} onChange={e => setDad("number", e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input value={dados.complement} onChange={e => setDad("complement", e.target.value)} placeholder="Apto..." maxLength={20} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={dados.neighborhood} onChange={e => setDad("neighborhood", e.target.value)} className={cepFilled && dados.neighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade *</Label>
                    <Input value={dados.city} onChange={e => setDad("city", e.target.value)} className={cepFilled && dados.city ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>UF *</Label>
                    <Input value={dados.state} onChange={e => setDad("state", e.target.value.toUpperCase())} maxLength={2} placeholder="SP" className={cepFilled && dados.state ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cupom + garantia */}
            <Card>
              <CardHeader><CardTitle className="text-base">Opções Adicionais</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="warranty" className="h-4 w-4 accent-primary" checked={dados.extendedWarranty} onChange={e => setDad("extendedWarranty", e.target.checked)} />
                  <label htmlFor="warranty" className="text-sm cursor-pointer">
                    <span className="font-medium">Garantia Estendida</span>
                    <span className="text-muted-foreground ml-2">(+{formatBRL(15)})</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Reemissão gratuita caso haja problema técnico no prazo de 90 dias.</p>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Input value={dados.couponCode} onChange={e => { setDad("couponCode", e.target.value.toUpperCase()); setDad("couponValid", null as unknown as string); setDad("couponDiscount", 0); }} placeholder="CUPOM DE DESCONTO" className="font-mono uppercase" />
                  <Button variant="outline" onClick={validateCoupon} disabled={couponLoading || !dados.couponCode.trim()}>
                    {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                  </Button>
                </div>
                {dados.couponValid === true && <p className="text-xs text-emerald-600 font-medium">✓ Desconto de {formatBRL(dados.couponDiscount)} aplicado!</p>}
                {dados.couponValid === false && <p className="text-xs text-destructive">Cupom inválido ou expirado.</p>}
              </CardContent>
            </Card>

            {/* Resumo */}
            <div className="bg-white rounded-xl border px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total a pagar</span>
              <span className="text-2xl font-extrabold text-primary">{formatBRL(finalPrice)}</span>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
              <Button className="flex-1 h-12 text-base" onClick={goToDados}>Avançar <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 3 — Nota Fiscal ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />Dados para Nota Fiscal
                </CardTitle>
                <p className="text-sm text-muted-foreground">A NF será emitida com estes dados.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border cursor-pointer" onClick={() => {
                  setNfField("sameAsHolder", !nf.sameAsHolder);
                  if (!nf.sameAsHolder) {
                    setNf(n => ({
                      ...n, sameAsHolder: true,
                      nfCpfCnpj: maskCpfCnpj(dados.cpfCnpj), nfNome: dados.nome,
                      nfZipcode: maskCep(dados.zipcode), nfStreet: dados.street,
                      nfNumber: dados.number, nfComplement: dados.complement,
                      nfNeighborhood: dados.neighborhood, nfCity: dados.city, nfState: dados.state, nfIbge: dados.ibge,
                    }));
                  }
                }}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={nf.sameAsHolder} readOnly />
                  <span className="text-sm font-medium">Usar os mesmos dados do titular</span>
                </div>

                {!nf.sameAsHolder && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>CPF ou CNPJ *</Label>
                        <Input value={nf.nfCpfCnpj} onChange={e => setNfField("nfCpfCnpj", maskCpfCnpj(e.target.value))} placeholder="CPF ou CNPJ" inputMode="numeric" />
                      </div>
                      <div className="space-y-2">
                        <Label>Nome / Razão Social *</Label>
                        <Input value={nf.nfNome} onChange={e => setNfField("nfNome", e.target.value)} placeholder="Nome completo" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>CEP *</Label>
                        <div className="relative">
                          <Input value={nf.nfZipcode} onChange={e => { const m = maskCep(e.target.value); setNfField("nfZipcode", m); fetchNfCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                            {nfCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Rua / Logradouro *</Label>
                        <Input value={nf.nfStreet} onChange={e => setNfField("nfStreet", e.target.value)} className={nfCepFilled && nf.nfStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>Número *</Label>
                        <Input value={nf.nfNumber} onChange={e => setNfField("nfNumber", e.target.value)} placeholder="123" />
                      </div>
                      <div className="space-y-2">
                        <Label>Complemento</Label>
                        <Input value={nf.nfComplement} onChange={e => setNfField("nfComplement", e.target.value)} placeholder="Apto..." maxLength={20} />
                      </div>
                      <div className="space-y-2">
                        <Label>Bairro</Label>
                        <Input value={nf.nfNeighborhood} onChange={e => setNfField("nfNeighborhood", e.target.value)} className={nfCepFilled && nf.nfNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>Cidade *</Label>
                        <Input value={nf.nfCity} onChange={e => setNfField("nfCity", e.target.value)} className={nfCepFilled && nf.nfCity ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>UF *</Label>
                        <Input value={nf.nfState} onChange={e => setNfField("nfState", e.target.value.toUpperCase())} maxLength={2} placeholder="SP" className={nfCepFilled && nf.nfState ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
              <Button className="flex-1 h-12 text-base" onClick={goToNf}>Avançar <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 4 — Pagamento ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Resumo final */}
            <Card>
              <CardHeader><CardTitle>Resumo do Pedido</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{cert.name}</span>
                  <span className="font-medium">{formatBRL(certPrice)}</span>
                </div>
                {dados.extendedWarranty && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Garantia Estendida</span>
                    <span className="font-medium">{formatBRL(15)}</span>
                  </div>
                )}
                {dados.couponDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Desconto (cupom)</span>
                    <span>-{formatBRL(dados.couponDiscount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-primary text-xl">{formatBRL(finalPrice)}</span>
                </div>
              </CardContent>
            </Card>

            {payment.error && (
              <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-destructive">{payment.error}</span>
              </div>
            )}

            {/* Métodos */}
            <div className="space-y-3">
              {allowedMethods.includes("pix") && (
                <button
                  className="w-full flex items-center gap-4 bg-white border-2 border-emerald-300 hover:border-emerald-500 rounded-xl px-5 py-4 transition-colors text-left"
                  onClick={() => submitOrder("pix")}
                  disabled={payment.loading}
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <QrCode className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">PIX</p>
                    <p className="text-xs text-muted-foreground">Aprovação imediata · sem taxas</p>
                  </div>
                  {payment.loading && payment.method === "pix" ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> : <ArrowRight className="h-5 w-5 text-muted-foreground" />}
                </button>
              )}
              {allowedMethods.includes("boleto") && (
                <button
                  className="w-full flex items-center gap-4 bg-white border-2 border-amber-300 hover:border-amber-500 rounded-xl px-5 py-4 transition-colors text-left"
                  onClick={() => submitOrder("boleto")}
                  disabled={payment.loading}
                >
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <Receipt className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">Boleto Bancário</p>
                    <p className="text-xs text-muted-foreground">Prazo de até 3 dias úteis</p>
                  </div>
                  {payment.loading && payment.method === "boleto" ? <Loader2 className="h-5 w-5 animate-spin text-amber-600" /> : <ArrowRight className="h-5 w-5 text-muted-foreground" />}
                </button>
              )}
              {allowedMethods.includes("cartao") && (
                <button
                  className="w-full flex items-center gap-4 bg-white border-2 border-blue-300 hover:border-blue-500 rounded-xl px-5 py-4 transition-colors text-left"
                  onClick={() => submitOrder("cartao")}
                  disabled={payment.loading}
                >
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">Cartão de Crédito</p>
                    <p className="text-xs text-muted-foreground">Sem parcelamento · aprovação imediata</p>
                  </div>
                  {payment.loading && payment.method === "cartao" ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> : <ArrowRight className="h-5 w-5 text-muted-foreground" />}
                </button>
              )}
            </div>

            <Button variant="outline" onClick={() => setStep(3)} className="w-full"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
          </div>
        )}

        {/* ── STEP 5 — Documentos ─────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            {/* Payment confirmation */}
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800">Pedido #{payment.orderNumber} criado!</p>
                    <p className="text-sm text-emerald-700">Você receberá um e-mail com os detalhes e suas credenciais de acesso.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PIX */}
            {payment.method === "pix" && payment.pixQr && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-600" />Pagamento PIX</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-center">
                  <img src={`data:image/png;base64,${payment.pixQr}`} alt="QR Code PIX" className="mx-auto w-48 h-48 rounded-lg border" />
                  {payment.pixCode && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Ou copie o código Pix Copia e Cola:</p>
                      <div className="flex gap-2">
                        <Input value={payment.pixCode} readOnly className="font-mono text-xs" />
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(payment.pixCode!); toast({ title: "Código copiado!" }); }}>Copiar</Button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-left">
                    <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>O QR Code expira em 30 minutos. O agendamento só é confirmado após o pagamento ser processado.</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Boleto */}
            {payment.method === "boleto" && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-amber-600" />Boleto Bancário</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {payment.boletoBarcode && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Código de barras:</p>
                      <div className="flex gap-2">
                        <Input value={payment.boletoBarcode} readOnly className="font-mono text-xs" />
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(payment.boletoBarcode!); toast({ title: "Código copiado!" }); }}>Copiar</Button>
                      </div>
                    </div>
                  )}
                  {payment.boletoUrl && (
                    <Button className="w-full" asChild variant="outline">
                      <a href={payment.boletoUrl} target="_blank" rel="noopener noreferrer">
                        <Receipt className="h-4 w-4 mr-2" />Visualizar / Imprimir Boleto
                      </a>
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground bg-slate-50 border rounded-lg px-3 py-2">
                    O boleto tem validade de 3 dias úteis. Após o pagamento, o prazo de compensação pode levar até 3 dias úteis.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Doc upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />Documentos</CardTitle>
                <p className="text-sm text-muted-foreground">Envie seus documentos para agilizar o atendimento. Você também pode enviar depois pelo seu painel.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "rgFrente", label: "RG / CNH — Frente", required: true },
                  { key: "rgVerso", label: "RG / CNH — Verso", required: true },
                  { key: "selfie", label: "Selfie com documento", required: false },
                  ...(isCnpjCert ? [{ key: "extra", label: "Contrato Social / Cartão CNPJ", required: false }] : []),
                ].map(({ key, label, required }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-sm">{label}{required && " *"}</Label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 border-dashed border-muted-foreground/30 hover:border-primary rounded-lg px-4 py-3 transition-colors">
                        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground truncate">
                          {(docs[key as keyof typeof docs])?.name || "Clique para selecionar"}
                        </span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setDocs(d => ({ ...d, [key]: e.target.files?.[0] ?? null }))} />
                      </label>
                      {docs[key as keyof typeof docs] && (
                        <button className="text-xs text-destructive hover:underline" onClick={() => setDocs(d => ({ ...d, [key]: null }))}>Remover</button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button className="w-full h-12 text-base" onClick={uploadDocs} disabled={docsLoading}>
              {docsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              {docsLoading ? "Enviando..." : "Continuar para Agendamento"}
            </Button>
          </div>
        )}

        {/* ── STEP 6 — Agendamento ────────────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Agendamento</CardTitle>
                <p className="text-sm text-muted-foreground">Escolha o local e horário para sua videochamada de validação.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {agendaDone ? (
                  <div className="text-center space-y-4 py-4">
                    <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
                    <div>
                      <p className="text-lg font-bold text-emerald-700">Agendamento confirmado!</p>
                      <p className="text-sm text-muted-foreground mt-1">Você receberá um e-mail de confirmação com os detalhes do atendimento.</p>
                    </div>
                    <Button onClick={() => setLocation("/dashboard")} className="w-full">Acessar meu painel</Button>
                  </div>
                ) : (
                  <>
                    {locaisLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : locais.length === 0 ? (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-semibold text-amber-700">Nenhum local disponível no momento.</p>
                          <p className="text-amber-600 mt-0.5">Nossa equipe entrará em contato para agendar seu atendimento.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>Local de atendimento *</Label>
                          <div className="grid gap-2">
                            {locais.slice(0, 6).map((local, i) => {
                              const nome = local.NomeLocalAtendimento ?? local.nome ?? `Local ${i + 1}`;
                              const id = local.localAtendimentoId ?? local.id ?? i;
                              const isSelected = selectedLocal === local;
                              return (
                                <button key={id} onClick={() => { setSelectedLocal(local); setSlots([]); setSelectedSlot(null); if (selectedDate) fetchSlots(local, selectedDate); }}
                                  className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-colors ${isSelected ? "border-primary bg-primary/5 font-medium" : "border-muted hover:border-primary/40"}`}>
                                  <MapPin className="h-3.5 w-3.5 inline mr-1.5 text-primary" />{nome}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {selectedLocal && (
                          <div className="space-y-2">
                            <Label>Data *</Label>
                            <Input type="date" value={selectedDate}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); if (selectedLocal) fetchSlots(selectedLocal, e.target.value); }} />
                          </div>
                        )}

                        {slotsLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

                        {slots.length > 0 && (
                          <div className="space-y-2">
                            <Label>Horário *</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {slots.map((slot, i) => {
                                const h = slot.horarioInicio ?? slot.horario ?? `${i}`;
                                const isSelected = selectedSlot === slot;
                                return (
                                  <button key={i} onClick={() => setSelectedSlot(slot)}
                                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${isSelected ? "border-primary bg-primary text-white" : "border-muted hover:border-primary/40"}`}>
                                    {h}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {selectedLocal && selectedDate && slots.length === 0 && !slotsLoading && (
                          <p className="text-sm text-muted-foreground text-center py-2">Nenhum horário disponível para esta data.</p>
                        )}

                        <Button className="w-full h-12 text-base" onClick={handleAgendar}
                          disabled={!selectedLocal || !selectedDate || !selectedSlot || agendaLoading}>
                          {agendaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
                          {agendaLoading ? "Agendando..." : "Confirmar Agendamento"}
                        </Button>

                        <button className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline" onClick={() => setLocation("/dashboard")}>
                          Agendar depois pelo painel
                        </button>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Terms modal */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Termos de Coleta de Dados Pessoais</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p>Para a emissão do seu Certificado Digital, coletamos os seguintes dados pessoais:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nome completo, CPF/CNPJ, data de nascimento e contato (e-mail e telefone)</li>
              <li>Endereço e informações complementares para faturamento</li>
              <li>Cópia do documento de identificação (RG ou CNH — frente e verso)</li>
              <li>Documentos da empresa, quando aplicável (Cartão CNPJ, Ficha Cadastral)</li>
            </ul>
            <p>Esses dados são utilizados exclusivamente para validação de identidade perante as Autoridades Certificadoras (ICP-Brasil) e para emissão do certificado solicitado. Não compartilhamos seus dados com terceiros, salvo obrigação legal ou exigência das Autoridades Certificadoras.</p>
            <p>O armazenamento é feito de forma segura e os dados serão mantidos pelo período exigido pela regulamentação vigente.</p>
            <p>Ao clicar em <strong>Aceitar e Continuar</strong>, você declara que leu, compreendeu e concorda com a coleta e uso dos seus dados pessoais conforme descrito acima, nos termos da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTerms(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => {
              setTermsAccepted(true);
              setShowTerms(false);
            }}>Aceitar e Continuar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
