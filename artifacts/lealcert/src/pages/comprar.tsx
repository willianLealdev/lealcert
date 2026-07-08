import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck, Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
  FileText, CreditCard, Upload, Calendar, Lock, MapPin, Search,
  Fingerprint, User, Building2, QrCode, Receipt, Clock, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function digitsOnly(v: string) { return (v || "").replace(/\D/g, ""); }

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/* ── tipos ─────────────────────────────────────────────────────────────── */
type Step = 1 | 2 | 3 | 4 | 5 | 6;
type CnpjRfbState = null | "loading" | { ok: true; razaoSocial: string } | { ok: false; mensagem: string };

interface Certificate {
  id: number; name: string; product?: string | null; model?: string | null;
  validityMonths: number; price: number; priceContador?: number | null;
}

interface BioState {
  cpf: string; dataNascimento: string; validated: boolean;
  customerName: string | null; hasPsbio: boolean; error: string | null; loading: boolean;
}

interface DadosForm {
  /* titular (e-CPF) / empresa (e-CNPJ) */
  nome: string;
  cpfCnpj: string;         /* e-CPF: CPF | e-CNPJ: CNPJ da empresa */
  customerBirthDate: string; /* e-CPF: nascimento do titular DD/MM/YYYY */
  email: string;
  phone: string;
  razaoSocial: string;     /* e-CNPJ: razão social */
  /* representante (e-CNPJ) / titular (e-CPF reutiliza) */
  repNome: string;
  repBirthDate: string;    /* DD/MM/YYYY */
  /* CEI / NIS / PIS */
  repNumeroTipo: "" | "cei" | "nis" | "pis";
  customerCei: string;
  customerNis: string;
  inssNumber: string;
  /* documento de identificação */
  repDocTipo: string;      /* "0" | "1"=RG | "2"=RNE | "3"=Passaporte | "4"=CNH */
  repDocNumero: string;
  repDocOrgan: string;
  repDocUf: string;
  /* endereço */
  repAddressZipcode: string;
  repAddressStreet: string;
  repAddressNumber: string;
  repAddressComplement: string;
  repAddressNeighborhood: string;
  repAddressCity: string;
  repAddressState: string;
  repAddressIbge: string;
  /* extras */
  extendedWarranty: boolean;
}

interface NfForm {
  nfCpfCnpj: string; nfNome: string; nfZipcode: string; nfStreet: string;
  nfNumber: string; nfComplement: string; nfNeighborhood: string;
  nfCity: string; nfState: string; nfIbge: string; sameAsHolder: boolean;
}

interface PaymentState {
  method: "pix" | "boleto" | "cartao" | null;
  orderId: number | null; orderNumber: string | null;
  pixQr: string | null; pixCode: string | null;
  boletoUrl: string | null; boletoBarcode: string | null;
  totalAmount: number; loading: boolean; error: string | null; paid: boolean;
}

interface AgendaLocal { id?: number; localAtendimentoId?: number; nome?: string; NomeLocalAtendimento?: string; }
interface AgendaSlot { horario?: string; horarioInicio?: string; horarioFim?: string; }

