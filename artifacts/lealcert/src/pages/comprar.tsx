import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
  FileText, CreditCard, Upload, Calendar, Lock, MapPin, Search,
  Fingerprint, User, Building2, QrCode, Receipt, Clock, AlertTriangle,
  LogIn, UserPlus, Eye, EyeOff, CheckCircle, ChevronRight, RefreshCw,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 11) return maskCpf(v);
  return maskCnpj(v);
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function parseBrDate(v: string) {
  if (!v || v.length < 10) return v;
  const [d, m, y] = v.split("/");
  return y && m && d ? `${y}-${m}-${d}` : v;
}
function formatBrFromIso(v: string | null | undefined) {
  if (!v) return "";
  if (v.includes("/")) return v;
  const [y, m, d] = v.split("T")[0].split("-");
  return y && m && d ? `${d}/${m}/${y}` : v;
}
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function digits(v: string) { return (v || "").replace(/\D/g, ""); }

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/* ── tipos ─────────────────────────────────────────────────────────────── */
type Step = "lookup" | "bio" | "dados" | "nf" | "lealplus" | "pagamento" | "processando" | "docs" | "agenda";
type CnpjRfbState = null | "loading" | { ok: true; razaoSocial: string } | { ok: false; mensagem: string };
type PayMethod = "pix" | "boleto" | "cartao";

interface Certificate {
  id: number; name: string; product?: string | null; model?: string | null;
  validityMonths: number; price: number; priceContador?: number | null;
}
interface LookupResult {
  found: boolean; name?: string; authenticated?: boolean; userId?: number;
  email?: string; phone?: string; personType?: string;
  prefill?: Record<string, string | null> | null;
  error?: string;
}
interface BioData {
  cpf: string; dataNascimento: string;
  validated: boolean; customerName: string | null; hasPsbio: boolean;
  error: string | null; loading: boolean;
}
interface DadosForm {
  nome: string; cpfCnpj: string; customerBirthDate: string;
  email: string; phone: string; razaoSocial: string;
  repNome: string; repBirthDate: string;
  repNumeroTipo: "" | "cei" | "nis" | "pis";
  customerCei: string; customerNis: string; inssNumber: string;
  repDocTipo: string; repDocNumero: string; repDocOrgan: string; repDocUf: string;
  repAddressZipcode: string; repAddressStreet: string; repAddressNumber: string;
  repAddressComplement: string; repAddressNeighborhood: string;
  repAddressCity: string; repAddressState: string; repAddressIbge: string;
  extendedWarranty: boolean;
}
interface NfForm {
  sameAsHolder: boolean; nfCpfCnpj: string; nfNome: string;
  nfZipcode: string; nfStreet: string; nfNumber: string;
  nfComplement: string; nfNeighborhood: string; nfCity: string;
  nfState: string; nfIbge: string;
}
interface PayState {
  method: PayMethod | null;
  orderId: number | null; orderNumber: string | null;
  pixQr: string | null; pixCode: string | null;
  boletoUrl: string | null; boletoBarcode: string | null;
  isNewUser: boolean; loading: boolean; error: string | null;
}

/* ── Logo ──────────────────────────────────────────────────────────────── */
function LealCertLogo({ small }: { small?: boolean }) {
  return <img src="/logo-oficial-cropped.png" alt="LealCert" className={small ? "h-9 w-auto object-contain" : "h-12 w-auto object-contain"} />;
}

/* ── Resumo lateral fixo ────────────────────────────────────────────────── */
const LEALPLUS_SIDEBAR_PRICE = 19.90;