/* ── Logo ──────────────────────────────────────────────────────────────── */
function LealCertLogo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  if (variant === "light") {
    return (
      <div className="bg-white rounded-xl px-5 py-2.5">
        <img src="/logo-oficial-cropped.png" alt="LealCert" className="h-10 w-auto object-contain" />
      </div>
    );
  }
  return <img src="/logo-oficial-cropped.png" alt="LealCert" className="h-14 w-auto object-contain" />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function ComprarPage() {
  const { certId } = useParams<{ certId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* ── certificado ─────────────────────────────────────────────────────── */
  const { data: cert, isLoading: certLoading, isError: certError } = useQuery<Certificate>({
    queryKey: ["/api/public/checkout/cert", certId],
    queryFn: async () => {
      const r = await fetch(`/api/public/checkout/cert/${certId}`);
      if (!r.ok) throw new Error("Certificado não encontrado");
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

  /* ── STEP 1 — PSBio ─────────────────────────────────────────────────── */
  const [bio, setBio] = useState<BioState>({
    cpf: "", dataNascimento: "", validated: false,
    customerName: null, hasPsbio: false, error: null, loading: false,
  });

  const handleBioSubmit = async () => {
    if (!termsAccepted) { setShowTerms(true); return; }
    if (digitsOnly(bio.cpf).length !== 11) {
      setBio(b => ({ ...b, error: "CPF inválido." })); return;
    }
    if (bio.dataNascimento.length !== 10) {
      setBio(b => ({ ...b, error: "Data de nascimento inválida." })); return;
    }
    setBio(b => ({ ...b, loading: true, error: null }));
    try {
      const r = await fetch("/api/public/checkout/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpf: digitsOnly(bio.cpf), dataNascimento: parseBrDate(bio.dataNascimento) }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setBio(b => ({ ...b, loading: false, error: data.mensagem || "Erro ao validar CPF." }));
        return;
      }
      setBio(b => ({ ...b, loading: false, validated: true, customerName: data.customerName, hasPsbio: data.hasPsbio }));
      /* pré-preenche dados */
      setDados(d => ({
        ...d,
        nome: data.customerName || d.nome,
        repNome: data.customerName || d.repNome,
        cpfCnpj: isCnpjCert ? d.cpfCnpj : maskCpf(bio.cpf),
        customerBirthDate: !isCnpjCert ? bio.dataNascimento : d.customerBirthDate,
        repBirthDate: isCnpjCert ? bio.dataNascimento : d.repBirthDate,
      }));
      setStep(2);
      window.scrollTo(0, 0);
    } catch {
      setBio(b => ({ ...b, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ── STEP 2 — Dados ─────────────────────────────────────────────────── */
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

  const setDad = (k: keyof DadosForm, v: string | boolean) =>
    setDados(d => ({ ...d, [k]: v }));

  /* ── RFB validation (e-CNPJ) ─────────────────────────────────────────── */
  const [cnpjRfbState, setCnpjRfbState] = useState<CnpjRfbState>(null);
  const cnpjRfbAbortRef = useRef<AbortController | null>(null);

  const triggerCnpjRfb = useCallback(async (cnpj: string, cpf: string, dataNascimento: string) => {
    const cnpjD = cnpj.replace(/\D/g, "");
    const cpfD = cpf.replace(/\D/g, "");
    if (cnpjD.length !== 14 || cpfD.length !== 11 || dataNascimento.length !== 10) return;
    cnpjRfbAbortRef.current?.abort();
    const ac = new AbortController();
    cnpjRfbAbortRef.current = ac;
    setCnpjRfbState("loading");
    try {
      const r = await fetch("/api/public/checkout/cnpj-rfb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ac.signal,
        body: JSON.stringify({ cnpj: cnpjD, cpf: cpfD, dataNascimento: parseBrDate(dataNascimento) }),
      });
      const data = await r.json();
      if (data.ok) {
        setCnpjRfbState({ ok: true, razaoSocial: data.razaoSocial ?? "" });
        if (data.razaoSocial) setDad("razaoSocial", data.razaoSocial);
      } else {
        setCnpjRfbState({ ok: false, mensagem: data.mensagem ?? "CPF do responsável não confere com a Receita Federal." });
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setCnpjRfbState({ ok: false, mensagem: "Erro ao consultar Receita Federal." });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* auto-dispara RFB quando CNPJ + CPF (bio) + nascimento do rep estão completos */
  useEffect(() => {
    if (!isCnpjCert) return;
    const cnpjD = digitsOnly(dados.cpfCnpj);
    const cpfD = digitsOnly(bio.cpf);
    const nascD = dados.repBirthDate;
    if (cnpjD.length === 14 && cpfD.length === 11 && nascD.length === 10) {
      if (cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok) return;
      void triggerCnpjRfb(dados.cpfCnpj, bio.cpf, nascD);
    }
  }, [dados.cpfCnpj, dados.repBirthDate, isCnpjCert]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── CEP do representante ─────────────────────────────────────────────── */
  const [repCepLoading, setRepCepLoading] = useState(false);
  const [repCepFilled, setRepCepFilled] = useState(false);

  const fetchRepCep = useCallback(async (cep: string) => {
    const d = digitsOnly(cep);
    if (d.length !== 8) return;
    setRepCepLoading(true);
    try {
      const r = await fetch(`/api/public/checkout/cep/${d}`, { credentials: "include" });
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

  /* ── Validação para avançar para a etapa 3 ─────────────────────────────── */
  const goToNf = () => {
    if (!dados.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!dados.email.includes("@")) { toast({ title: "E-mail inválido", variant: "destructive" }); return; }
    if (digitsOnly(dados.phone).length < 10) { toast({ title: "Telefone inválido", variant: "destructive" }); return; }

    if (isCnpjCert) {
      if (digitsOnly(dados.cpfCnpj).length !== 14) { toast({ title: "CNPJ inválido", variant: "destructive" }); return; }
      if (!dados.razaoSocial.trim()) { toast({ title: "Razão Social obrigatória", variant: "destructive" }); return; }
      if (dados.repBirthDate.length !== 10) { toast({ title: "Data de nascimento do representante obrigatória", variant: "destructive" }); return; }
      if (!(cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok)) {
        toast({ title: "Validação na Receita Federal pendente", description: "Aguarde a confirmação do CNPJ + CPF do responsável.", variant: "destructive" }); return;
      }
    } else {
      if (dados.customerBirthDate.length !== 10) { toast({ title: "Data de nascimento obrigatória", variant: "destructive" }); return; }
    }

    if (dados.repDocTipo === "0") { toast({ title: "Selecione o tipo de documento de identificação", variant: "destructive" }); return; }
    if (!dados.repDocNumero.trim()) { toast({ title: "Informe o número do documento", variant: "destructive" }); return; }
    if (!dados.repAddressZipcode || digitsOnly(dados.repAddressZipcode).length !== 8) { toast({ title: "CEP inválido", variant: "destructive" }); return; }
    if (!dados.repAddressStreet || !dados.repAddressNumber || !dados.repAddressCity || !dados.repAddressState) {
      toast({ title: "Endereço incompleto", variant: "destructive" }); return;
    }
    setStep(3);
    window.scrollTo(0, 0);
  };

  /* ── STEP 3 — Nota Fiscal ───────────────────────────────────────────── */
  const [nf, setNf] = useState<NfForm>({
    nfCpfCnpj: "", nfNome: "", nfZipcode: "", nfStreet: "", nfNumber: "",
    nfComplement: "", nfNeighborhood: "", nfCity: "", nfState: "", nfIbge: "", sameAsHolder: false,
  });
  const setNfField = (k: keyof NfForm, v: string | boolean) => setNf(n => ({ ...n, [k]: v }));
  const [nfCepLoading, setNfCepLoading] = useState(false);
  const [nfCepFilled, setNfCepFilled] = useState(false);

  const fetchNfCep = useCallback(async (cep: string) => {
    const d = digitsOnly(cep);
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

  const goToPagamento = () => {
    if (!nf.sameAsHolder) {
      if (!nf.nfNome.trim()) { toast({ title: "Nome da NF obrigatório", variant: "destructive" }); return; }
      const cpf = digitsOnly(nf.nfCpfCnpj);
      if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) { toast({ title: "CPF/CNPJ da NF inválido", variant: "destructive" }); return; }
    }
    setStep(4);
    window.scrollTo(0, 0);
  };

  /* ── STEP 4 — Pagamento + Cupom ─────────────────────────────────────── */
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const r = await fetch("/api/public/checkout/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: couponCode.trim(), certId: Number(certId) }),
      });
      const data = await r.json();
      if (data.valid) {
        setCouponDiscount(data.discount);
        setCouponValid(true);
        toast({ title: `Cupom aplicado! Desconto de ${formatBRL(data.discount)}` });
      } else {
        setCouponDiscount(0);
        setCouponValid(false);
        toast({ title: data.error || "Cupom inválido", variant: "destructive" });
      }
    } finally { setCouponLoading(false); }
  };

  const finalPrice = Math.max(0, certPrice + (dados.extendedWarranty ? 15 : 0) - couponDiscount);
  const allowedMethods = finalPrice >= 150 ? ["pix", "boleto", "cartao"] : finalPrice >= 125 ? ["pix", "boleto"] : ["pix"];

  const [payment, setPayment] = useState<PaymentState>({
    method: null, orderId: null, orderNumber: null, pixQr: null, pixCode: null,
    boletoUrl: null, boletoBarcode: null, totalAmount: 0, loading: false, error: null, paid: false,
  });

  const submitOrder = async (method: "pix" | "boleto" | "cartao") => {
    setPayment(p => ({ ...p, loading: true, error: null, method }));
    try {
      /* monta payload flat conforme o backend espera */
      const repDocEmissor =
        dados.repDocTipo !== "0" && dados.repDocOrgan && dados.repDocUf
          ? (dados.repDocOrgan + dados.repDocUf).toUpperCase()
          : undefined;

      const holderNome = isCnpjCert ? dados.repNome : dados.nome;

      const payload = {
        certificateId: Number(certId),
        personType: isCnpjCert ? "juridica" : "fisica",
        /* bio */
        cpf: digitsOnly(bio.cpf),
        dataNascimento: parseBrDate(bio.dataNascimento),
        hasPsbio: bio.hasPsbio,
        /* titular */
        customerName: holderNome,
        customerEmail: dados.email,
        customerPhone: digitsOnly(dados.phone),
        customerBirthDate: !isCnpjCert && dados.customerBirthDate ? parseBrDate(dados.customerBirthDate) : undefined,
        /* e-CNPJ extra */
        customerCpfCnpj: isCnpjCert ? digitsOnly(dados.cpfCnpj) : undefined,
        companyName: isCnpjCert ? dados.razaoSocial : undefined,
        /* CEI / NIS / PIS */
        inssNumber: dados.repNumeroTipo === "pis" ? dados.inssNumber || undefined : undefined,
        customerCei: dados.repNumeroTipo === "cei" ? dados.customerCei || undefined : undefined,
        customerNis: dados.repNumeroTipo === "nis" ? dados.customerNis || undefined : undefined,
        /* endereço (titular e-CPF / representante e-CNPJ) */
        addressZipcode: digitsOnly(dados.repAddressZipcode) || undefined,
        addressStreet: dados.repAddressStreet || undefined,
        addressNumber: dados.repAddressNumber || undefined,
        addressComplement: dados.repAddressComplement || undefined,
        addressNeighborhood: dados.repAddressNeighborhood || undefined,
        addressCity: dados.repAddressCity || undefined,
        addressState: dados.repAddressState || undefined,
        addressIbge: dados.repAddressIbge || undefined,
        /* representante */
        representanteCpf: digitsOnly(bio.cpf) || undefined,
        representanteNascimento: isCnpjCert
          ? (dados.repBirthDate ? parseBrDate(dados.repBirthDate) : parseBrDate(bio.dataNascimento))
          : (dados.customerBirthDate ? parseBrDate(dados.customerBirthDate) : undefined),
        representanteAddressZipcode: digitsOnly(dados.repAddressZipcode) || undefined,
        representanteAddressStreet: dados.repAddressStreet || undefined,
        representanteAddressNumber: dados.repAddressNumber || undefined,
        representanteAddressComplement: dados.repAddressComplement || undefined,
        representanteAddressNeighborhood: dados.repAddressNeighborhood || undefined,
        representanteAddressCity: dados.repAddressCity || undefined,
        representanteAddressState: dados.repAddressState || undefined,
        /* documento */
        representanteDocTipo: dados.repDocTipo !== "0" ? dados.repDocTipo : undefined,
        representanteDocNumero: dados.repDocTipo !== "0" ? dados.repDocNumero || undefined : undefined,
        representanteDocEmissor: repDocEmissor,
        /* NF */
        nfCnpj: nf.sameAsHolder
          ? (isCnpjCert ? digitsOnly(dados.cpfCnpj) : digitsOnly(bio.cpf)) || undefined
          : digitsOnly(nf.nfCpfCnpj) || undefined,
        nfNome: nf.sameAsHolder
          ? (isCnpjCert ? dados.razaoSocial : dados.nome) || undefined
          : nf.nfNome || undefined,
        nfZipcode: nf.sameAsHolder ? digitsOnly(dados.repAddressZipcode) || undefined : digitsOnly(nf.nfZipcode) || undefined,
        nfStreet: nf.sameAsHolder ? dados.repAddressStreet || undefined : nf.nfStreet || undefined,
        nfNumber: nf.sameAsHolder ? dados.repAddressNumber || undefined : nf.nfNumber || undefined,
        nfComplement: nf.sameAsHolder ? dados.repAddressComplement || undefined : nf.nfComplement || undefined,
        nfNeighborhood: nf.sameAsHolder ? dados.repAddressNeighborhood || undefined : nf.nfNeighborhood || undefined,
        nfCity: nf.sameAsHolder ? dados.repAddressCity || undefined : nf.nfCity || undefined,
        nfState: nf.sameAsHolder ? dados.repAddressState || undefined : nf.nfState || undefined,
        /* pagamento */
        paymentMethod: method,
        couponCode: couponValid ? couponCode.trim() : undefined,
        termsAccepted: true,
        extendedWarranty: dados.extendedWarranty,
      };

      const r = await fetch("/api/public/checkout/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
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
        loading: false, error: null,
        paid: method === "cartao",
      });
      setStep(5);
      window.scrollTo(0, 0);
    } catch {
      setPayment(p => ({ ...p, loading: false, error: "Erro de rede. Tente novamente." }));
    }
  };

  /* ── STEP 5 — Documentos ────────────────────────────────────────────── */
  const [docs, setDocs] = useState<{ rgFrente: File | null; rgVerso: File | null; selfie: File | null; extra: File | null }>({
    rgFrente: null, rgVerso: null, selfie: null, extra: null,
  });
  const [docsLoading, setDocsLoading] = useState(false);

  const uploadDocs = async () => {
    if (!payment.orderId) { setStep(6); window.scrollTo(0, 0); return; }
    if (!docs.rgFrente && !docs.rgVerso && !docs.selfie) { setStep(6); window.scrollTo(0, 0); return; }
    setDocsLoading(true);
    try {
      const fd = new FormData();
      if (docs.rgFrente) fd.append("rgFrente", docs.rgFrente);
      if (docs.rgVerso) fd.append("rgVerso", docs.rgVerso);
      if (docs.selfie) fd.append("selfie", docs.selfie);
      if (docs.extra) fd.append("extra", docs.extra);
      await fetch(`/api/orders/${payment.orderId}/documents`, {
        method: "POST", credentials: "include", body: fd,
      });
    } finally {
      setDocsLoading(false);
      setStep(6);
      window.scrollTo(0, 0);
    }
  };

  /* ── STEP 6 — Agendamento ───────────────────────────────────────────── */
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
      .then(data => setLocais(data.locais ?? []))
      .catch(() => setLocais([]))
      .finally(() => setLocaisLoading(false));
  }, [step, payment.orderId]);

  const fetchSlots = async (local: AgendaLocal, date: string) => {
    if (!date || !local) return;
    setSlotsLoading(true); setSlots([]);
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
      if (r.ok) setAgendaDone(true);
      else toast({ title: "Erro ao agendar. Tente novamente.", variant: "destructive" });
    } finally { setAgendaLoading(false); }
  };

  /* ── Step indicator ─────────────────────────────────────────────────── */
  const STEPS = [
    { n: 1, label: "Validação" }, { n: 2, label: "Dados" }, { n: 3, label: "Nota Fiscal" },
    { n: 4, label: "Pagamento" }, { n: 5, label: "Documentos" }, { n: 6, label: "Agendamento" },
  ];

  /* ── Loading / erro do cert ─────────────────────────────────────────── */
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

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] text-xs text-gray-400 text-center py-2 px-4">
        Certificadora autorizada ICP-Brasil &nbsp;·&nbsp; Atendimento em todo o Brasil &nbsp;·&nbsp;
        <span className="text-[#f59e0b] font-medium">Emissão em até 24h úteis</span>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} className="shrink-0">
            <LealCertLogo variant="dark" />
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Compra segura · 100% criptografada</span>
          </div>
          <a href="/entrar" className="text-sm font-medium text-primary hover:underline shrink-0">Área do Cliente</a>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* Resumo do certificado */}
          <div className="flex items-center justify-between bg-white rounded-xl border px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Certificado</p>
              <p className="font-bold text-foreground">{cert.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{cert.validityMonths} meses de validade</p>
            </div>
            <p className="text-2xl font-extrabold text-primary">{formatBRL(certPrice)}</p>
          </div>

          {/* Step bar */}
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

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 1 — Validação Biométrica (PSBio)
              ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />Validação Biométrica
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Informe seu CPF e data de nascimento para validação. Nenhum cadastro prévio é necessário.
                </p>
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
                    value={bio.dataNascimento}
                    onChange={e => setBio(b => ({ ...b, dataNascimento: maskDate(e.target.value), error: null }))}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    inputMode="numeric"
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

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 2 — Dados
              ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-4">

              {/* ── e-CPF: dados do titular ── */}
              {!isCnpjCert && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />Dados do Titular
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>CPF *</Label>
                        <Input value={dados.cpfCnpj} onChange={e => setDad("cpfCnpj", maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Nascimento *</Label>
                        <Input
                          value={dados.customerBirthDate}
                          onChange={e => setDad("customerBirthDate", maskDate(e.target.value))}
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Nome Completo *</Label>
                        <Input value={dados.nome} onChange={e => setDad("nome", e.target.value)} placeholder="Como no RG" />
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

                    {/* CEI / NIS / PIS */}
                    <div className="space-y-3 pt-2 border-t">
                      <p className="text-sm font-medium">Número Adicional <span className="text-muted-foreground font-normal text-xs">(opcional — escolha apenas um)</span></p>
                      <div className="flex flex-wrap gap-4">
                        {(["cei", "nis", "pis"] as const).map(tipo => (
                          <label key={tipo} className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="radio" name="repNumeroTipo" value={tipo}
                              checked={dados.repNumeroTipo === tipo}
                              onChange={() => setDados(d => ({ ...d, repNumeroTipo: tipo, customerCei: tipo === "cei" ? d.customerCei : "", customerNis: tipo === "nis" ? d.customerNis : "", inssNumber: tipo === "pis" ? d.inssNumber : "" }))}
                              className="accent-primary" />
                            <span className="text-sm font-medium">{tipo === "pis" ? "PIS" : tipo.toUpperCase()}</span>
                          </label>
                        ))}
                        {dados.repNumeroTipo && (
                          <button type="button" onClick={() => setDados(d => ({ ...d, repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>
                        )}
                      </div>
                      {dados.repNumeroTipo === "cei" && <Input value={dados.customerCei} onChange={e => setDad("customerCei", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="CEI — até 12 dígitos" maxLength={12} inputMode="numeric" />}
                      {dados.repNumeroTipo === "nis" && <Input value={dados.customerNis} onChange={e => setDad("customerNis", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="NIS — até 11 dígitos" maxLength={11} inputMode="numeric" />}
                      {dados.repNumeroTipo === "pis" && <Input value={dados.inssNumber} onChange={e => setDad("inssNumber", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="PIS — 11 dígitos" maxLength={11} inputMode="numeric" />}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── e-CNPJ: dados da empresa ── */}
              {isCnpjCert && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />Dados da Empresa
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">Informe o CNPJ e a razão social. O representante será validado automaticamente na Receita Federal.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>CNPJ *</Label>
                          <Input
                            value={dados.cpfCnpj}
                            onChange={e => {
                              const v = maskCnpj(e.target.value);
                              setDad("cpfCnpj", v);
                              setCnpjRfbState(null);
                              if (digitsOnly(v).length === 14 && digitsOnly(bio.cpf).length === 11 && dados.repBirthDate.length === 10) {
                                void triggerCnpjRfb(v, bio.cpf, dados.repBirthDate);
                              }
                            }}
                            placeholder="00.000.000/0001-00"
                            inputMode="numeric"
                            maxLength={18}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            Razão Social *
                            {cnpjRfbState === "loading" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                            {cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                          </Label>
                          <Input
                            value={dados.razaoSocial}
                            onChange={e => setDad("razaoSocial", e.target.value)}
                            placeholder={cnpjRfbState === "loading" ? "Consultando RFB..." : "Razão Social"}
                            className={cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && dados.razaoSocial ? "bg-emerald-50 border-emerald-200" : ""}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>E-mail *</Label>
                          <Input type="email" value={dados.email} onChange={e => setDad("email", e.target.value)} placeholder="empresa@email.com" />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone / WhatsApp *</Label>
                          <Input value={dados.phone} onChange={e => setDad("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />Dados do Representante Legal
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">Pessoa física responsável pela emissão do certificado.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>CPF do Representante *</Label>
                          <Input value={maskCpf(bio.cpf)} readOnly className="bg-muted/50 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Preenchido automaticamente da etapa de validação.</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Data de Nascimento *</Label>
                          <Input
                            value={dados.repBirthDate}
                            onChange={e => {
                              const v = maskDate(e.target.value);
                              setDad("repBirthDate", v);
                              setCnpjRfbState(null);
                              if (digitsOnly(dados.cpfCnpj).length === 14 && digitsOnly(bio.cpf).length === 11 && v.length === 10) {
                                void triggerCnpjRfb(dados.cpfCnpj, bio.cpf, v);
                              }
                            }}
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                            inputMode="numeric"
                          />
                        </div>

                        {/* Status RFB */}
                        {cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok && (
                          <div className="sm:col-span-2 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>Receita Federal confirmada — <strong>{(cnpjRfbState as { ok: true; razaoSocial: string }).razaoSocial}</strong></span>
                          </div>
                        )}
                        {cnpjRfbState === "loading" && (
                          <div className="sm:col-span-2 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            <span>Consultando Receita Federal...</span>
                          </div>
                        )}
                        {cnpjRfbState && cnpjRfbState !== "loading" && !(cnpjRfbState as { ok: boolean }).ok && (
                          <div className="sm:col-span-2 flex items-center gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{(cnpjRfbState as { ok: false; mensagem: string }).mensagem}</span>
                          </div>
                        )}

                        <div className="space-y-2 sm:col-span-2">
                          <Label>Nome Completo do Representante *</Label>
                          <Input value={dados.repNome} onChange={e => setDad("repNome", e.target.value)} placeholder="Nome completo" />
                        </div>
                      </div>

                      {/* CEI / NIS / PIS do representante */}
                      <div className="space-y-3 pt-2 border-t">
                        <p className="text-sm font-medium">Número Adicional <span className="text-muted-foreground font-normal text-xs">(opcional — escolha apenas um)</span></p>
                        <div className="flex flex-wrap gap-4">
                          {(["cei", "nis", "pis"] as const).map(tipo => (
                            <label key={tipo} className="flex items-center gap-2 cursor-pointer select-none">
                              <input type="radio" name="repNumeroTipo" value={tipo}
                                checked={dados.repNumeroTipo === tipo}
                                onChange={() => setDados(d => ({ ...d, repNumeroTipo: tipo, customerCei: tipo === "cei" ? d.customerCei : "", customerNis: tipo === "nis" ? d.customerNis : "", inssNumber: tipo === "pis" ? d.inssNumber : "" }))}
                                className="accent-primary" />
                              <span className="text-sm font-medium">{tipo === "pis" ? "PIS" : tipo.toUpperCase()}</span>
                            </label>
                          ))}
                          {dados.repNumeroTipo && (
                            <button type="button" onClick={() => setDados(d => ({ ...d, repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>
                          )}
                        </div>
                        {dados.repNumeroTipo === "cei" && <Input value={dados.customerCei} onChange={e => setDad("customerCei", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="CEI — até 12 dígitos" maxLength={12} inputMode="numeric" />}
                        {dados.repNumeroTipo === "nis" && <Input value={dados.customerNis} onChange={e => setDad("customerNis", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="NIS — até 11 dígitos" maxLength={11} inputMode="numeric" />}
                        {dados.repNumeroTipo === "pis" && <Input value={dados.inssNumber} onChange={e => setDad("inssNumber", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="PIS — 11 dígitos" maxLength={11} inputMode="numeric" />}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* ── Documento de Identificação (todos) ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />Documento de Identificação *
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de Documento *</Label>
                    <select
                      value={dados.repDocTipo}
                      onChange={e => setDados(d => ({ ...d, repDocTipo: e.target.value, repDocNumero: "", repDocOrgan: "", repDocUf: "" }))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="0">Selecione o tipo</option>
                      <option value="1">RG</option>
                      <option value="2">RNE</option>
                      <option value="3">Passaporte</option>
                      <option value="4">CNH</option>
                    </select>
                  </div>
                  {dados.repDocTipo !== "0" && (
                    <>
                      <div className="space-y-2">
                        <Label>Número do Documento *</Label>
                        <Input
                          value={dados.repDocNumero}
                          onChange={e => setDad("repDocNumero", e.target.value)}
                          placeholder={dados.repDocTipo === "3" ? "Ex: BR123456" : "Ex: 12.345.678-9"}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Órgão Expedidor <span className="text-muted-foreground font-normal text-xs">(máx. 4 car.)</span></Label>
                          <Input value={dados.repDocOrgan} onChange={e => setDad("repDocOrgan", e.target.value.toUpperCase().slice(0, 4))} placeholder="SSP" maxLength={4} />
                        </div>
                        <div className="space-y-2">
                          <Label>UF</Label>
                          <select
                            value={dados.repDocUf}
                            onChange={e => setDad("repDocUf", e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="">Selecione</option>
                            {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── Endereço do titular / representante ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    {isCnpjCert ? "Endereço do Representante Legal *" : "Endereço do Responsável *"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>CEP *</Label>
                      <div className="relative">
                        <Input
                          value={dados.repAddressZipcode}
                          onChange={e => { const m = maskCep(e.target.value); setDad("repAddressZipcode", m); fetchRepCep(m); }}
                          placeholder="00000-000"
                          maxLength={9}
                          className="pr-9"
                          inputMode="numeric"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                          {repCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Rua / Logradouro *{repCepFilled && dados.repAddressStreet && <span className="text-xs text-emerald-500 font-normal ml-1">(auto)</span>}</Label>
                      <Input value={dados.repAddressStreet} onChange={e => setDad("repAddressStreet", e.target.value)} className={repCepFilled && dados.repAddressStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>Número *</Label>
                      <Input value={dados.repAddressNumber} onChange={e => setDad("repAddressNumber", e.target.value)} placeholder="123" />
                    </div>
                    <div className="space-y-2">
                      <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                      <Input value={dados.repAddressComplement} onChange={e => setDad("repAddressComplement", e.target.value)} placeholder="Apto, Sala..." maxLength={20} />
                    </div>
                    <div className="space-y-2">
                      <Label>Bairro{repCepFilled && dados.repAddressNeighborhood && <span className="text-xs text-emerald-500 font-normal ml-1">(auto)</span>}</Label>
                      <Input value={dados.repAddressNeighborhood} onChange={e => setDad("repAddressNeighborhood", e.target.value)} className={repCepFilled && dados.repAddressNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cidade *{repCepFilled && dados.repAddressCity && <span className="text-xs text-emerald-500 font-normal ml-1">(auto)</span>}</Label>
                      <Input value={dados.repAddressCity} onChange={e => setDad("repAddressCity", e.target.value)} className={repCepFilled && dados.repAddressCity ? "bg-emerald-50 border-emerald-200" : ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>UF *{repCepFilled && dados.repAddressState && <span className="text-xs text-emerald-500 font-normal ml-1">(auto)</span>}</Label>
                      <Input value={dados.repAddressState} onChange={e => setDad("repAddressState", e.target.value.toUpperCase())} maxLength={2} placeholder="SP" className={repCepFilled && dados.repAddressState ? "bg-emerald-50 border-emerald-200" : ""} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Garantia Estendida */}
              <Card>
                <CardHeader><CardTitle className="text-base">Opções Adicionais</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" id="warranty" className="h-4 w-4 mt-0.5 accent-primary"
                      checked={dados.extendedWarranty}
                      onChange={e => setDad("extendedWarranty", e.target.checked)} />
                    <label htmlFor="warranty" className="text-sm cursor-pointer">
                      <span className="font-medium">Garantia Estendida</span>
                      <span className="text-muted-foreground ml-2">(+{formatBRL(15)})</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Reemissão gratuita caso haja problema técnico no prazo de 90 dias.</p>
                    </label>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="w-1/3">
                  <ArrowLeft className="h-4 w-4 mr-1" />Voltar
                </Button>
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={goToNf}
                  disabled={isCnpjCert && cnpjRfbState === "loading"}
                >
                  Avançar <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 3 — Nota Fiscal
              ══════════════════════════════════════════════════════════════ */}
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
                  {/* opção "usar dados do titular" */}
                  <div
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border cursor-pointer"
                    onClick={() => {
                      const same = !nf.sameAsHolder;
                      setNf(prev => ({
                        ...prev,
                        sameAsHolder: same,
                        ...(same ? {
                          nfCpfCnpj: isCnpjCert ? maskCnpj(dados.cpfCnpj) : maskCpf(bio.cpf),
                          nfNome: isCnpjCert ? dados.razaoSocial : dados.nome,
                          nfZipcode: maskCep(dados.repAddressZipcode),
                          nfStreet: dados.repAddressStreet,
                          nfNumber: dados.repAddressNumber,
                          nfComplement: dados.repAddressComplement,
                          nfNeighborhood: dados.repAddressNeighborhood,
                          nfCity: dados.repAddressCity,
                          nfState: dados.repAddressState,
                          nfIbge: dados.repAddressIbge,
                        } : {}),
                      }));
                    }}
                  >
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
                            <Input value={nf.nfZipcode} onChange={e => { const m = maskCep(e.target.value); setNfField("nfZipcode", m); fetchNfCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" inputMode="numeric" />
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
                <Button className="flex-1 h-12 text-base" onClick={goToPagamento}>Avançar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 4 — Pagamento
              ══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Resumo */}
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
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Desconto (cupom)</span>
                      <span>-{formatBRL(couponDiscount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-primary text-xl">{formatBRL(finalPrice)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Cupom de desconto */}
              <Card>
                <CardHeader><CardTitle className="text-base">Cupom de Desconto</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponValid(null); setCouponDiscount(0); }}
                      placeholder="CÓDIGO DO CUPOM"
                      className="font-mono uppercase"
                    />
                    <Button variant="outline" onClick={validateCoupon} disabled={couponLoading || !couponCode.trim()}>
                      {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                    </Button>
                  </div>
                  {couponValid === true && <p className="text-xs text-emerald-600 font-medium">✓ Desconto de {formatBRL(couponDiscount)} aplicado!</p>}
                  {couponValid === false && <p className="text-xs text-destructive">Cupom inválido ou expirado.</p>}
                </CardContent>
              </Card>

              {payment.error && (
                <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">{payment.error}</span>
                </div>
              )}

              {/* Métodos de pagamento */}
              <div className="space-y-3">
                {allowedMethods.includes("pix") && (
                  <button
                    className="w-full flex items-center gap-4 bg-white border-2 border-emerald-300 hover:border-emerald-500 rounded-xl px-5 py-4 transition-colors text-left disabled:opacity-60"
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
                    className="w-full flex items-center gap-4 bg-white border-2 border-amber-300 hover:border-amber-500 rounded-xl px-5 py-4 transition-colors text-left disabled:opacity-60"
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
                    className="w-full flex items-center gap-4 bg-white border-2 border-blue-300 hover:border-blue-500 rounded-xl px-5 py-4 transition-colors text-left disabled:opacity-60"
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

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 5 — Documentos
              ══════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <div className="space-y-4">
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
                      <span>O QR Code expira em 30 minutos. O agendamento é confirmado após o pagamento ser processado.</span>
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
                    <p className="text-xs text-muted-foreground bg-slate-50 border rounded-lg px-3 py-2">
                      O boleto tem validade de 3 dias úteis. Após o pagamento, o prazo de compensação pode levar até 3 dias úteis.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Upload de documentos */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />Enviar Documentos
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Envie RG (frente e verso), selfie e documentos adicionais. Você pode fazer isso agora ou pelo sistema após o login.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {([
                    { key: "rgFrente", label: "RG — Frente *" },
                    { key: "rgVerso", label: "RG — Verso *" },
                    { key: "selfie", label: "Selfie com documento" },
                    ...(isCnpjCert ? [{ key: "extra", label: "Cartão CNPJ / Contrato Social" }] : []),
                  ] as { key: keyof typeof docs; label: string }[]).map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-sm">{label}</Label>
                      <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${docs[key] ? "border-emerald-400 bg-emerald-50" : "border-muted hover:border-primary/40"}`}>
                        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground truncate">
                          {docs[key] ? (docs[key] as File).name : "Clique para selecionar arquivo"}
                        </span>
                        <input type="file" className="hidden" accept="image/*,application/pdf"
                          onChange={e => { const f = e.target.files?.[0] ?? null; setDocs(d => ({ ...d, [key]: f })); }} />
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Button className="w-full h-12 text-base" onClick={uploadDocs} disabled={docsLoading}>
                {docsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
                {docsLoading ? "Enviando..." : "Avançar para Agendamento"}
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 6 — Agendamento
              ══════════════════════════════════════════════════════════════ */}
          {step === 6 && (
            <div className="space-y-4">
              {agendaDone ? (
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="pt-6 text-center space-y-3">
                    <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
                    <p className="text-xl font-bold text-emerald-800">Tudo certo!</p>
                    <p className="text-sm text-emerald-700">Seu atendimento foi agendado com sucesso. Você receberá uma confirmação por e-mail.</p>
                    <Button className="w-full" onClick={() => setLocation("/entrar")}>Acessar minha conta</Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />Agendar Atendimento
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">Escolha o local e horário para o seu atendimento.</p>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {locaisLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                      ) : locais.length === 0 ? (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>Nenhum local disponível no momento. Você poderá agendar pelo sistema após o login.</span>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Local de Atendimento</Label>
                            <div className="space-y-2">
                              {locais.map((l, i) => (
                                <button key={i} type="button"
                                  onClick={() => { setSelectedLocal(l); setSelectedSlot(null); setSlots([]); if (selectedDate) fetchSlots(l, selectedDate); }}
                                  className={`w-full text-left border rounded-lg px-4 py-3 text-sm transition-colors ${selectedLocal === l ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/40"}`}>
                                  <MapPin className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                                  {l.NomeLocalAtendimento ?? l.nome}
                                </button>
                              ))}
                            </div>
                          </div>

                          {selectedLocal && (
                            <div className="space-y-2">
                              <Label>Data</Label>
                              <Input
                                type="date"
                                value={selectedDate}
                                min={new Date().toISOString().slice(0, 10)}
                                onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); fetchSlots(selectedLocal, e.target.value); }}
                              />
                            </div>
                          )}

                          {slotsLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

                          {!slotsLoading && slots.length > 0 && (
                            <div className="space-y-2">
                              <Label>Horário</Label>
                              <div className="grid grid-cols-3 gap-2">
                                {slots.map((sl, i) => {
                                  const hora = sl.horarioInicio ?? sl.horario ?? "";
                                  return (
                                    <button key={i} type="button"
                                      onClick={() => setSelectedSlot(sl)}
                                      className={`border rounded-lg px-3 py-2 text-sm font-medium transition-colors ${selectedSlot === sl ? "border-primary bg-primary text-white" : "hover:bg-muted/40"}`}>
                                      {hora}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {!slotsLoading && selectedDate && slots.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">Nenhum horário disponível nesta data.</p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Button
                    className="w-full h-12 text-base"
                    onClick={handleAgendar}
                    disabled={!selectedLocal || !selectedDate || !selectedSlot || agendaLoading}
                  >
                    {agendaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    {agendaLoading ? "Agendando..." : "Confirmar Agendamento"}
                  </Button>

                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setLocation("/entrar")}>
                    Pular — agendar depois pelo sistema
                  </Button>
                </>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-[#0f172a] text-white pt-10 pb-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <LealCertLogo variant="light" />
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/entrar" className="hover:text-white transition-colors">Área do Cliente</a>
              <a href="mailto:certificados@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
              <a href="/politica-de-privacidade" className="hover:text-white transition-colors">Privacidade</a>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs order-2 sm:order-1">
              © {new Date().getFullYear()} LealCert. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-3 order-1 sm:order-2">
              <span className="text-gray-500 text-xs uppercase tracking-wider">Certificado por</span>
              <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-4 py-2 border border-white/10">
                <img src="/safeweb-logo.png" alt="Safeweb" className="h-7 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Modal de Termos LGPD ─────────────────────────────────────────── */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />Termos de Uso e Privacidade (LGPD)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Ao prosseguir com a emissão do certificado digital, você autoriza a LealCert a coletar e tratar os seguintes dados pessoais:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nome completo, CPF/CNPJ, data de nascimento e contato (e-mail e telefone)</li>
              <li>Endereço residencial ou comercial</li>
              <li>Cópia do documento de identificação (RG ou CNH — frente e verso)</li>
              <li>Selfie para validação biométrica (quando aplicável)</li>
            </ul>
            <p>Esses dados são utilizados exclusivamente para validação de identidade perante as Autoridades Certificadoras (ICP-Brasil) e para emissão do certificado solicitado. Não compartilhamos seus dados com terceiros, salvo obrigação legal ou exigência das Autoridades Certificadoras.</p>
            <p>Ao clicar em <strong>Aceitar e Continuar</strong>, você declara que leu, compreendeu e concorda com a coleta e uso dos seus dados pessoais conforme descrito acima, nos termos da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTerms(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => { setTermsAccepted(true); setShowTerms(false); }}>
              <ShieldCheck className="h-4 w-4 mr-2" />Aceitar e Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