function ResumeLateral({
  cert, certPrice, extendedWarranty, couponDiscount, couponCode, couponValid,
  couponLoading, onCouponChange, onCouponApply, setCouponCode, setCouponDiscount, setCouponValid,
}: {
  cert: Certificate; certPrice: number; extendedWarranty: boolean;
  couponDiscount: number; couponCode: string; couponValid: boolean | null;
  couponLoading: boolean; onCouponChange: (v: string) => void;
  onCouponApply: () => void; setCouponCode: (v: string) => void;
  setCouponDiscount: (v: number) => void; setCouponValid: (v: boolean | null) => void;
}) {
  const subtotal = certPrice + (extendedWarranty ? LEALPLUS_SIDEBAR_PRICE : 0);
  const total = Math.max(0, subtotal - couponDiscount);

  return (
    <div className="space-y-4">
      {/* Produto */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-5 text-white">
          <p className="text-xs uppercase tracking-widest text-blue-300 font-semibold mb-1">Certificado Digital</p>
          <p className="font-bold text-lg leading-tight">{cert.name}</p>
          <p className="text-blue-200 text-sm mt-1">{cert.validityMonths} meses de validade</p>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Valor base</span>
            <span className="font-medium">{formatBRL(certPrice)}</span>
          </div>
          {extendedWarranty && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3 text-[#0d7c6b]" />Leal Plus
              </span>
              <span className="font-medium text-[#0d7c6b]">+{formatBRL(LEALPLUS_SIDEBAR_PRICE)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex items-center justify-between text-sm text-emerald-600">
              <span>Desconto</span>
              <span className="font-semibold">−{formatBRL(couponDiscount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="font-bold">Total</span>
            <span className="text-2xl font-extrabold text-primary">{formatBRL(total)}</span>
          </div>
        </div>
      </div>

      {/* Cupom de desconto — sempre visível na sidebar */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
        <p className="text-sm font-semibold">Cupom de desconto</p>
        {couponValid === true ? (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span className="font-mono">{couponCode}</span>
              <span className="text-xs font-normal">aplicado</span>
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => { setCouponCode(""); setCouponDiscount(0); setCouponValid(null); }}
            >
              remover
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={e => { onCouponChange(e.target.value.toUpperCase()); }}
                onKeyDown={e => e.key === "Enter" && onCouponApply()}
                placeholder="CÓDIGO DO CUPOM"
                className="font-mono uppercase text-sm"
              />
              <Button variant="outline" size="sm" onClick={onCouponApply} disabled={couponLoading || !couponCode.trim()}>
                {couponLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar"}
              </Button>
            </div>
            {couponValid === false && <p className="text-xs text-destructive">Cupom inválido ou expirado.</p>}
          </div>
        )}
      </div>

      {/* Selos de segurança */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-2.5">
        {[
          { icon: ShieldCheck, text: "Compra 100% segura e criptografada" },
          { icon: CheckCircle, text: "Autorizado ICP-Brasil" },
          { icon: Clock, text: "Emissão em até 24h úteis" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Step indicator ─────────────────────────────────────────────────────── */
const STEP_LIST: { id: Step; label: string }[] = [
  { id: "lookup", label: "Identificação" },
  { id: "bio", label: "Validação" },
  { id: "dados", label: "Dados" },
  { id: "nf", label: "Nota Fiscal" },
  { id: "lealplus", label: "Leal Plus" },
  { id: "pagamento", label: "Pagamento" },
  { id: "processando", label: "Processando" },
  { id: "docs", label: "Documentos" },
  { id: "agenda", label: "Agendamento" },
];
const STEP_ORDER = STEP_LIST.map(s => s.id);

function StepBar({ current }: { current: Step }) {
  const ci = STEP_ORDER.indexOf(current);
  const visible = STEP_LIST.filter(s => s.id !== "processando");
  return (
    <div className="flex items-center overflow-x-auto pb-1 scrollbar-none gap-0">
      {visible.map((s, i) => {
        const si = STEP_ORDER.indexOf(s.id);
        const done = ci > si;
        const active = s.id === current || (current === "processando" && s.id === "pagamento");
        return (
          <div key={s.id} className="flex items-center shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              active ? "bg-primary text-white shadow-sm" :
              done ? "bg-emerald-500 text-white" :
              "bg-slate-100 text-slate-500"
            }`}>
              {done
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[11px] font-bold ${active ? "bg-white/20" : "bg-black/10"}`}>{i + 1}</span>
              }
              <span className="hidden md:inline">{s.label}</span>
            </div>
            {i < visible.length - 1 && (
              <div className={`h-px w-4 mx-0.5 shrink-0 ${done || (active && ci === si) ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function ComprarPage() {
  const { certId } = useParams<{ certId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("lookup");
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Sessão ativa — pula o lookup se já autenticado
  const { data: meData, isLoading: meLoading } = useGetMe();

  useEffect(() => {
    if (meLoading || !meData || step !== "lookup") return;
    // Usuário já autenticado — pré-preenche apenas email (nome vem obrigatoriamente da RFB no bio)
    setExistingUserId(meData.id);
    setDados(prev => ({
      ...prev,
      email: prev.email || meData.email || "",
    }));
    setTermsAccepted(true);
    setStep("bio");
    window.scrollTo(0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData, meLoading]);

  // Lookup flow
  const [lookupMode, setLookupMode] = useState<null | "cliente" | "novo">(null);
  const [newClientType, setNewClientType] = useState<"cpf" | "cnpj">("cpf");

  /* ── certificado ─────────────────────────────────────────────────────── */
  const { data: cert, isLoading: certLoading, isError: certError } = useQuery<Certificate>({
    queryKey: ["/api/public/checkout/cert", certId],
    queryFn: async () => {
      const r = await fetch(`/api/public/checkout/cert/${certId}`, { credentials: "include" });
      if (!r.ok) throw new Error("não encontrado");
      return r.json();
    },
    enabled: !!certId,
  });

  const certPrice = cert?.price ?? 0;
  const isCnpjCert = !!(
    cert?.product?.toLowerCase().includes("cnpj") ||
    cert?.product?.toLowerCase().includes("pj") ||
    cert?.name?.toLowerCase().includes("cnpj") ||
    cert?.name?.toLowerCase().includes("e-pj")
  );

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 0 — Lookup (já tem cadastro?)
  ══════════════════════════════════════════════════════════════════════ */
  const [lookupDoc, setLookupDoc] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupPassword, setLookupPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [existingUserId, setExistingUserId] = useState<number | null>(null);

  const doLookup = async () => {
    const d = digits(lookupDoc);
    if (d.length !== 11 && d.length !== 14) { setLookupError("Informe um CPF ou CNPJ válido."); return; }
    setLookupLoading(true); setLookupError(""); setLookupResult(null);
    try {
      const r = await fetch("/api/public/checkout/lookup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfCnpj: d }),
      });
      const data: LookupResult = await r.json();
      setLookupResult(data);
    } catch { setLookupError("Erro de rede. Tente novamente."); }
    finally { setLookupLoading(false); }
  };

  const doLogin = async () => {
    if (!lookupResult?.found) return;
    if (!lookupPassword.trim()) { setLookupError("Informe sua senha."); return; }
    setLoginLoading(true); setLookupError("");
    try {
      const d = digits(lookupDoc);
      const r = await fetch("/api/public/checkout/lookup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfCnpj: d, password: lookupPassword }),
      });
      const data: LookupResult = await r.json();
      if (!r.ok || !data.authenticated) {
        setLookupError(data.error || "Senha incorreta."); return;
      }
      setExistingUserId(data.userId ?? null);
      // Invalida cache de auth — o usuário já está autenticado na sessão
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      /* pré-preenche dados com info do cadastro */
      if (data.prefill) {
        const pf = data.prefill;
        setDados(prev => ({
          ...prev,
          nome: pf.customerName || data.name || prev.nome,
          email: pf.customerEmail || data.email || prev.email,
          phone: maskPhone(pf.customerPhone || data.phone || digits(prev.phone)),
          razaoSocial: pf.companyName || prev.razaoSocial,
          customerBirthDate: formatBrFromIso(pf.customerBirthDate),
          repBirthDate: formatBrFromIso(pf.representanteNascimento),
          repDocTipo: pf.representanteDocTipo || prev.repDocTipo,
          repDocNumero: pf.representanteDocNumero || prev.repDocNumero,
          repAddressZipcode: pf.addressZipcode ? maskCep(pf.addressZipcode) : prev.repAddressZipcode,
          repAddressStreet: pf.addressStreet || prev.repAddressStreet,
          repAddressNumber: pf.addressNumber || prev.repAddressNumber,
          repAddressComplement: pf.addressComplement || prev.repAddressComplement,
          repAddressNeighborhood: pf.addressNeighborhood || prev.repAddressNeighborhood,
          repAddressCity: pf.addressCity || prev.repAddressCity,
          repAddressState: pf.addressState || prev.repAddressState,
        }));
        setNf(prev => ({
          ...prev,
          nfCpfCnpj: pf.nfCnpj ? maskCpfCnpj(pf.nfCnpj) : prev.nfCpfCnpj,
          nfNome: pf.nfNome || prev.nfNome,
          nfZipcode: pf.nfZipcode ? maskCep(pf.nfZipcode) : prev.nfZipcode,
          nfStreet: pf.nfStreet || prev.nfStreet,
          nfNumber: pf.nfNumber || prev.nfNumber,
          nfComplement: pf.nfComplement || prev.nfComplement,
          nfNeighborhood: pf.nfNeighborhood || prev.nfNeighborhood,
          nfCity: pf.nfCity || prev.nfCity,
          nfState: pf.nfState || prev.nfState,
        }));
      } else {
        setDados(prev => ({
          ...prev,
          nome: data.name || prev.nome,
          email: data.email || prev.email,
          phone: data.phone ? maskPhone(data.phone) : prev.phone,
        }));
      }
      // Mostra os termos antes de avançar para bio
      setShowTerms(true);
    } catch { setLookupError("Erro de rede. Tente novamente."); }
    finally { setLoginLoading(false); }
  };

  const continueAsNew = () => {
    setExistingUserId(null);
    setLookupResult(null);
    setLookupPassword("");
    setLookupDoc("");
    setLookupError("");
    // Mostra os termos antes de avançar para bio
    setShowTerms(true);
  };

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 1 — Bio (PSBio)
  ══════════════════════════════════════════════════════════════════════ */
  const [bio, setBio] = useState<BioData>({
    cpf: "", dataNascimento: "", validated: false,
    customerName: null, hasPsbio: false, error: null, loading: false,
  });

  /* CPF do representante vem do bio — nunca editável */
  const repCpfFixed = bio.cpf;

  const handleBioSubmit = async () => {
    if (!termsAccepted) { setShowTerms(true); return; }
    if (digits(bio.cpf).length !== 11) { setBio(b => ({ ...b, error: "CPF inválido." })); return; }
    if (bio.dataNascimento.length !== 10) { setBio(b => ({ ...b, error: "Data de nascimento inválida (DD/MM/AAAA)." })); return; }
    setBio(b => ({ ...b, loading: true, error: null }));
    try {
      const r = await fetch("/api/public/checkout/bio", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: digits(bio.cpf), dataNascimento: parseBrDate(bio.dataNascimento) }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setBio(b => ({ ...b, loading: false, error: data.mensagem || "Erro ao validar CPF." })); return;
      }
      setBio(b => ({ ...b, loading: false, validated: true, customerName: data.customerName, hasPsbio: data.hasPsbio }));
      setDados(d => ({
        ...d,
        // Nome SEMPRE vem da RFB (retorno do PSBio) — nunca do banco de dados
        nome: data.customerName || "",
        repNome: data.customerName || "",
        cpfCnpj: isCnpjCert ? d.cpfCnpj : (d.cpfCnpj || maskCpf(bio.cpf)),
        customerBirthDate: !isCnpjCert ? (d.customerBirthDate || bio.dataNascimento) : d.customerBirthDate,
        repBirthDate: isCnpjCert ? (d.repBirthDate || bio.dataNascimento) : d.repBirthDate,
      }));
      // Verifica se há pedido anterior com dados de endereço para oferecer reutilização
      setPrevOrderData(null); setPrevOrderUsed(null);
      try {
        const prRes = await fetch(`/api/public/checkout/previous-order?cpf=${digits(bio.cpf)}`, { credentials: "include" });
        if (prRes.ok) {
          const prJson = await prRes.json();
          if (prJson.found) setPrevOrderData(prJson.data);
        }
      } catch { /* silencioso */ }
      setStep("dados");
      window.scrollTo(0, 0);
    } catch {
      setBio(b => ({ ...b, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 2 — Dados
  ══════════════════════════════════════════════════════════════════════ */
  const [dados, setDados] = useState<DadosForm>({
    nome: "", cpfCnpj: "", customerBirthDate: "", email: "", phone: "",
    razaoSocial: "", repNome: "", repBirthDate: "",
    repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "",
    repDocTipo: "0", repDocNumero: "", repDocOrgan: "", repDocUf: "",
    repAddressZipcode: "", repAddressStreet: "", repAddressNumber: "",
    repAddressComplement: "", repAddressNeighborhood: "", repAddressCity: "",
    repAddressState: "", repAddressIbge: "",
    extendedWarranty: false,
  });
  const setD = (k: keyof DadosForm, v: string | boolean) => setDados(d => ({ ...d, [k]: v }));

  /* Pedido anterior — para oferecer reutilização de dados */
  const [prevOrderData, setPrevOrderData] = useState<Record<string, string | null> | null>(null);
  const [prevOrderUsed, setPrevOrderUsed] = useState<boolean | null>(null); // null=não decidiu, true=sim, false=não

  /* RFB */
  const [cnpjRfbState, setCnpjRfbState] = useState<CnpjRfbState>(null);
  const rfbAbortRef = useRef<AbortController | null>(null);

  const triggerCnpjRfb = useCallback(async (cnpj: string, cpf: string, nasc: string) => {
    const cnpjD = digits(cnpj); const cpfD = digits(cpf);
    if (cnpjD.length !== 14 || cpfD.length !== 11 || nasc.length !== 10) return;
    rfbAbortRef.current?.abort();
    const ac = new AbortController(); rfbAbortRef.current = ac;
    setCnpjRfbState("loading");
    try {
      const r = await fetch("/api/public/checkout/cnpj-rfb", {
        method: "POST", credentials: "include", signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: cnpjD, cpf: cpfD, dataNascimento: parseBrDate(nasc) }),
      });
      const data = await r.json();
      if (data.ok) {
        setCnpjRfbState({ ok: true, razaoSocial: data.razaoSocial ?? "" });
        if (data.razaoSocial) setD("razaoSocial", data.razaoSocial);
      } else {
        setCnpjRfbState({ ok: false, mensagem: data.mensagem ?? "CPF não confere com a Receita Federal." });
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setCnpjRfbState({ ok: false, mensagem: "Erro ao consultar Receita Federal." });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCnpjCert) return;
    const cnpjD = digits(dados.cpfCnpj); const cpfD = digits(repCpfFixed);
    if (cnpjD.length === 14 && cpfD.length === 11 && dados.repBirthDate.length === 10) {
      if (cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok) return;
      void triggerCnpjRfb(dados.cpfCnpj, repCpfFixed, dados.repBirthDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.cpfCnpj, dados.repBirthDate, isCnpjCert]);

  /* CEP representante */
  const [repCepLoading, setRepCepLoading] = useState(false);
  const [repCepFilled, setRepCepFilled] = useState(false);
  const fetchRepCep = useCallback(async (cep: string) => {
    if (digits(cep).length !== 8) return;
    setRepCepLoading(true);
    try {
      const r = await fetch(`/api/public/checkout/cep/${digits(cep)}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setDados(prev => ({
          ...prev,
          repAddressStreet: data.logradouro || prev.repAddressStreet,
          repAddressNeighborhood: data.bairro || prev.repAddressNeighborhood,
          repAddressCity: data.localidade || prev.repAddressCity,
          repAddressState: data.uf || prev.repAddressState,
          repAddressIbge: data.ibge || prev.repAddressIbge,
        }));
        setRepCepFilled(true);
      }
    } finally { setRepCepLoading(false); }
  }, []);

  const goToNf = () => {
    if (!dados.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!dados.email.includes("@")) { toast({ title: "E-mail inválido", variant: "destructive" }); return; }
    if (digits(dados.phone).length < 10) { toast({ title: "Telefone inválido", variant: "destructive" }); return; }
    if (isCnpjCert) {
      if (digits(dados.cpfCnpj).length !== 14) { toast({ title: "CNPJ inválido", variant: "destructive" }); return; }
      if (!dados.razaoSocial.trim()) { toast({ title: "Razão Social obrigatória", variant: "destructive" }); return; }
      if (dados.repBirthDate.length !== 10) { toast({ title: "Data de nascimento do representante obrigatória", variant: "destructive" }); return; }
      if (!(cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok)) {
        toast({ title: "Aguarde a confirmação da Receita Federal", variant: "destructive" }); return;
      }
    } else {
      if (dados.customerBirthDate.length !== 10) { toast({ title: "Data de nascimento obrigatória", variant: "destructive" }); return; }
    }
    if (dados.repDocTipo === "0") { toast({ title: "Selecione o tipo de documento", variant: "destructive" }); return; }
    if (!dados.repDocNumero.trim()) { toast({ title: "Informe o número do documento", variant: "destructive" }); return; }
    if (digits(dados.repAddressZipcode).length !== 8) { toast({ title: "CEP inválido", variant: "destructive" }); return; }
    if (!dados.repAddressStreet || !dados.repAddressNumber || !dados.repAddressCity || !dados.repAddressState) {
      toast({ title: "Endereço incompleto", variant: "destructive" }); return;
    }
    setStep("nf"); window.scrollTo(0, 0);
  };

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 3 — Nota Fiscal
  ══════════════════════════════════════════════════════════════════════ */
  const [nf, setNf] = useState<NfForm>({
    sameAsHolder: false, nfCpfCnpj: "", nfNome: "",
    nfZipcode: "", nfStreet: "", nfNumber: "",
    nfComplement: "", nfNeighborhood: "", nfCity: "", nfState: "", nfIbge: "",
  });
  const setNfField = (k: keyof NfForm, v: string | boolean) => setNf(n => ({ ...n, [k]: v }));
  const [nfCepLoading, setNfCepLoading] = useState(false);
  const [nfCepFilled, setNfCepFilled] = useState(false);

  const fetchNfCep = useCallback(async (cep: string) => {
    if (digits(cep).length !== 8) return;
    setNfCepLoading(true);
    try {
      const r = await fetch(`/api/public/checkout/cep/${digits(cep)}`, { credentials: "include" });
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

  const goToLealPlus = () => {
    if (!nf.sameAsHolder) {
      if (!nf.nfNome.trim()) { toast({ title: "Nome da NF obrigatório", variant: "destructive" }); return; }
      const c = digits(nf.nfCpfCnpj);
      if (!c || (c.length !== 11 && c.length !== 14)) { toast({ title: "CPF/CNPJ da NF inválido", variant: "destructive" }); return; }
    }
    setStep("lealplus"); window.scrollTo(0, 0);
  };

  const goToPagamento = () => {
    setStep("pagamento"); window.scrollTo(0, 0);
  };

  /* Leal Plus — salvo como extendedWarranty no banco */
  const LEALPLUS_PRICE = 19.90;

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 4 — Pagamento (seleciona método e preenche dados, depois submete)
  ══════════════════════════════════════════════════════════════════════ */
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  /* cartão */
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  /* cupom */
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const r = await fetch("/api/public/checkout/coupon", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), total: certPrice }),
      });
      const data = await r.json();
      if (data.ok || data.valid) {
        setCouponDiscount(data.discount || 0);
        setCouponValid(true);
        toast({ title: `Cupom aplicado! Desconto de ${formatBRL(data.discount || 0)}` });
      } else {
        setCouponDiscount(0); setCouponValid(false);
        toast({ title: data.error || "Cupom inválido", variant: "destructive" });
      }
    } finally { setCouponLoading(false); }
  };

  const finalPrice = Math.max(0, certPrice + (dados.extendedWarranty ? LEALPLUS_PRICE : 0) - couponDiscount);
  const allowedMethods: PayMethod[] = finalPrice >= 150 ? ["pix", "boleto", "cartao"] : finalPrice >= 125 ? ["pix", "boleto"] : ["pix"];

  const [pay, setPay] = useState<PayState>({
    method: null, orderId: null, orderNumber: null,
    pixQr: null, pixCode: null, boletoUrl: null, boletoBarcode: null,
    isNewUser: false, loading: false, error: null,
  });

  const maskCardNumber = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 16);
    return d.replace(/(.{4})/g, "$1 ").trim();
  };
  const maskExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const submitOrder = async () => {
    if (!selectedMethod) { toast({ title: "Selecione a forma de pagamento", variant: "destructive" }); return; }
    if (selectedMethod === "cartao") {
      if (digits(cardNumber).length < 16) { toast({ title: "Número do cartão inválido", variant: "destructive" }); return; }
      if (!cardName.trim()) { toast({ title: "Nome no cartão obrigatório", variant: "destructive" }); return; }
      if (cardExpiry.length !== 5) { toast({ title: "Validade inválida", variant: "destructive" }); return; }
      if (cardCvv.length < 3) { toast({ title: "CVV inválido", variant: "destructive" }); return; }
    }
    setPay(p => ({ ...p, loading: true, error: null, method: selectedMethod }));

    const holderNome = isCnpjCert ? dados.repNome : dados.nome;
    const repDocEmissor = dados.repDocTipo !== "0" && dados.repDocOrgan && dados.repDocUf
      ? (dados.repDocOrgan + dados.repDocUf).toUpperCase() : undefined;

    const payload: Record<string, unknown> = {
      certificateId: Number(certId),
      personType: isCnpjCert ? "juridica" : "fisica",
      cpf: digits(bio.cpf),
      dataNascimento: parseBrDate(bio.dataNascimento),
      hasPsbio: bio.hasPsbio,
      customerName: holderNome,
      customerEmail: dados.email,
      customerPhone: digits(dados.phone),
      customerBirthDate: !isCnpjCert && dados.customerBirthDate ? parseBrDate(dados.customerBirthDate) : undefined,
      customerCpfCnpj: isCnpjCert ? digits(dados.cpfCnpj) : undefined,
      companyName: isCnpjCert ? dados.razaoSocial : undefined,
      inssNumber: dados.repNumeroTipo === "pis" ? dados.inssNumber || undefined : undefined,
      customerCei: dados.repNumeroTipo === "cei" ? dados.customerCei || undefined : undefined,
      customerNis: dados.repNumeroTipo === "nis" ? dados.customerNis || undefined : undefined,
      addressZipcode: digits(dados.repAddressZipcode) || undefined,
      addressStreet: dados.repAddressStreet || undefined,
      addressNumber: dados.repAddressNumber || undefined,
      addressComplement: dados.repAddressComplement || undefined,
      addressNeighborhood: dados.repAddressNeighborhood || undefined,
      addressCity: dados.repAddressCity || undefined,
      addressState: dados.repAddressState || undefined,
      addressIbge: dados.repAddressIbge || undefined,
      representanteCpf: digits(bio.cpf) || undefined,
      representanteNascimento: isCnpjCert
        ? (dados.repBirthDate ? parseBrDate(dados.repBirthDate) : parseBrDate(bio.dataNascimento))
        : (dados.customerBirthDate ? parseBrDate(dados.customerBirthDate) : undefined),
      representanteAddressZipcode: digits(dados.repAddressZipcode) || undefined,
      representanteAddressStreet: dados.repAddressStreet || undefined,
      representanteAddressNumber: dados.repAddressNumber || undefined,
      representanteAddressComplement: dados.repAddressComplement || undefined,
      representanteAddressNeighborhood: dados.repAddressNeighborhood || undefined,
      representanteAddressCity: dados.repAddressCity || undefined,
      representanteAddressState: dados.repAddressState || undefined,
      representanteDocTipo: dados.repDocTipo !== "0" ? dados.repDocTipo : undefined,
      representanteDocNumero: dados.repDocTipo !== "0" ? dados.repDocNumero || undefined : undefined,
      representanteDocEmissor: repDocEmissor,
      nfCnpj: nf.sameAsHolder ? (isCnpjCert ? digits(dados.cpfCnpj) : digits(bio.cpf)) || undefined : digits(nf.nfCpfCnpj) || undefined,
      nfNome: nf.sameAsHolder ? (isCnpjCert ? dados.razaoSocial : dados.nome) || undefined : nf.nfNome || undefined,
      nfZipcode: nf.sameAsHolder ? digits(dados.repAddressZipcode) || undefined : digits(nf.nfZipcode) || undefined,
      nfStreet: nf.sameAsHolder ? dados.repAddressStreet || undefined : nf.nfStreet || undefined,
      nfNumber: nf.sameAsHolder ? dados.repAddressNumber || undefined : nf.nfNumber || undefined,
      nfComplement: nf.sameAsHolder ? dados.repAddressComplement || undefined : nf.nfComplement || undefined,
      nfNeighborhood: nf.sameAsHolder ? dados.repAddressNeighborhood || undefined : nf.nfNeighborhood || undefined,
      nfCity: nf.sameAsHolder ? dados.repAddressCity || undefined : nf.nfCity || undefined,
      nfState: nf.sameAsHolder ? dados.repAddressState || undefined : nf.nfState || undefined,
      paymentMethod: selectedMethod,
      couponCode: couponValid ? couponCode.trim() : undefined,
      termsAccepted: true,
      extendedWarranty: dados.extendedWarranty,
      existingUserId: existingUserId ?? undefined,
    };

    try {
      const r = await fetch("/api/public/checkout/submit", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setPay(p => ({ ...p, loading: false, error: data.error || "Erro ao processar pedido." })); return;
      }
      setPay({
        method: selectedMethod,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        pixQr: data.pixQrCodeBase64 || null,
        pixCode: data.pixQrCode || null,
        boletoUrl: data.boletoUrl || null,
        boletoBarcode: data.boletoBarcode || null,
        isNewUser: data.isNewUser ?? false,
        loading: false, error: null,
      });
      // Após o submit o usuário já está autenticado na sessão — atualiza o contexto de auth
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      /* Cartão aprovado diretamente → vai pra tela de processando */
      if (selectedMethod === "cartao" && data.approved) {
        setStep("processando");
      } else {
        /* PIX/boleto → mostra QR/código na tela de pagamento e espera confirmação */
        setStep("processando");
      }
      window.scrollTo(0, 0);
    } catch {
      setPay(p => ({ ...p, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA "processando" — polling status automático
  ══════════════════════════════════════════════════════════════════════ */
  type ProcessStep = "aguardando_pagamento" | "processando_pagamento" | "registrando_provedor" | "gerando_protocolo" | "concluido" | "erro";

  const [processStep, setProcessStep] = useState<ProcessStep>("aguardando_pagamento");
  const [processoProtocolo, setProcessoProtocolo] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step !== "processando" || !pay.orderId) return;

    // Se cartão aprovado → começa em processando_pagamento
    if (pay.method === "cartao") setProcessStep("processando_pagamento");
    else setProcessStep("aguardando_pagamento");

    const poll = async () => {
      try {
        const r = await fetch(`/api/public/checkout/payment-status/${pay.orderId}`, { credentials: "include" });
        if (!r.ok) return;
        const data: { status: string; garProtocolo?: string | null; safewebSolicitacaoId?: string | null } = await r.json();
        const s = data.status;

        if (s === "pending_payment" || s === "created") {
          setProcessStep("aguardando_pagamento");
        } else if (s === "paid") {
          setProcessStep("processando_pagamento");
        } else if (s === "protocol_assigned" || s === "aguardando_validacao" || s === "emitido" || s === "completed") {
          const prot = data.garProtocolo || data.safewebSolicitacaoId || null;
          if (prot) {
            setProcessoProtocolo(prot);
            setProcessStep("concluido");
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          } else {
            setProcessStep("gerando_protocolo");
          }
        }
      } catch { /* ignore */ }
    };

    void poll();
    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, pay.orderId, pay.method]);

  const PROCESS_STEPS: { id: ProcessStep; label: string; desc: string }[] = [
    { id: "aguardando_pagamento", label: "Aguardando pagamento", desc: "Aguardando confirmação do pagamento..." },
    { id: "processando_pagamento", label: "Pagamento confirmado", desc: "Processando e registrando pedido..." },
    { id: "registrando_provedor", label: "Registrando no provedor", desc: "Enviando dados para a autoridade certificadora..." },
    { id: "gerando_protocolo", label: "Gerando protocolo", desc: "Emitindo protocolo de certificação..." },
    { id: "concluido", label: "Protocolo emitido!", desc: "Processo concluído com sucesso." },
  ];
  const processIdx = PROCESS_STEPS.findIndex(s => s.id === processStep);

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 5 — Documentos
  ══════════════════════════════════════════════════════════════════════ */
  const [docs, setDocs] = useState<{ rgFrente: File | null; rgVerso: File | null; selfie: File | null; extra: File | null }>({
    rgFrente: null, rgVerso: null, selfie: null, extra: null,
  });
  const [docsLoading, setDocsLoading] = useState(false);

  const uploadDocs = async () => {
    if (!pay.orderId) { setStep("agenda"); window.scrollTo(0, 0); return; }
    if (!docs.rgFrente && !docs.rgVerso && !docs.selfie) { setStep("agenda"); window.scrollTo(0, 0); return; }
    setDocsLoading(true);
    try {
      const fd = new FormData();
      if (docs.rgFrente) fd.append("rgFrente", docs.rgFrente);
      if (docs.rgVerso) fd.append("rgVerso", docs.rgVerso);
      if (docs.selfie) fd.append("selfie", docs.selfie);
      if (docs.extra) fd.append("extra", docs.extra);
      await fetch(`/api/orders/${pay.orderId}/documents`, { method: "POST", credentials: "include", body: fd });
    } finally {
      setDocsLoading(false); setStep("agenda"); window.scrollTo(0, 0);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     ETAPA 6 — Agendamento
  ══════════════════════════════════════════════════════════════════════ */
  const [locais, setLocais] = useState<Array<{ id?: number; localAtendimentoId?: number; nome?: string; NomeLocalAtendimento?: string }>>([]);
  const [locaisLoading, setLocaisLoading] = useState(false);
  const [selLocal, setSelLocal] = useState<(typeof locais)[0] | null>(null);
  const [agendaDate, setAgendaDate] = useState("");
  const [slots, setSlots] = useState<Array<{ horario?: string; horarioInicio?: string; horarioFim?: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selSlot, setSelSlot] = useState<(typeof slots)[0] | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaDone, setAgendaDone] = useState(false);

  useEffect(() => {
    if (step !== "agenda" || !pay.orderId) return;
    setLocaisLoading(true);
    fetch(`/api/public/checkout/slots/${pay.orderId}`, { credentials: "include" })
      .then(r => r.json()).then(d => setLocais(d.locais ?? []))
      .catch(() => setLocais([])).finally(() => setLocaisLoading(false));
  }, [step, pay.orderId]);

  const fetchSlots = async (local: typeof locais[0], date: string) => {
    if (!date || !local) return;
    setSlotsLoading(true); setSlots([]);
    try {
      const idL = local.localAtendimentoId ?? local.id ?? 0;
      const r = await fetch(`/api/public/checkout/slots/${pay.orderId}?idLocal=${idL}&date=${date}`, { credentials: "include" });
      const d = await r.json();
      setSlots(d.horarios ?? d.slots ?? []);
    } finally { setSlotsLoading(false); }
  };

  const handleAgendar = async () => {
    if (!selLocal || !agendaDate || !selSlot || !pay.orderId) return;
    setAgendaLoading(true);
    try {
      const idLocal = selLocal.localAtendimentoId ?? selLocal.id ?? 0;
      const localNome = selLocal.NomeLocalAtendimento ?? selLocal.nome ?? "";
      const horarioInicio = selSlot.horarioInicio ?? selSlot.horario ?? "";
      const r = await fetch(`/api/public/checkout/agendar/${pay.orderId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idLocal, localNome, data: agendaDate, horarioInicio, horarioFim: selSlot.horarioFim ?? "" }),
      });
      if (r.ok) setAgendaDone(true);
      else toast({ title: "Erro ao agendar. Tente novamente.", variant: "destructive" });
    } finally { setAgendaLoading(false); }
  };

  /* ══════════════════════════════════════════════════════════════════════
     RENDER helpers
  ══════════════════════════════════════════════════════════════════════ */
  if (certLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (certError || !cert) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="text-lg font-semibold">Certificado não encontrado.</p>
        <Button onClick={() => setLocation("/")}>Voltar ao início</Button>
      </div>
    </div>
  );

  const showCoupon = step === "pagamento";
  const showSidebar = true; // sempre 2 colunas

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* top bar */}
      <div className="bg-[#0f172a] text-xs text-gray-400 text-center py-2 px-4 hidden sm:block">
        Certificadora autorizada ICP-Brasil &nbsp;·&nbsp; Atendimento em todo o Brasil &nbsp;·&nbsp;
        <span className="text-[#f59e0b] font-medium">Emissão em até 24h úteis</span>
      </div>

      {/* header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} className="shrink-0">
            <LealCertLogo />
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span>Compra 100% segura · criptografada</span>
          </div>
          <a href="/dashboard" className="text-sm font-medium text-primary hover:underline shrink-0 flex items-center gap-1">
            Área do Cliente <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* main */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">

          {/* ── Bloco antigo de lookup/bio (substituído pelo layout 2 colunas abaixo) ── */}
          {false && (
            <div className="max-w-md mx-auto space-y-5">
              <div className="flex items-center justify-between bg-white rounded-xl border px-5 py-4 shadow-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Certificado</p>
                  <p className="font-bold text-foreground">{cert?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cert?.validityMonths} meses</p>
                </div>
                <p className="text-2xl font-extrabold text-primary">{formatBRL(certPrice)}</p>
              </div>

              <StepBar current={step} />

              {/* ── LOOKUP ── */}
              {step === "lookup" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />Identificação
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Informe seu CPF ou CNPJ para começar.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>CPF ou CNPJ *</Label>
                      <Input
                        value={lookupDoc}
                        onChange={e => { setLookupDoc(maskCpfCnpj(e.target.value)); setLookupResult(null); setLookupError(""); }}
                        placeholder="000.000.000-00 ou 00.000.000/0001-00"
                        inputMode="numeric"
                        onKeyDown={e => e.key === "Enter" && !lookupResult && doLookup()}
                      />
                    </div>

                    {lookupError && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 shrink-0" />{lookupError}
                      </p>
                    )}

                    {/* Já tem cadastro → pede senha */}
                    {lookupResult?.found && (
                      <div className="space-y-4 border rounded-xl p-4 bg-blue-50 border-blue-200">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-blue-900 text-sm">Cadastro encontrado</p>
                            {lookupResult?.name && <p className="text-xs text-blue-700 mt-0.5">Olá, <strong>{lookupResult?.name}</strong>!</p>}
                            <p className="text-xs text-blue-700 mt-1">Deseja usar seus dados já cadastrados?</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Senha</Label>
                          <div className="relative">
                            <Input
                              type={showPwd ? "text" : "password"}
                              value={lookupPassword}
                              onChange={e => { setLookupPassword(e.target.value); setLookupError(""); }}
                              placeholder="Sua senha"
                              className="pr-10"
                              onKeyDown={e => e.key === "Enter" && doLogin()}
                            />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(v => !v)}>
                              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={doLogin} disabled={loginLoading}>
                            {loginLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <LogIn className="h-4 w-4 mr-1.5" />}
                            Entrar e continuar
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={continueAsNew}>
                            <UserPlus className="h-4 w-4 mr-1.5" />Novo pedido
                          </Button>
                        </div>
                      </div>
                    )}

                    {!lookupResult && (
                      <Button className="w-full h-12 text-base" onClick={doLookup} disabled={lookupLoading || digits(lookupDoc).length < 11}>
                        {lookupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                        {lookupLoading ? "Verificando..." : "Verificar cadastro"}
                      </Button>
                    )}

                    {lookupResult?.found === false && (
                      <Button className="w-full h-12 text-base" onClick={continueAsNew}>
                        <UserPlus className="h-4 w-4 mr-2" />Criar cadastro e continuar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── BIO ── */}
              {step === "bio" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Fingerprint className="h-5 w-5 text-primary" />Validação Biométrica
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">CPF e data de nascimento do {isCnpjCert ? "representante legal" : "titular"}.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>CPF *</Label>
                      <Input value={bio.cpf} onChange={e => setBio(b => ({ ...b, cpf: maskCpf(e.target.value), error: null }))} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Nascimento *</Label>
                      <Input value={bio.dataNascimento} onChange={e => setBio(b => ({ ...b, dataNascimento: maskDate(e.target.value), error: null }))} placeholder="DD/MM/AAAA" maxLength={10} inputMode="numeric" />
                    </div>
                    {bio.error && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 shrink-0" />{bio.error}
                      </p>
                    )}
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                      <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">Dados usados exclusivamente para validação ICP-Brasil. Não compartilhados com terceiros.</p>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("lookup")} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                      {!termsAccepted ? (
                        <Button className="flex-1 h-11" onClick={() => setShowTerms(true)} disabled={bio.loading}>
                          <ShieldCheck className="h-4 w-4 mr-2" />Aceitar Termos
                        </Button>
                      ) : (
                        <Button className="flex-1 h-11" onClick={handleBioSubmit} disabled={bio.loading}>
                          {bio.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                          {bio.loading ? "Validando..." : "Validar e Continuar"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Layout 2 colunas — etapas dados → agendamento */}
          {showSidebar && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

              {/* ── Coluna esquerda (formulário) ── */}
              <div className="space-y-5">
                <StepBar current={step} />

                {/* ══ LOOKUP ══ */}
                {step === "lookup" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />Identificação
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">Selecione uma opção para começar.</p>
                    </CardHeader>
                    <CardContent className="space-y-5">

                      {/* Escolha inicial */}
                      {!lookupMode && (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => { setLookupMode("cliente"); setLookupResult(null); setLookupError(""); }}
                            className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted bg-white hover:border-primary hover:bg-blue-50/50 transition-all text-center"
                          >
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <LogIn className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Já sou cliente</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Já tenho cadastro</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLookupMode("novo"); setLookupResult(null); setLookupError(""); }}
                            className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted bg-white hover:border-primary hover:bg-blue-50/50 transition-all text-center"
                          >
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                              <UserPlus className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Novo cliente</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Primeiro acesso</p>
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Fluxo: já sou cliente */}
                      {lookupMode === "cliente" && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => { setLookupMode(null); setLookupResult(null); setLookupError(""); setLookupDoc(""); }} className="text-muted-foreground hover:text-foreground">
                              <ArrowLeft className="h-4 w-4" />
                            </button>
                            <p className="text-sm font-medium text-muted-foreground">Já sou cliente — entrar</p>
                          </div>

                          {/* Fase 1: digitar documento */}
                          {!lookupResult && (
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label>CPF ou CNPJ *</Label>
                                <Input
                                  value={lookupDoc}
                                  onChange={e => { setLookupDoc(maskCpfCnpj(e.target.value)); setLookupResult(null); setLookupError(""); }}
                                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                                  inputMode="numeric"
                                  onKeyDown={e => e.key === "Enter" && doLookup()}
                                  autoFocus
                                />
                              </div>
                              {lookupError && (
                                <p className="text-sm text-destructive flex items-center gap-1.5"><XCircle className="h-4 w-4 shrink-0" />{lookupError}</p>
                              )}
                              <Button className="w-full h-11" onClick={doLookup} disabled={lookupLoading || digits(lookupDoc).length < 11}>
                                {lookupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                                {lookupLoading ? "Verificando..." : "Verificar cadastro"}
                              </Button>
                            </div>
                          )}

                          {/* Fase 2: cadastro encontrado → senha */}
                          {lookupResult?.found && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="text-sm font-semibold text-emerald-800">Cadastro encontrado!</p>
                                  {lookupResult.name && <p className="text-xs text-emerald-700">Olá, <strong>{lookupResult.name}</strong>!</p>}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Senha *</Label>
                                <div className="relative">
                                  <Input
                                    type={showPwd ? "text" : "password"}
                                    value={lookupPassword}
                                    onChange={e => { setLookupPassword(e.target.value); setLookupError(""); }}
                                    placeholder="Sua senha de acesso"
                                    className="pr-10"
                                    onKeyDown={e => e.key === "Enter" && doLogin()}
                                    autoFocus
                                  />
                                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPwd(v => !v)}>
                                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </div>
                              </div>
                              {lookupError && (
                                <p className="text-sm text-destructive flex items-center gap-1.5"><XCircle className="h-4 w-4 shrink-0" />{lookupError}</p>
                              )}
                              <Button className="w-full h-11" onClick={doLogin} disabled={loginLoading}>
                                {loginLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                                {loginLoading ? "Entrando..." : "Entrar e continuar"}
                              </Button>
                              <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground text-center" onClick={() => { setLookupResult(null); setLookupDoc(""); }}>
                                Usar outro documento
                              </button>
                            </div>
                          )}

                          {/* Fase 2b: cadastro não encontrado */}
                          {lookupResult?.found === false && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                <p className="text-sm text-amber-800">Nenhum cadastro encontrado para este documento.</p>
                              </div>
                              <Button className="w-full h-11" onClick={() => { setLookupMode("novo"); setLookupResult(null); setLookupError(""); }}>
                                <UserPlus className="h-4 w-4 mr-2" />Criar novo cadastro
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fluxo: novo cliente */}
                      {lookupMode === "novo" && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setLookupMode(null)} className="text-muted-foreground hover:text-foreground">
                              <ArrowLeft className="h-4 w-4" />
                            </button>
                            <p className="text-sm font-medium text-muted-foreground">Novo cliente</p>
                          </div>
                          <p className="text-sm text-foreground font-medium">Deseja se cadastrar com:</p>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setNewClientType("cpf")}
                              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${newClientType === "cpf" ? "border-primary bg-blue-50 text-primary" : "border-muted bg-white text-muted-foreground hover:border-primary/50"}`}
                            >
                              <User className="h-6 w-6" />
                              <div className="text-center">
                                <p className="font-semibold text-sm">CPF</p>
                                <p className="text-xs mt-0.5">Pessoa Física</p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewClientType("cnpj")}
                              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${newClientType === "cnpj" ? "border-primary bg-blue-50 text-primary" : "border-muted bg-white text-muted-foreground hover:border-primary/50"}`}
                            >
                              <Building2 className="h-6 w-6" />
                              <div className="text-center">
                                <p className="font-semibold text-sm">CNPJ</p>
                                <p className="text-xs mt-0.5">Pessoa Jurídica</p>
                              </div>
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground bg-slate-50 rounded-lg px-3 py-2">
                            {newClientType === "cpf"
                              ? "Você precisará do seu CPF e data de nascimento para a validação biométrica ICP-Brasil."
                              : "Você precisará do CPF do representante legal da empresa e data de nascimento para validação ICP-Brasil."}
                          </p>
                          <Button className="w-full h-11" onClick={continueAsNew}>
                            Continuar <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ══ BIO ══ */}
                {step === "bio" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Fingerprint className="h-5 w-5 text-primary" />Validação Biométrica
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">CPF e data de nascimento do {isCnpjCert ? "representante legal" : "titular"}.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>CPF *</Label>
                        <Input value={bio.cpf} onChange={e => setBio(b => ({ ...b, cpf: maskCpf(e.target.value), error: null }))} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" autoFocus />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Nascimento *</Label>
                        <Input value={bio.dataNascimento} onChange={e => setBio(b => ({ ...b, dataNascimento: maskDate(e.target.value), error: null }))} placeholder="DD/MM/AAAA" maxLength={10} inputMode="numeric" />
                      </div>
                      {bio.error && (
                        <p className="text-sm text-destructive flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 shrink-0" />{bio.error}
                        </p>
                      )}
                      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                        <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-700">Dados usados exclusivamente para validação ICP-Brasil. Não compartilhados com terceiros.</p>
                      </div>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStep("lookup")} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                        {!termsAccepted ? (
                          <Button className="flex-1 h-11" onClick={() => setShowTerms(true)} disabled={bio.loading}>
                            <ShieldCheck className="h-4 w-4 mr-2" />Aceitar Termos
                          </Button>
                        ) : (
                          <Button className="flex-1 h-11" onClick={handleBioSubmit} disabled={bio.loading}>
                            {bio.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                            {bio.loading ? "Validando..." : "Validar e Continuar"}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ══ DADOS ══ */}
                {step === "dados" && (
                  <div className="space-y-4">
                    {/* Banner de dados anteriores */}
                    {prevOrderData && prevOrderUsed === null && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-blue-900 text-sm">Dados de pedido anterior encontrados</p>
                            <p className="text-xs text-blue-700 mt-0.5">Encontramos endereço e documento de um pedido anterior para este CPF. Deseja utilizar os mesmos dados?</p>
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" className="h-8 text-xs" onClick={() => {
                                const p = prevOrderData;
                                setDados(d => ({
                                  ...d,
                                  email: p.customerEmail || d.email,
                                  phone: p.customerPhone ? maskPhone(p.customerPhone) : d.phone,
                                  repDocTipo: p.representanteDocTipo || d.repDocTipo,
                                  repDocNumero: p.representanteDocNumero || d.repDocNumero,
                                  repDocOrgan: p.representanteDocEmissor || d.repDocOrgan,
                                  repAddressZipcode: p.addressZipcode ? maskCep(p.addressZipcode) : d.repAddressZipcode,
                                  repAddressStreet: p.addressStreet || d.repAddressStreet,
                                  repAddressNumber: p.addressNumber || d.repAddressNumber,
                                  repAddressComplement: p.addressComplement || d.repAddressComplement,
                                  repAddressNeighborhood: p.addressNeighborhood || d.repAddressNeighborhood,
                                  repAddressCity: p.addressCity || d.repAddressCity,
                                  repAddressState: p.addressState || d.repAddressState,
                                }));
                                setRepCepFilled(true);
                                setPrevOrderUsed(true);
                              }}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Sim, usar esses dados
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPrevOrderUsed(false)}>
                                Não, preencher manualmente
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {prevOrderData && prevOrderUsed === true && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Dados do pedido anterior aplicados. Confira e ajuste se necessário.</span>
                        <button className="ml-auto text-xs underline text-emerald-600 hover:text-emerald-800" onClick={() => setPrevOrderUsed(null)}>desfazer</button>
                      </div>
                    )}
                    {!isCnpjCert ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />Dados do Titular</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>CPF *</Label>
                              <Input value={maskCpf(bio.cpf)} readOnly className="bg-muted/50 cursor-not-allowed" />
                              <p className="text-xs text-muted-foreground">Preenchido da validação biométrica.</p>
                            </div>
                            <div className="space-y-2">
                              <Label>Data de Nascimento *</Label>
                              <Input value={bio.dataNascimento} readOnly className="bg-muted/50 cursor-not-allowed" />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label className="flex items-center gap-1.5">Nome Completo *
                                <span className="text-xs text-emerald-600 font-normal">(Receita Federal)</span>
                              </Label>
                              <Input value={dados.nome} readOnly className="bg-muted/50 cursor-not-allowed" />
                              <p className="text-xs text-muted-foreground">Preenchido automaticamente pela consulta RFB.</p>
                            </div>
                            <div className="space-y-2">
                              <Label>E-mail *</Label>
                              <Input type="email" value={dados.email} onChange={e => setD("email", e.target.value)} placeholder="seu@email.com" />
                            </div>
                            <div className="space-y-2">
                              <Label>Telefone / WhatsApp *</Label>
                              <Input value={dados.phone} onChange={e => setD("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
                            </div>
                          </div>
                          {/* CEI/NIS/PIS */}
                          <div className="space-y-3 pt-2 border-t">
                            <p className="text-sm font-medium text-muted-foreground">Número Adicional <span className="text-xs">(opcional — CEI, NIS ou PIS)</span></p>
                            <div className="flex flex-wrap gap-4">
                              {(["cei","nis","pis"] as const).map(t => (
                                <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                                  <input type="radio" name="numTipo" value={t} checked={dados.repNumeroTipo === t}
                                    onChange={() => setDados(d => ({ ...d, repNumeroTipo: t, customerCei: "", customerNis: "", inssNumber: "" }))} className="accent-primary" />
                                  {t.toUpperCase()}
                                </label>
                              ))}
                              {dados.repNumeroTipo && <button type="button" onClick={() => setDados(d => ({ ...d, repNumeroTipo: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>}
                            </div>
                            {dados.repNumeroTipo === "cei" && <Input value={dados.customerCei} onChange={e => setD("customerCei", e.target.value.replace(/\D/g,"").slice(0,12))} placeholder="CEI — 12 dígitos" inputMode="numeric" />}
                            {dados.repNumeroTipo === "nis" && <Input value={dados.customerNis} onChange={e => setD("customerNis", e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="NIS — 11 dígitos" inputMode="numeric" />}
                            {dados.repNumeroTipo === "pis" && <Input value={dados.inssNumber} onChange={e => setD("inssNumber", e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="PIS — 11 dígitos" inputMode="numeric" />}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {/* Empresa */}
                        <Card>
                          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Dados da Empresa</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>CNPJ *</Label>
                                <Input value={dados.cpfCnpj} onChange={e => {
                                  const v = maskCnpj(e.target.value); setD("cpfCnpj", v); setCnpjRfbState(null);
                                  if (digits(v).length === 14 && digits(repCpfFixed).length === 11 && dados.repBirthDate.length === 10)
                                    void triggerCnpjRfb(v, repCpfFixed, dados.repBirthDate);
                                }} placeholder="00.000.000/0001-00" inputMode="numeric" maxLength={18} />
                              </div>
                              <div className="space-y-2">
                                <Label className="flex items-center gap-1">Razão Social *
                                  {cnpjRfbState === "loading" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                  {cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                </Label>
                                <Input value={dados.razaoSocial} onChange={e => setD("razaoSocial", e.target.value)}
                                  className={cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && dados.razaoSocial ? "bg-emerald-50 border-emerald-200" : ""}
                                  placeholder={cnpjRfbState === "loading" ? "Consultando RFB..." : "Razão Social"} />
                              </div>
                              <div className="space-y-2">
                                <Label>E-mail *</Label>
                                <Input type="email" value={dados.email} onChange={e => setD("email", e.target.value)} placeholder="empresa@email.com" />
                              </div>
                              <div className="space-y-2">
                                <Label>Telefone *</Label>
                                <Input value={dados.phone} onChange={e => setD("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        {/* Representante */}
                        <Card>
                          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />Representante Legal</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>CPF do Representante *</Label>
                                <Input value={maskCpf(repCpfFixed)} readOnly className="bg-muted/50 cursor-not-allowed" />
                              </div>
                              <div className="space-y-2">
                                <Label>Data de Nascimento *</Label>
                                <Input value={bio.dataNascimento} readOnly className="bg-muted/50 cursor-not-allowed" />
                                <p className="text-xs text-muted-foreground">Da validação biométrica.</p>
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label className="flex items-center gap-1.5">Nome Completo *
                                  <span className="text-xs text-emerald-600 font-normal">(Receita Federal)</span>
                                </Label>
                                <Input value={dados.repNome} readOnly className="bg-muted/50 cursor-not-allowed" />
                                <p className="text-xs text-muted-foreground">Preenchido automaticamente pela consulta RFB.</p>
                              </div>
                              {/* Status RFB */}
                              {cnpjRfbState === "loading" && (
                                <div className="sm:col-span-2 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span>Consultando Receita Federal...</span>
                                </div>
                              )}
                              {cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && (
                                <div className="sm:col-span-2 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  <span>RFB confirmada — <strong>{(cnpjRfbState as { ok: true; razaoSocial: string }).razaoSocial}</strong></span>
                                </div>
                              )}
                              {cnpjRfbState && cnpjRfbState !== "loading" && !(cnpjRfbState as { ok: boolean }).ok && (
                                <div className="sm:col-span-2 flex items-center gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                  <XCircle className="h-4 w-4 shrink-0" />
                                  <span>{(cnpjRfbState as { ok: false; mensagem: string }).mensagem}</span>
                                </div>
                              )}
                            </div>
                            {/* CEI/NIS/PIS */}
                            <div className="space-y-3 pt-2 border-t">
                              <p className="text-sm font-medium text-muted-foreground">Número Adicional <span className="text-xs">(opcional)</span></p>
                              <div className="flex flex-wrap gap-4">
                                {(["cei","nis","pis"] as const).map(t => (
                                  <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input type="radio" name="numTipo" value={t} checked={dados.repNumeroTipo === t}
                                      onChange={() => setDados(d => ({ ...d, repNumeroTipo: t, customerCei: "", customerNis: "", inssNumber: "" }))} className="accent-primary" />
                                    {t.toUpperCase()}
                                  </label>
                                ))}
                                {dados.repNumeroTipo && <button type="button" onClick={() => setDados(d => ({ ...d, repNumeroTipo: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>}
                              </div>
                              {dados.repNumeroTipo === "cei" && <Input value={dados.customerCei} onChange={e => setD("customerCei", e.target.value.replace(/\D/g,"").slice(0,12))} placeholder="CEI — 12 dígitos" inputMode="numeric" />}
                              {dados.repNumeroTipo === "nis" && <Input value={dados.customerNis} onChange={e => setD("customerNis", e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="NIS — 11 dígitos" inputMode="numeric" />}
                              {dados.repNumeroTipo === "pis" && <Input value={dados.inssNumber} onChange={e => setD("inssNumber", e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="PIS — 11 dígitos" inputMode="numeric" />}
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}

                    {/* Documento de Identificação */}
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Documento de Identificação *</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Tipo *</Label>
                          <select value={dados.repDocTipo} onChange={e => setDados(d => ({ ...d, repDocTipo: e.target.value, repDocNumero: "", repDocOrgan: "", repDocUf: "" }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                            <option value="0">Selecione</option>
                            <option value="1">RG</option><option value="2">RNE</option>
                            <option value="3">Passaporte</option><option value="4">CNH</option>
                          </select>
                        </div>
                        {dados.repDocTipo !== "0" && (
                          <>
                            <div className="space-y-2">
                              <Label>Número *</Label>
                              <Input value={dados.repDocNumero} onChange={e => setD("repDocNumero", e.target.value)} placeholder={dados.repDocTipo === "3" ? "Ex: BR123456" : "Ex: 12.345.678-9"} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Órgão Expedidor <span className="text-xs text-muted-foreground">(máx. 4)</span></Label>
                                <Input value={dados.repDocOrgan} onChange={e => setD("repDocOrgan", e.target.value.toUpperCase().slice(0,4))} placeholder="SSP" maxLength={4} />
                              </div>
                              <div className="space-y-2">
                                <Label>UF</Label>
                                <select value={dados.repDocUf} onChange={e => setD("repDocUf", e.target.value)}
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                  <option value="">Selecione</option>
                                  {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                </select>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Endereço */}
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />{isCnpjCert ? "Endereço do Representante *" : "Endereço *"}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label>CEP *</Label>
                            <div className="relative">
                              <Input value={dados.repAddressZipcode} onChange={e => { const m = maskCep(e.target.value); setD("repAddressZipcode", m); fetchRepCep(m); }}
                                placeholder="00000-000" maxLength={9} inputMode="numeric" className="pr-9" />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                {repCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Logradouro *</Label>
                            <Input value={dados.repAddressStreet} onChange={e => setD("repAddressStreet", e.target.value)} className={repCepFilled && dados.repAddressStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                          </div>
                          <div className="space-y-2">
                            <Label>Número *</Label>
                            <Input value={dados.repAddressNumber} onChange={e => setD("repAddressNumber", e.target.value)} placeholder="123" />
                          </div>
                          <div className="space-y-2">
                            <Label>Complemento</Label>
                            <Input value={dados.repAddressComplement} onChange={e => setD("repAddressComplement", e.target.value)} placeholder="Apto..." maxLength={20} />
                          </div>
                          <div className="space-y-2">
                            <Label>Bairro</Label>
                            <Input value={dados.repAddressNeighborhood} onChange={e => setD("repAddressNeighborhood", e.target.value)} className={repCepFilled && dados.repAddressNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                          </div>
                          <div className="space-y-2">
                            <Label>Cidade *</Label>
                            <Input value={dados.repAddressCity} onChange={e => setD("repAddressCity", e.target.value)} className={repCepFilled && dados.repAddressCity ? "bg-emerald-50 border-emerald-200" : ""} />
                          </div>
                          <div className="space-y-2">
                            <Label>UF *</Label>
                            <Input value={dados.repAddressState} onChange={e => setD("repAddressState", e.target.value.toUpperCase())} maxLength={2} placeholder="SP" className={repCepFilled && dados.repAddressState ? "bg-emerald-50 border-emerald-200" : ""} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("bio")} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                      <Button className="flex-1 h-12 text-base" onClick={goToNf} disabled={isCnpjCert && cnpjRfbState === "loading"}>
                        Avançar <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ══ NOTA FISCAL ══ */}
                {step === "nf" && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Dados para Nota Fiscal</CardTitle>
                        <p className="text-sm text-muted-foreground">A NF será emitida com esses dados.</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border cursor-pointer" onClick={() => {
                          const same = !nf.sameAsHolder;
                          setNf(prev => ({
                            ...prev, sameAsHolder: same,
                            ...(same ? {
                              nfCpfCnpj: isCnpjCert ? maskCnpj(dados.cpfCnpj) : maskCpf(bio.cpf),
                              nfNome: isCnpjCert ? dados.razaoSocial : dados.nome,
                              nfZipcode: maskCep(dados.repAddressZipcode),
                              nfStreet: dados.repAddressStreet, nfNumber: dados.repAddressNumber,
                              nfComplement: dados.repAddressComplement,
                              nfNeighborhood: dados.repAddressNeighborhood,
                              nfCity: dados.repAddressCity, nfState: dados.repAddressState,
                              nfIbge: dados.repAddressIbge,
                            } : {}),
                          }));
                        }}>
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={nf.sameAsHolder} readOnly />
                          <span className="text-sm font-medium">Usar dados do titular</span>
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
                                <Input value={nf.nfNome} onChange={e => setNfField("nfNome", e.target.value)} />
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-2">
                                <Label>CEP *</Label>
                                <div className="relative">
                                  <Input value={nf.nfZipcode} onChange={e => { const m = maskCep(e.target.value); setNfField("nfZipcode", m); fetchNfCep(m); }} placeholder="00000-000" maxLength={9} inputMode="numeric" className="pr-9" />
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                    {nfCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label>Logradouro *</Label>
                                <Input value={nf.nfStreet} onChange={e => setNfField("nfStreet", e.target.value)} className={nfCepFilled && nf.nfStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                              </div>
                              <div className="space-y-2"><Label>Número *</Label><Input value={nf.nfNumber} onChange={e => setNfField("nfNumber", e.target.value)} /></div>
                              <div className="space-y-2"><Label>Complemento</Label><Input value={nf.nfComplement} onChange={e => setNfField("nfComplement", e.target.value)} /></div>
                              <div className="space-y-2"><Label>Bairro</Label><Input value={nf.nfNeighborhood} onChange={e => setNfField("nfNeighborhood", e.target.value)} className={nfCepFilled && nf.nfNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} /></div>
                              <div className="space-y-2"><Label>Cidade *</Label><Input value={nf.nfCity} onChange={e => setNfField("nfCity", e.target.value)} className={nfCepFilled && nf.nfCity ? "bg-emerald-50 border-emerald-200" : ""} /></div>
                              <div className="space-y-2"><Label>UF *</Label><Input value={nf.nfState} onChange={e => setNfField("nfState", e.target.value.toUpperCase())} maxLength={2} className={nfCepFilled && nf.nfState ? "bg-emerald-50 border-emerald-200" : ""} /></div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("dados")} className="w-1/3"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                      <Button className="flex-1 h-12 text-base" onClick={goToLealPlus}>Avançar <ArrowRight className="h-4 w-4 ml-2" /></Button>
                    </div>
                  </div>
                )}

                {/* ══ LEAL PLUS ══ */}
                {step === "lealplus" && (
                  <div className="space-y-6">
                    {/* Header */}
                    <div>
                      <h2 className="text-2xl font-bold text-[#0d7c6b]">Segurança</h2>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                      {/* Título Leal Plus */}
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Lock className="h-4 w-4 text-slate-600" />
                        </div>
                        <span className="font-bold text-base">Leal Plus</span>
                        <div className="group relative">
                          <button className="h-5 w-5 rounded-full border border-slate-300 text-slate-400 text-xs flex items-center justify-center hover:bg-slate-100 transition-colors">?</button>
                          <div className="absolute left-6 top-0 z-10 hidden group-hover:block w-64 rounded-xl bg-slate-800 text-white text-xs p-3 shadow-xl">
                            Garantia de reemissão simplificada do certificado em caso de perda, esquecimento de senha ou atualização de dados.
                          </div>
                        </div>
                      </div>

                      {/* Descrição */}
                      <div className="space-y-2 text-sm text-slate-700">
                        <p className="font-semibold">Reemissão simplificada do seu certificado digital em caso de perda ou atualização!</p>
                        <p className="text-slate-500 leading-relaxed">
                          Com o Leal Plus, você pode garantir a segurança do seu Certificado Digital sem preocupações!
                          Se você perder sua senha, esquecê-la ou precisar atualizar suas informações, a reemissão é
                          gratuita! Tranquilidade e segurança digital na palma da sua mão.
                        </p>
                      </div>

                      {/* Separador */}
                      <Separator />

                      {/* Seleção do produto */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Escolha para qual produto você quer o Leal Plus.</p>
                        <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:border-primary/40 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={dados.extendedWarranty}
                              onChange={e => setD("extendedWarranty", e.target.checked)}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="text-sm font-medium uppercase tracking-wide">
                              {cert?.product?.toUpperCase().includes("CNPJ") || cert?.name?.toUpperCase().includes("CNPJ")
                                ? "CERTIFICADO LEAL PLUS PJ A3"
                                : "CERTIFICADO LEAL PLUS PF A1"}
                            </span>
                          </div>
                          <span className="text-sm font-bold">{formatBRL(LEALPLUS_PRICE)}</span>
                        </label>

                        {/* Pular */}
                        <button
                          type="button"
                          onClick={() => { setD("extendedWarranty", false); goToPagamento(); }}
                          className="w-full mt-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
                        >
                          Pular essa etapa
                        </button>
                      </div>
                    </div>

                    {/* Botão principal */}
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("nf")} className="w-1/3">
                        <ArrowLeft className="h-4 w-4 mr-1" />Voltar
                      </Button>
                      <Button
                        className="flex-1 h-12 text-base bg-[#0d7c6b] hover:bg-[#0a6358] text-white"
                        onClick={goToPagamento}
                        disabled={!dados.extendedWarranty}
                      >
                        Adquirir o Leal Plus e prosseguir <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ══ PAGAMENTO ══ */}
                {step === "pagamento" && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle>Escolha a forma de pagamento</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {/* PIX */}
                        {allowedMethods.includes("pix") && (
                          <div className={`rounded-xl border-2 overflow-hidden transition-colors ${selectedMethod === "pix" ? "border-emerald-500" : "border-muted hover:border-emerald-300"}`}>
                            <button type="button" className="w-full flex items-center gap-4 px-5 py-4 text-left" onClick={() => setSelectedMethod("pix")}>
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedMethod === "pix" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`}>
                                {selectedMethod === "pix" && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <QrCode className="h-5 w-5 text-emerald-600" />
                              </div>
                              <div className="flex-1">
                                <p className="font-semibold">Pagamento com Pix</p>
                                <p className="text-xs text-muted-foreground">Aprovação imediata · sem taxas</p>
                              </div>
                            </button>
                            {selectedMethod === "pix" && (
                              <div className="px-5 pb-4 bg-emerald-50 border-t border-emerald-100 text-sm text-emerald-800 space-y-1.5">
                                <p>Pague com Pix em qualquer dia e a qualquer hora! O pagamento é instantâneo e pode ser feito em poucos segundos.</p>
                                <ol className="list-decimal pl-4 space-y-0.5 text-xs text-emerald-700">
                                  <li>Ao clicar em <strong>Finalizar compra</strong>, será gerado um QR Code e um PIX Copia e Cola</li>
                                  <li>Abra o app do seu banco e entre no Pix</li>
                                  <li>Escaneie o QR Code ou cole o código</li>
                                  <li>Confira as informações e conclua</li>
                                </ol>
                                <p className="text-xs text-emerald-600 mt-1">*Esta página será atualizada automaticamente ao identificar o pagamento.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Boleto */}
                        {allowedMethods.includes("boleto") && (
                          <div className={`rounded-xl border-2 overflow-hidden transition-colors ${selectedMethod === "boleto" ? "border-amber-500" : "border-muted hover:border-amber-300"}`}>
                            <button type="button" className="w-full flex items-center gap-4 px-5 py-4 text-left" onClick={() => setSelectedMethod("boleto")}>
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedMethod === "boleto" ? "border-amber-500 bg-amber-500" : "border-muted-foreground"}`}>
                                {selectedMethod === "boleto" && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                <Receipt className="h-5 w-5 text-amber-600" />
                              </div>
                              <div className="flex-1">
                                <p className="font-semibold">Pagamento com Boleto</p>
                                <p className="text-xs text-muted-foreground">Prazo de até 3 dias úteis</p>
                              </div>
                            </button>
                            {selectedMethod === "boleto" && (
                              <div className="px-5 pb-4 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
                                <p>* Para que haja a liberação do pedido, após pagar o boleto o prazo bancário para sua compensação é de até 3 dias úteis</p>
                                <p className="mt-1">* Com o PIX o pagamento é instantâneo, prático e pode ser feito em poucos segundos.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Cartão */}
                        {allowedMethods.includes("cartao") && (
                          <div className={`rounded-xl border-2 overflow-hidden transition-colors ${selectedMethod === "cartao" ? "border-blue-500" : "border-muted hover:border-blue-300"}`}>
                            <button type="button" className="w-full flex items-center gap-4 px-5 py-4 text-left" onClick={() => setSelectedMethod("cartao")}>
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedMethod === "cartao" ? "border-blue-500 bg-blue-500" : "border-muted-foreground"}`}>
                                {selectedMethod === "cartao" && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                <CreditCard className="h-5 w-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <p className="font-semibold">Pagamento com Cartão de Crédito</p>
                                <p className="text-xs text-muted-foreground">Aprovação imediata</p>
                              </div>
                            </button>
                            {selectedMethod === "cartao" && (
                              <div className="px-5 pb-5 bg-blue-50 border-t border-blue-100 space-y-3 pt-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs">Número do Cartão</Label>
                                    <Input value={cardNumber} onChange={e => setCardNumber(maskCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" inputMode="numeric" maxLength={19} className="font-mono" />
                                  </div>
                                  <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs">Nome completo (conforme no cartão)</Label>
                                    <Input value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())} placeholder="Nome no cartão" className="uppercase" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Validade</Label>
                                    <Input value={cardExpiry} onChange={e => setCardExpiry(maskExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} inputMode="numeric" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">CVV</Label>
                                    <Input value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="000" inputMode="numeric" maxLength={4} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {pay.error && (
                      <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><span className="text-destructive">{pay.error}</span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("lealplus")} className="w-1/3" disabled={pay.loading}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                      <Button className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700" onClick={submitOrder} disabled={pay.loading || !selectedMethod}>
                        {pay.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                        {pay.loading ? "Processando..." : "Finalizar compra"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ══ PROCESSANDO ══ */}
                {step === "processando" && (
                  <div className="space-y-5">
                    {/* PIX — mostra QR enquanto aguarda */}
                    {pay.method === "pix" && pay.pixQr && processStep === "aguardando_pagamento" && (
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-600" />QR Code PIX</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-center">
                          <img src={`data:image/png;base64,${pay.pixQr}`} alt="QR Code PIX" className="mx-auto w-52 h-52 rounded-xl border shadow" />
                          {pay.pixCode && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">Pix Copia e Cola:</p>
                              <div className="flex gap-2">
                                <Input value={pay.pixCode} readOnly className="font-mono text-xs" />
                                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(pay.pixCode!); toast({ title: "Código copiado!" }); }}>Copiar</Button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-left">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span>O QR Code expira em 30 minutos. Esta página se atualiza automaticamente ao detectar o pagamento.</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Boleto */}
                    {pay.method === "boleto" && processStep === "aguardando_pagamento" && (
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-amber-600" />Boleto Bancário</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {pay.boletoBarcode && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">Código de barras:</p>
                              <div className="flex gap-2">
                                <Input value={pay.boletoBarcode} readOnly className="font-mono text-xs" />
                                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(pay.boletoBarcode!); toast({ title: "Código copiado!" }); }}>Copiar</Button>
                              </div>
                            </div>
                          )}
                          {pay.boletoUrl && (
                            <Button className="w-full" variant="outline" asChild>
                              <a href={pay.boletoUrl} target="_blank" rel="noopener noreferrer"><Receipt className="h-4 w-4 mr-2" />Visualizar / Imprimir Boleto</a>
                            </Button>
                          )}
                          <p className="text-xs text-muted-foreground bg-slate-50 border rounded-lg px-3 py-2">Validade: 3 dias úteis. Esta página se atualiza ao detectar o pagamento.</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Status automático */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <RefreshCw className={`h-5 w-5 text-primary ${processStep !== "concluido" ? "animate-spin" : ""}`} />
                          {processStep === "concluido" ? "Processo concluído!" : "Processando pedido..."}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">Acompanhe o andamento automático abaixo.</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {PROCESS_STEPS.filter(s => s.id !== "erro").map((ps, i) => {
                          const done = processIdx > i;
                          const active = processIdx === i;
                          return (
                            <div key={ps.id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${active ? "bg-primary/5 border border-primary/20" : done ? "opacity-70" : "opacity-40"}`}>
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${done ? "bg-emerald-500" : active ? "bg-primary" : "bg-muted"}`}>
                                {done ? <CheckCircle2 className="h-4 w-4 text-white" /> :
                                 active ? <Loader2 className="h-4 w-4 text-white animate-spin" /> :
                                 <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${done ? "text-emerald-700" : active ? "text-primary" : "text-muted-foreground"}`}>{ps.label}</p>
                                {active && <p className="text-xs text-muted-foreground mt-0.5">{ps.desc}</p>}
                                {done && ps.id === "concluido" && processoProtocolo && (
                                  <p className="text-xs text-emerald-600 mt-0.5">Protocolo: <strong>{processoProtocolo}</strong></p>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {processStep === "concluido" && (
                          <div className="pt-2 space-y-2">
                            {pay.isNewUser && (
                              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                Sua senha temporária foi enviada por e-mail. Use-a para acessar o sistema.
                              </div>
                            )}
                            <Button className="w-full" onClick={() => { setStep("docs"); window.scrollTo(0,0); }}>
                              <Upload className="h-4 w-4 mr-2" />Enviar documentos
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ══ DOCUMENTOS ══ */}
                {step === "docs" && (
                  <div className="space-y-4">
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardContent className="pt-5 flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-semibold text-emerald-800">Pedido #{pay.orderNumber} criado!</p>
                          <p className="text-sm text-emerald-700">Envie seus documentos abaixo ou faça isso pelo sistema após o login.</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />Documentos</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {([
                          { key: "rgFrente", label: "RG — Frente *" },
                          { key: "rgVerso", label: "RG — Verso *" },
                          { key: "selfie", label: "Selfie com documento" },
                          ...(isCnpjCert ? [{ key: "extra", label: "Cartão CNPJ / Contrato Social" }] : []),
                        ] as { key: keyof typeof docs; label: string }[]).map(({ key, label }) => (
                          <div key={key}>
                            <Label className="text-sm mb-1 block">{label}</Label>
                            <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${docs[key] ? "border-emerald-400 bg-emerald-50" : "border-muted hover:border-primary/40"}`}>
                              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm text-muted-foreground truncate">{docs[key] ? (docs[key] as File).name : "Clique para selecionar"}</span>
                              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0] ?? null; setDocs(d => ({ ...d, [key]: f })); }} />
                            </label>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    <Button className="w-full h-12 text-base" onClick={uploadDocs} disabled={docsLoading}>
                      {docsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
                      {docsLoading ? "Enviando..." : "Avançar para Agendamento"}
                    </Button>
                    <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => { setStep("agenda"); window.scrollTo(0,0); }}>
                      Pular — enviar depois pelo sistema
                    </Button>
                  </div>
                )}

                {/* ══ AGENDAMENTO ══ */}
                {step === "agenda" && (
                  <div className="space-y-4">
                    {agendaDone ? (
                      <Card className="border-emerald-200 bg-emerald-50">
                        <CardContent className="pt-6 text-center space-y-3">
                          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
                          <p className="text-xl font-bold text-emerald-800">Tudo certo!</p>
                          <p className="text-sm text-emerald-700">Atendimento agendado. Você receberá confirmação por e-mail.</p>
                          <Button className="w-full" onClick={() => setLocation("/entrar")}>Acessar minha conta</Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <Card>
                          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Agendar Atendimento</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            {locaisLoading ? (
                              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                            ) : locais.length === 0 ? (
                              <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <span>Nenhum local disponível. Agende pelo sistema após o login.</span>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  <Label>Local de Atendimento</Label>
                                  {locais.map((l, i) => (
                                    <button key={i} type="button"
                                      onClick={() => { setSelLocal(l); setSelSlot(null); setSlots([]); if (agendaDate) fetchSlots(l, agendaDate); }}
                                      className={`w-full text-left border rounded-lg px-4 py-3 text-sm transition-colors ${selLocal === l ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/40"}`}>
                                      <MapPin className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                                      {l.NomeLocalAtendimento ?? l.nome}
                                    </button>
                                  ))}
                                </div>
                                {selLocal && (
                                  <div className="space-y-2">
                                    <Label>Data</Label>
                                    <Input type="date" value={agendaDate} min={new Date().toISOString().slice(0,10)}
                                      onChange={e => { setAgendaDate(e.target.value); setSelSlot(null); fetchSlots(selLocal, e.target.value); }} />
                                  </div>
                                )}
                                {slotsLoading && <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
                                {!slotsLoading && slots.length > 0 && (
                                  <div className="space-y-2">
                                    <Label>Horário</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                      {slots.map((sl, i) => (
                                        <button key={i} type="button" onClick={() => setSelSlot(sl)}
                                          className={`border rounded-lg px-3 py-2 text-sm font-medium transition-colors ${selSlot === sl ? "border-primary bg-primary text-white" : "hover:bg-muted/40"}`}>
                                          {sl.horarioInicio ?? sl.horario}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {!slotsLoading && agendaDate && slots.length === 0 && (
                                  <p className="text-sm text-muted-foreground text-center py-2">Nenhum horário disponível nesta data.</p>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                        <Button className="w-full h-12 text-base" onClick={handleAgendar} disabled={!selLocal || !agendaDate || !selSlot || agendaLoading}>
                          {agendaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                          {agendaLoading ? "Agendando..." : "Confirmar Agendamento"}
                        </Button>
                        <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => setLocation("/entrar")}>
                          Pular — agendar depois pelo sistema
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Coluna direita (resumo) ── */}
              <div className="lg:sticky lg:top-[73px]">
                <ResumeLateral
                  cert={cert} certPrice={certPrice} extendedWarranty={dados.extendedWarranty}
                  couponDiscount={couponDiscount} couponCode={couponCode} couponValid={couponValid}
                  couponLoading={couponLoading} onCouponChange={v => { setCouponCode(v); setCouponValid(null); setCouponDiscount(0); }}
                  onCouponApply={validateCoupon} setCouponCode={setCouponCode}
                  setCouponDiscount={setCouponDiscount} setCouponValid={setCouponValid}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* footer */}
      <footer className="bg-[#0f172a] text-white pt-10 pb-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="bg-white rounded-xl px-5 py-2.5">
              <LealCertLogo />
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/entrar" className="hover:text-white transition-colors">Área do Cliente</a>
              <a href="mailto:certificados@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
              <a href="/politica-de-privacidade" className="hover:text-white transition-colors">Privacidade</a>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs">© {new Date().getFullYear()} LealCert. Todos os direitos reservados.</p>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs uppercase tracking-wider">Certificado por</span>
              <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-4 py-2 border border-white/10">
                <img src="/safeweb-logo.png" alt="Safeweb" className="h-7 w-auto object-contain brightness-0 invert opacity-80" />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal Termos */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Termos de Uso e Privacidade (LGPD)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Ao prosseguir, você autoriza a LealCert a coletar e tratar os seguintes dados pessoais:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nome completo, CPF/CNPJ, data de nascimento e contato</li>
              <li>Endereço residencial ou comercial</li>
              <li>Documento de identificação (RG ou CNH — frente e verso)</li>
              <li>Selfie para validação biométrica (quando aplicável)</li>
            </ul>
            <p>Esses dados são usados exclusivamente para validação de identidade perante as Autoridades Certificadoras (ICP-Brasil) e emissão do certificado. Não compartilhamos com terceiros, salvo obrigação legal.</p>
            <p>Ao clicar em <strong>Aceitar e Continuar</strong>, você declara concordar com o tratamento dos seus dados nos termos da LGPD (Lei nº 13.709/2018).</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTerms(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => {
              setTermsAccepted(true);
              setShowTerms(false);
              // Se veio do lookup (login ou novo cliente), avança para bio
              if (step === "lookup") { setStep("bio"); window.scrollTo(0, 0); }
            }}>
              <ShieldCheck className="h-4 w-4 mr-2" />Aceitar e Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
