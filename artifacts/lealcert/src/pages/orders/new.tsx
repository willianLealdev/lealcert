import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useListCertificates, useCreateOrder, useConsultaPrevia, getCnpjLookupQueryOptions, useValidateCoupon } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2, Search, MapPin, Upload, FileText, X, Info, ShieldCheck, ShieldAlert, Building2, User, Tag, CheckCircle, XCircle, CreditCard, BadgeCheck, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "wouter";

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
      [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
    );
  }
  return d
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
      [a, b, c].filter(Boolean).join(".").replace(/^(\d{2})/, "$1") +
      "/" + dd + (e ? "-" + e : "")
    )
    .replace(/^(\d{2})(\d{3})/, "$1.$2")
    .replace(/\.(\d{3})(\d{3})/, ".$1.$2");
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ""}`);
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ""}`);
}

function maskCepFn(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
  return d;
}

function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
  if (d.length > 2) return d.slice(0, 2) + "/" + d.slice(2);
  return d;
}

function parseBrDate(v: string): string {
  const parts = v.split("/");
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  return v;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// ─── Privacy Policy helpers ──────────────────────────────────────────────────

function PPSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-foreground border-b pb-1.5">{title}</h2>
      <div className="space-y-2 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function PPSub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 mt-2">
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Certificado" },
  { n: 2, label: "Dados" },
  { n: 3, label: "Nota Fiscal" },
  { n: 4, label: "Pagamento" },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, idx) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className={[
              "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
              current === s.n
                ? "bg-primary text-primary-foreground border-primary"
                : current > s.n
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-muted text-muted-foreground border-muted-foreground/20"
            ].join(" ")}>
              {current > s.n ? <CheckCircle className="h-4 w-4" /> : s.n}
            </div>
            <span className={["text-xs font-medium", current >= s.n ? "text-primary" : "text-muted-foreground"].join(" ")}>
              {s.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={["h-0.5 w-12 sm:w-20 mx-2 mb-5 rounded transition-colors", current > s.n ? "bg-primary" : "bg-muted"].join(" ")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── File Upload Widget ───────────────────────────────────────────────────────

function UploadWidget({
  label, hint, file, fileKey, uploading,
  inputRef, onChange, onUpload, onClear,
}: {
  label: string; hint: string;
  file: File | null; fileKey: string | null; uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (f: File | null) => void;
  onUpload: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={e => { const f = e.target.files?.[0] ?? null; onChange(f); }} />
      {!file ? (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
          <Upload className="h-7 w-7 opacity-40" />
          <div className="text-center">
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs">{hint}</p>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
          <FileText className="h-7 w-7 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            {fileKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!fileKey && (
              <Button type="button" size="sm" variant="outline" onClick={onUpload} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploading ? "Enviando..." : "Enviar"}
              </Button>
            )}
            <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: certificates } = useListCertificates({ activeOnly: true });

  // ── Step (1-4) ──
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // ── PSBio Gate ──
  const [psbioGatePassed, setPsbioGatePassed] = useState(false);
  const [gateInputCpf, setGateInputCpf] = useState("");
  const [gateInputBirthDate, setGateInputBirthDate] = useState("");
  type GateStatus = null | "loading" | { ok: true; hasPsbio: boolean; mensagem: string } | { ok: false; mensagem: string };
  const [gateStatus, setGateStatus] = useState<GateStatus>(null);
  const gateCpfRef = useRef("");
  const gateBirthDateRef = useRef("");
  const gateNameRef = useRef("");
  const gateHasPsbioRef = useRef(false);

  // ── Pre-fill from previous orders ──────────────────────────────────────────
  type PreFillEmpresa = { cnpj: string; nome: string; email: string | null; phone: string | null };
  type PreFillResponsavel = {
    nome: string; nascimento: string;
    docTipo: string | null; docNumero: string | null;
    addressZipcode: string | null; addressStreet: string | null; addressNumber: string | null;
    addressComplement: string | null; addressNeighborhood: string | null;
    addressCity: string | null; addressState: string | null;
  };
  type PreFillResult = {
    responsavel: PreFillResponsavel | null;
    cpfPessoal: { email: string | null; phone: string | null } | null;
    empresas: PreFillEmpresa[];
    notaFiscal: {
      cpfCnpj: string | null; nome: string | null; zipcode: string | null;
      street: string | null; number: string | null; complement: string | null;
      neighborhood: string | null; city: string | null; state: string | null;
    } | null;
  };
  const [preFillData, setPreFillData] = useState<PreFillResult | null>(null);
  const [showPreFillModal, setShowPreFillModal] = useState(false);
  const [preFillNfOffered, setPreFillNfOffered] = useState(false);

  const consultaCpfAbortRef = useRef<AbortController | null>(null);
  const repConsultaCpfAbortRef = useRef<AbortController | null>(null);

  const certIdFirstFireRef = useRef(true);
  useEffect(() => {
    setSessionLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cert selector ──
  const PRODUCT_OPTIONS_ORDER = ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"];
  const ISSUANCE_ORDER = ["Presencial", "Videoconferência", "Fast", "Renovação"];

  const [pickedProduct, setPickedProduct] = useState("");
  const [pickedIssuance, setPickedIssuance] = useState("");
  const [pickedValidity, setPickedValidity] = useState("");
  const [warrantyInfoOpen, setWarrantyInfoOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // ── Form — dados do titular / empresa ──
  const [form, setForm] = useState({
    certificateId: "",
    clientType: "cpf",
    customerName: "",
    customerCpfCnpj: "",
    customerEmail: "",
    customerPhone: "",
    customerBirthDate: "",
    companyName: "",
    inssNumber: "",
    extendedWarranty: false,
    // endereço do titular (e-CPF) ou da empresa (e-CNPJ — não coletamos mais, mas mantemos para compatibilidade)
    addressZipcode: "",
    addressStreet: "",
    addressNumber: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    repName: "",
    repBirthDate: "",
    repCpf: "",
    repDocTipo: "0",
    repDocNumero: "",
    repDocOrgan: "",
    repDocUf: "",
    customerCei: "",
    customerNis: "",
    repNumeroTipo: "" as "" | "cei" | "nis" | "pis",
    addressComplement: "",
    representanteAddressZipcode: "",
    representanteAddressStreet: "",
    representanteAddressNumber: "",
    representanteAddressComplement: "",
    representanteAddressNeighborhood: "",
    representanteAddressCity: "",
    representanteAddressState: "",
    addressIbge: "",
  });

  // ── Nota Fiscal (etapa 3) ──
  const [nfForm, setNfForm] = useState({
    nfCpfCnpj: "",
    nfNome: "",
    nfZipcode: "",
    nfStreet: "",
    nfNumber: "",
    nfComplement: "",
    nfNeighborhood: "",
    nfCity: "",
    nfState: "",
    nfIbge: "",
  });
  const [nfCepLoading, setNfCepLoading] = useState(false);
  const [nfCepFilled, setNfCepFilled] = useState(false);
  const [nfCnpjLookup, setNfCnpjLookup] = useState("");

  const { data: nfCnpjData, isFetching: nfCnpjFetching } = useQuery({
    ...getCnpjLookupQueryOptions({ cnpj: nfCnpjLookup }),
    enabled: nfCnpjLookup.length === 14,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!nfCnpjData) return;
    const cepMasked = nfCnpjData.cep ? maskCepFn(nfCnpjData.cep.replace(/\D/g, "")) : "";
    setNfForm(prev => ({
      ...prev,
      ...(nfCnpjData.razaoSocial ? { nfNome: prev.nfNome || nfCnpjData.razaoSocial! } : {}),
      ...(cepMasked ? { nfZipcode: cepMasked } : {}),
      ...(nfCnpjData.logradouro ? { nfStreet: nfCnpjData.logradouro } : {}),
      ...(nfCnpjData.numero ? { nfNumber: nfCnpjData.numero } : {}),
      ...(nfCnpjData.bairro ? { nfNeighborhood: nfCnpjData.bairro } : {}),
      ...(nfCnpjData.municipio ? { nfCity: nfCnpjData.municipio } : {}),
      ...(nfCnpjData.uf ? { nfState: nfCnpjData.uf } : {}),
    }));
    if (nfCnpjData.logradouro || nfCnpjData.cep) setNfCepFilled(true);
  }, [nfCnpjData]);

  function setNf(field: string, value: string) {
    setNfForm(prev => ({ ...prev, [field]: value }));
  }

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // ── Auto-fill state ──
  const [autoFilledCustomerName, setAutoFilledCustomerName] = useState(false);
  const [autoFilledRepName, setAutoFilledRepName] = useState(false);

  // ── Coupon ──
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: string; value: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // ── CEP ──
  const [repCepLoading, setRepCepLoading] = useState(false);
  const [repCepFilled, setRepCepFilled] = useState(false);

  // ── Terms ──
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ── Files ──
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhUploading, setCnhUploading] = useState(false);
  const [cnhKey, setCnhKey] = useState<string | null>(null);
  const cnhInputRef = useRef<HTMLInputElement>(null);

  const [cnhVersoFile, setCnhVersoFile] = useState<File | null>(null);
  const [cnhVersoUploading, setCnhVersoUploading] = useState(false);
  const [cnhVersoKey, setCnhVersoKey] = useState<string | null>(null);
  const cnhVersoInputRef = useRef<HTMLInputElement>(null);

  const [cartaoFile, setCartaoFile] = useState<File | null>(null);
  const [cartaoUploading, setCartaoUploading] = useState(false);
  const [cartaoKey, setCartaoKey] = useState<string | null>(null);
  const cartaoInputRef = useRef<HTMLInputElement>(null);

  const [fichaFile, setFichaFile] = useState<File | null>(null);
  const [fichaUploading, setFichaUploading] = useState(false);
  const [fichaKey, setFichaKey] = useState<string | null>(null);
  const fichaInputRef = useRef<HTMLInputElement>(null);

  const [outrosFile, setOutrosFile] = useState<File | null>(null);
  const [outrosUploading, setOutrosUploading] = useState(false);
  const [outrosKey, setOutrosKey] = useState<string | null>(null);
  const outrosInputRef = useRef<HTMLInputElement>(null);

  // ── CNPJ lookup (e-CNPJ RFB) ──
  const [cnpjToQuery, setCnpjToQuery] = useState("");
  const { data: cnpjData, isFetching: cnpjFetching, isError: cnpjError } = useQuery({
    ...getCnpjLookupQueryOptions({ cnpj: cnpjToQuery }),
    enabled: cnpjToQuery.length === 14,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!cnpjData) return;
    setForm(prev => ({
      ...prev,
      ...(cnpjData.razaoSocial ? { companyName: prev.companyName || cnpjData.razaoSocial! } : {}),
    }));
    if (cnpjData.razaoSocial) setAutoFilledCustomerName(true);
  }, [cnpjData]);

  // ── Consulta RFB CNPJ ──
  type CnpjRfbState = null | "loading" | { ok: true; razaoSocial: string } | { ok: false; mensagem: string };
  const [cnpjRfbState, setCnpjRfbState] = useState<CnpjRfbState>(null);
  const cnpjRfbAbortRef = useRef<AbortController | null>(null);

  const triggerCnpjRfb = useCallback(async (cnpj: string, cpf: string, dataNascimento: string) => {
    const cnpjDigits = cnpj.replace(/\D/g, "");
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cnpjDigits.length !== 14 || cpfDigits.length !== 11 || dataNascimento.length !== 10) return;
    cnpjRfbAbortRef.current?.abort();
    const ac = new AbortController();
    cnpjRfbAbortRef.current = ac;
    setCnpjRfbState("loading");
    try {
      const [d, m, y] = dataNascimento.split("/");
      const dateIso = y && m && d ? `${y}-${m}-${d}` : dataNascimento;
      const res = await fetch("/api/orders/cnpj-rfb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cnpj: cnpjDigits, cpf: cpfDigits, dataNascimento: dateIso }),
        signal: ac.signal,
      });
      const data = await res.json() as { ok: boolean; razaoSocial?: string; repName?: string; mensagem?: string };
      if (ac.signal.aborted) return;
      if (data.ok) {
        setCnpjRfbState({ ok: true, razaoSocial: data.razaoSocial ?? "" });
        if (data.razaoSocial) {
          setForm(prev => ({
            ...prev,
            companyName: prev.companyName || data.razaoSocial!,
            ...(data.repName ? { repName: prev.repName || data.repName! } : {}),
          }));
          setAutoFilledCustomerName(true);
          if (data.repName) setAutoFilledRepName(true);
        }
      } else {
        setCnpjRfbState({ ok: false, mensagem: data.mensagem ?? "CPF do responsável não confere com a Receita Federal." });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setCnpjRfbState({ ok: false, mensagem: "Erro ao consultar Safeweb." });
    }
  }, []);

  const triggerConsultaCpf = useCallback(async (cpf: string, dataNascimento: string, target: "customer" | "rep") => {
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11 || dataNascimento.length !== 10) return;
    const abortRef = target === "customer" ? consultaCpfAbortRef : repConsultaCpfAbortRef;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const [d, m, y] = dataNascimento.split("/");
      const dateIso = y && m && d ? `${y}-${m}-${d}` : dataNascimento;
      const res = await fetch("/api/orders/consulta-cpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpf: cpfDigits, dataNascimento: dateIso }),
        signal: ac.signal,
      });
      const data = await res.json() as { ok: boolean; nome?: string; mensagem?: string };
      if (ac.signal.aborted) return;
      if (data.ok && data.nome) {
        if (target === "customer") {
          setForm(prev => ({ ...prev, customerName: data.nome! }));
          setAutoFilledCustomerName(true);
        } else {
          setForm(prev => ({ ...prev, repName: data.nome! }));
          setAutoFilledRepName(true);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──
  const certsWithMeta = certificates ?? [];

  function certPrice(c: NonNullable<typeof certificates>[number]) {
    if (user?.userType === "contador" && c.priceContador != null) return c.priceContador;
    return c.price;
  }

  function validityLabel(months: number) {
    if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
    const years = months / 12;
    return years === 1 ? "1 ano" : `${years} anos`;
  }

  const availableProducts = PRODUCT_OPTIONS_ORDER.filter(p => certsWithMeta.some(c => c.product === p));
  const availableIssuances = ISSUANCE_ORDER.filter(i => certsWithMeta.some(c => c.product === pickedProduct && c.issuanceType === i));
  const availableValidities = Array.from(
    new Set(certsWithMeta.filter(c => c.product === pickedProduct && c.issuanceType === pickedIssuance).map(c => c.validityMonths))
  ).sort((a, b) => (a ?? 0) - (b ?? 0));

  const filteredCerts = certsWithMeta.filter(c =>
    c.product === pickedProduct && c.issuanceType === pickedIssuance && (c.validityMonths ?? 0) === Number(pickedValidity)
  );

  const selectedCert = certificates?.find(c => String(c.id) === form.certificateId);
  const isCnpjCert = selectedCert
    ? (selectedCert.product === "e-CNPJ" || selectedCert.product === "e-PJ" || /cnpj/i.test(selectedCert.name))
    : false;

  const subtotal = (selectedCert ? certPrice(selectedCert) : 0) + (form.extendedWarranty ? 15 : 0);
  const discount = appliedCoupon
    ? appliedCoupon.type === "percent"
      ? Math.round(subtotal * appliedCoupon.value) / 100
      : Math.min(appliedCoupon.value, subtotal)
    : 0;
  const total = Math.max(0, subtotal - discount);

  function pickProduct(p: string) { setPickedProduct(p); setPickedIssuance(""); setPickedValidity(""); set("certificateId", ""); }
  function pickIssuance(i: string) { setPickedIssuance(i); setPickedValidity(""); set("certificateId", ""); }
  function pickValidity(v: string) { setPickedValidity(v); set("certificateId", ""); }

  useEffect(() => {
    if (!selectedCert) return;
    const certIsCnpj = selectedCert.product === "e-CNPJ" || selectedCert.product === "e-PJ" || /cnpj/i.test(selectedCert.name);
    const gCpf = gateCpfRef.current;
    const gDate = gateBirthDateRef.current;
    const gName = gateNameRef.current;
    const maskedCpf = gCpf ? maskCpfCnpj(gCpf) : "";
    const brDate = gDate ? gDate.split("-").reverse().join("/") : "";
    setForm(prev => ({
      ...prev,
      clientType: certIsCnpj ? "cnpj" : "cpf",
      ...(certIsCnpj
        ? { repCpf: maskedCpf || prev.repCpf, repBirthDate: brDate || prev.repBirthDate, repName: gName || prev.repName }
        : {
            customerCpfCnpj: maskedCpf || prev.customerCpfCnpj,
            customerBirthDate: brDate || prev.customerBirthDate,
            customerName: gName || prev.customerName,
            repCpf: maskedCpf || prev.repCpf,
            repBirthDate: brDate || prev.repBirthDate,
            repName: gName || prev.repName,
          }),
    }));
    const isFirstFire = certIdFirstFireRef.current;
    certIdFirstFireRef.current = false;
    if (!isFirstFire) { /* no-op, just prevent unused */ }
    setCnpjToQuery("");
    setAutoFilledCustomerName(!!gName);
    setAutoFilledRepName(!!gName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.certificateId]);

  // ── Mutations ──
  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Pedido criado!", description: `Pedido ${data.orderNumber} criado com sucesso.` });
        try { localStorage.removeItem("lealcert_order_local"); } catch { /* ignore */ }
        setLocation(`/orders/${data.id}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao criar pedido.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const checkPsbio = useConsultaPrevia({
    mutation: {
      onSuccess: (data) => {
        gateHasPsbioRef.current = data.hasPsbio;
        if (data.customerName) gateNameRef.current = data.customerName;
        setGateStatus({ ok: true, hasPsbio: data.hasPsbio, mensagem: data.mensagem });
        const cpfDigits = gateCpfRef.current;
        if (cpfDigits.length === 11) {
          fetch(`/api/orders/pre-fill?cpf=${cpfDigits}`, { credentials: "include" })
            .then(r => r.ok ? r.json() as Promise<PreFillResult> : null)
            .then(d => {
              if (d && (d.responsavel || d.empresas.length > 0 || d.notaFiscal)) setPreFillData(d);
            })
            .catch(() => {});
        }
      },
      onError: (err: unknown) => {
        const raw = (err as { message?: string })?.message ?? "";
        const msg = raw.includes("422")
          ? "CPF inválido — verifique o número digitado."
          : (raw.includes("401") || raw.includes("403"))
            ? "Erro de autenticação com o provedor. Tente novamente."
            : raw.match(/HTTP 5\d\d/)
              ? "Serviço temporariamente indisponível. Tente novamente em instantes."
              : "Não foi possível consultar a biometria. Verifique os dados e tente novamente.";
        setGateStatus({ ok: false, mensagem: msg });
      },
    },
  });

  function triggerGatePsbio() {
    const cpfDigits = gateInputCpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11 || gateInputBirthDate.length !== 10) return;
    gateCpfRef.current = cpfDigits;
    gateBirthDateRef.current = parseBrDate(gateInputBirthDate);
    setGateStatus("loading");
    checkPsbio.mutate({ data: { cpf: cpfDigits, dataNascimento: gateBirthDateRef.current } });
  }

  const validateCouponMutation = useValidateCoupon({
    mutation: {
      onSuccess: (data) => {
        setAppliedCoupon({ code: data.code, type: data.type, value: data.value });
        setCouponError(null);
        toast({ title: "Cupom aplicado!", description: `Desconto de ${data.type === "percent" ? data.value + "%" : formatBRL(data.value)} aplicado.` });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Cupom inválido.";
        setCouponError(msg);
        setAppliedCoupon(null);
      },
    },
  });

  // ── CEP helpers ──
  async function fetchRepCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) { if (repCepFilled) setRepCepFilled(false); return; }
    setRepCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({ ...prev, representanteAddressStreet: data.logradouro || prev.representanteAddressStreet, representanteAddressNeighborhood: data.bairro || prev.representanteAddressNeighborhood, representanteAddressCity: data.localidade || prev.representanteAddressCity, representanteAddressState: data.uf || prev.representanteAddressState, addressIbge: data.ibge || prev.addressIbge }));
        setRepCepFilled(true);
        toast({ title: "CEP do representante encontrado!", description: `${data.localidade} — ${data.uf}` });
      } else { setRepCepFilled(false); }
    } catch { setRepCepFilled(false); }
    setRepCepLoading(false);
  }

  async function fetchNfCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) { if (nfCepFilled) setNfCepFilled(false); return; }
    setNfCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setNfForm(prev => ({ ...prev, nfStreet: data.logradouro || prev.nfStreet, nfNeighborhood: data.bairro || prev.nfNeighborhood, nfCity: data.localidade || prev.nfCity, nfState: data.uf || prev.nfState, nfIbge: data.ibge || prev.nfIbge }));
        setNfCepFilled(true);
        toast({ title: "CEP encontrado!", description: `${data.localidade} — ${data.uf}` });
      } else {
        setNfCepFilled(false);
        toast({ title: "CEP não encontrado", description: "Preencha o endereço manualmente.", variant: "destructive" });
      }
    } catch { setNfCepFilled(false); }
    setNfCepLoading(false);
  }

  // ── Upload helper ──
  async function uploadDoc(file: File, tipo: "cnh" | "cnh-verso" | "cartao-cnpj" | "ficha-cadastral" | "outros", setUploading: (v: boolean) => void, setKey: (k: string) => void, label: string): Promise<string | null> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/upload/${tipo}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload falhou");
      const json = await res.json() as { key: string; url: string };
      setKey(json.key);
      toast({ title: `${label} enviado com sucesso!` });
      return json.key;
    } catch {
      toast({ title: `Erro ao enviar ${label}`, description: "Tente novamente.", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  }

  // ── Step navigation ──
  function proceedToStep2() {
    setStep(2);
    window.scrollTo(0, 0);
  }

  function goToStep2() {
    if (!form.certificateId) {
      toast({ title: "Atenção", description: "Selecione um modelo de certificado.", variant: "destructive" });
      return;
    }
    if (preFillData && (preFillData.responsavel || preFillData.empresas.length > 0)) {
      setShowPreFillModal(true);
      return;
    }
    proceedToStep2();
  }

  // ── Pre-fill helpers ──
  function applyRepFields(rep: NonNullable<PreFillResult["responsavel"]>) {
    const brDate = rep.nascimento ? rep.nascimento.split("-").reverse().join("/") : "";
    setForm(prev => ({
      ...prev,
      repName: rep.nome || prev.repName,
      repBirthDate: brDate || prev.repBirthDate,
      repDocTipo: rep.docTipo || prev.repDocTipo,
      repDocNumero: rep.docNumero || prev.repDocNumero,
      representanteAddressZipcode: rep.addressZipcode ? maskCepFn(rep.addressZipcode) : prev.representanteAddressZipcode,
      representanteAddressStreet: rep.addressStreet || prev.representanteAddressStreet,
      representanteAddressNumber: rep.addressNumber || prev.representanteAddressNumber,
      representanteAddressComplement: rep.addressComplement || prev.representanteAddressComplement,
      representanteAddressNeighborhood: rep.addressNeighborhood || prev.representanteAddressNeighborhood,
      representanteAddressCity: rep.addressCity || prev.representanteAddressCity,
      representanteAddressState: rep.addressState || prev.representanteAddressState,
    }));
    if (rep.addressZipcode) fetchRepCep(rep.addressZipcode);
  }

  function applyEmpresaFields(emp: PreFillEmpresa) {
    setForm(prev => ({
      ...prev,
      customerCpfCnpj: maskCnpj(emp.cnpj),
      companyName: emp.nome || prev.companyName,
      customerEmail: emp.email || prev.customerEmail,
      customerPhone: emp.phone ? maskPhone(emp.phone) : prev.customerPhone,
    }));
  }

  function confirmPreFill() {
    setShowPreFillModal(false);
    proceedToStep2();
  }

  function goToStep3() {
    if (!form.customerEmail) { toast({ title: "Atenção", description: "E-mail é obrigatório.", variant: "destructive" }); return; }
    if (!form.customerPhone) { toast({ title: "Atenção", description: "Telefone é obrigatório.", variant: "destructive" }); return; }
    if (!cnhFile && !cnhKey) { toast({ title: "Atenção", description: "Envie o documento de identificação (frente).", variant: "destructive" }); return; }
    if (!cnhVersoFile && !cnhVersoKey) { toast({ title: "Atenção", description: "Envie o verso do documento (com QR Code).", variant: "destructive" }); return; }
    if (form.repDocTipo === "0") { toast({ title: "Atenção", description: "Selecione o tipo de documento de identificação.", variant: "destructive" }); return; }
    if (!form.repDocNumero) { toast({ title: "Atenção", description: "Informe o número do documento de identificação.", variant: "destructive" }); return; }
    if (isCnpjCert) {
      if (!cartaoFile && !cartaoKey) { toast({ title: "Atenção", description: "Envie o Cartão CNPJ.", variant: "destructive" }); return; }
      if (!fichaFile && !fichaKey) { toast({ title: "Atenção", description: "Envie a Ficha Cadastral.", variant: "destructive" }); return; }
    }
    setStep(3);
    window.scrollTo(0, 0);
  }

  function goToStep4() {
    if (!nfForm.nfCpfCnpj) { toast({ title: "Atenção", description: "Informe o CPF ou CNPJ para a nota fiscal.", variant: "destructive" }); return; }
    if (!nfForm.nfNome) { toast({ title: "Atenção", description: "Informe o nome / razão social para a nota fiscal.", variant: "destructive" }); return; }
    if (!nfForm.nfZipcode) { toast({ title: "Atenção", description: "Informe o CEP de cobrança para a nota fiscal.", variant: "destructive" }); return; }
    setStep(4);
    window.scrollTo(0, 0);
  }

  // ── Submit ──
  async function handleSubmit() {
    let uploadedKey = cnhKey;
    if (cnhFile && !cnhKey) {
      uploadedKey = await uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG (frente)");
      if (!uploadedKey) return;
    }
    let uploadedVersoKey = cnhVersoKey;
    if (cnhVersoFile && !cnhVersoKey) {
      uploadedVersoKey = await uploadDoc(cnhVersoFile, "cnh-verso", setCnhVersoUploading, setCnhVersoKey, "CNH/RG (verso)");
      if (!uploadedVersoKey) return;
    }
    if (isCnpjCert) {
      if (cartaoFile && !cartaoKey) {
        const k = await uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ");
        if (!k) return;
      }
      if (fichaFile && !fichaKey) {
        const k = await uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral");
        if (!k) return;
      }
    }

    const hasPsbioValue = gateHasPsbioRef.current;
    const nfDigits = nfForm.nfCpfCnpj.replace(/\D/g, "");

    createOrder.mutate({
      data: {
        certificateId: Number(form.certificateId),
        clientType: isCnpjCert ? "cnpj" : "cpf",
        customerName: isCnpjCert ? (form.repName || form.customerName) : form.customerName,
        customerCpfCnpj: isCnpjCert ? form.customerCpfCnpj : form.customerCpfCnpj,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        customerBirthDate: form.customerBirthDate ? parseBrDate(form.customerBirthDate) : undefined,
        hasPsbio: hasPsbioValue,
        companyName: form.companyName || undefined,
        inssNumber: form.inssNumber || undefined,
        extendedWarranty: form.extendedWarranty,
        // Para e-CPF: endereço do representante (igual ao titular); para e-CNPJ: não coletamos endereço da empresa
        addressZipcode: form.representanteAddressZipcode || form.addressZipcode || undefined,
        addressStreet: form.representanteAddressStreet || form.addressStreet || undefined,
        addressNumber: form.representanteAddressNumber || form.addressNumber || undefined,
        addressComplement: form.representanteAddressComplement || form.addressComplement || undefined,
        addressNeighborhood: form.representanteAddressNeighborhood || form.addressNeighborhood || undefined,
        addressCity: form.representanteAddressCity || form.addressCity || undefined,
        addressState: form.representanteAddressState || form.addressState || undefined,
        addressIbge: form.addressIbge || undefined,
        representanteCpf: form.repCpf || undefined,
        representanteAddressZipcode: form.representanteAddressZipcode || undefined,
        representanteAddressStreet: form.representanteAddressStreet || undefined,
        representanteAddressNumber: form.representanteAddressNumber || undefined,
        representanteAddressComplement: form.representanteAddressComplement || undefined,
        representanteAddressNeighborhood: form.representanteAddressNeighborhood || undefined,
        representanteAddressCity: form.representanteAddressCity || undefined,
        representanteAddressState: form.representanteAddressState || undefined,
        representanteNascimento: form.repBirthDate ? parseBrDate(form.repBirthDate) : undefined,
        cnhPath: uploadedKey || undefined,
        cnhVersoPath: uploadedVersoKey || undefined,
        termsAccepted: termsAccepted,
        cartaoCnpjPath: cartaoKey || undefined,
        fichaCadastralPath: fichaKey || undefined,
        customerCei: form.customerCei || undefined,
        customerNis: form.customerNis || undefined,
        outrosPath: outrosKey || undefined,
        representanteDocTipo: form.repDocTipo !== "0" ? form.repDocTipo as "1" | "2" | "3" | "4" : undefined,
        representanteDocNumero: form.repDocTipo !== "0" && form.repDocNumero ? form.repDocNumero : undefined,
        representanteDocEmissor: form.repDocTipo !== "0" && form.repDocOrgan && form.repDocUf
          ? (form.repDocOrgan + form.repDocUf).toUpperCase()
          : undefined,
        // NF fields from step 3
        nfCnpj: nfDigits.length === 14 ? nfDigits : undefined,
        nfNome: nfForm.nfNome || undefined,
        nfZipcode: nfForm.nfZipcode.replace(/\D/g, "") || undefined,
        nfStreet: nfForm.nfStreet || undefined,
        nfNumber: nfForm.nfNumber || undefined,
        nfComplement: nfForm.nfComplement || undefined,
        nfNeighborhood: nfForm.nfNeighborhood || undefined,
        nfCity: nfForm.nfCity || undefined,
        nfState: nfForm.nfState || undefined,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!sessionLoaded) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // ── Gate (PSBio) ──────────────────────────────────────────────────────────
  if (!psbioGatePassed) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders">
            <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Novo Pedido</h1>
            <p className="text-sm text-muted-foreground">Verificação prévia de biometria</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm text-blue-800">Atendimento exclusivo por Videoconferência</p>
            <p className="text-sm text-blue-700/80 leading-relaxed">A LealCert emite certificados digitais exclusivamente por videoconferência. Para prosseguir, é necessário que o responsável possua biometria digital cadastrada na rede PSBio.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />Verificação de Biometria PSBio
            </CardTitle>
            <p className="text-sm text-muted-foreground">Informe o CPF e data de nascimento do responsável pelo certificado.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CPF do Responsável *</Label>
                <Input value={gateInputCpf}
                  onChange={e => { setGateInputCpf(maskCpfCnpj(e.target.value)); setGateStatus(null); }}
                  placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento *</Label>
                <Input value={gateInputBirthDate}
                  onChange={e => { setGateInputBirthDate(maskDate(e.target.value)); setGateStatus(null); }}
                  placeholder="dd/mm/aaaa" maxLength={10} />
              </div>
            </div>

            <Button type="button" className="w-full"
              disabled={gateInputCpf.replace(/\D/g, "").length !== 11 || gateInputBirthDate.length !== 10 || gateStatus === "loading"}
              onClick={triggerGatePsbio}>
              {gateStatus === "loading"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
                : <><Search className="h-4 w-4 mr-2" />Verificar Biometria</>}
            </Button>

            {gateStatus && gateStatus !== "loading" && gateStatus.ok && gateStatus.hasPsbio && (<>
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span><strong>Biometria PSBio encontrada!</strong> Prossiga para escolher o certificado.</span>
              </div>
              <Button type="button" className="w-full" onClick={() => setShowTermsModal(true)}>
                Continuar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>)}

            {gateStatus && gateStatus !== "loading" && gateStatus.ok && !gateStatus.hasPsbio && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-700">Biometria PSBio não encontrada</p>
                    <p className="text-amber-600/80 text-xs mt-0.5">Não é possível emitir o certificado por videoconferência. Entre em contato com o suporte para verificar as opções de atendimento.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => setLocation("/support")}>
                  Falar com o Suporte
                </Button>
              </div>
            )}

            {gateStatus && gateStatus !== "loading" && !gateStatus.ok && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{(gateStatus as { ok: false; mensagem: string }).mensagem}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Terms Modal — precisa estar aqui pois o gate faz early return */}
        <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
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
              <button type="button" onClick={() => setShowTermsModal(false)}
                className="flex-1 px-4 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="button"
                onClick={() => {
                  setTermsAccepted(true);
                  setShowTermsModal(false);
                  setPsbioGatePassed(true);
                  window.scrollTo(0, 0);
                }}
                className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                Aceitar e Continuar
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Terms Modal — mantido aqui para pedidos que voltam ao step 1 */}
      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
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
            <button
              type="button"
              onClick={() => setShowTermsModal(false)}
              className="flex-1 px-4 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setTermsAccepted(true);
                setShowTermsModal(false);
                setPsbioGatePassed(true);
                window.scrollTo(0, 0);
              }}
              className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Aceitar e Continuar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-fill Modal */}
      <Dialog open={showPreFillModal} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />Dados encontrados no sistema
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const rep = preFillData?.responsavel;
            const empresas = preFillData?.empresas ?? [];
            const cpfPessoal = preFillData?.cpfPessoal;

            // e-CNPJ: múltiplas empresas
            if (isCnpjCert && empresas.length > 1) {
              return (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Encontramos empresas anteriores vinculadas a este responsável. Selecione uma ou cadastre uma nova:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {empresas.map(emp => (
                      <div key={emp.cnpj} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{emp.nome}</p>
                          <p className="text-xs text-muted-foreground">{maskCnpj(emp.cnpj)}</p>
                        </div>
                        <Button size="sm" onClick={() => { if (rep) applyRepFields(rep); applyEmpresaFields(emp); confirmPreFill(); }}>
                          Usar esta
                        </Button>
                      </div>
                    ))}
                  </div>
                  {rep && (
                    <Button variant="outline" className="w-full" onClick={() => { applyRepFields(rep); confirmPreFill(); }}>
                      Nova empresa (usar só dados do responsável)
                    </Button>
                  )}
                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={confirmPreFill}>
                    Preencher tudo manualmente
                  </Button>
                </div>
              );
            }

            // e-CNPJ: 1 empresa
            if (isCnpjCert && empresas.length === 1) {
              const emp = empresas[0];
              return (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/50 border p-4 space-y-1">
                    <p className="text-sm font-semibold">{emp.nome}</p>
                    <p className="text-xs text-muted-foreground">{maskCnpj(emp.cnpj)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Deseja comprar o certificado para esta empresa?</p>
                  <div className="flex flex-col gap-2">
                    <Button className="w-full" onClick={() => { if (rep) applyRepFields(rep); applyEmpresaFields(emp); confirmPreFill(); }}>
                      Sim, usar esta empresa
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => { if (rep) applyRepFields(rep); confirmPreFill(); }}>
                      Não, é outra empresa
                    </Button>
                  </div>
                </div>
              );
            }

            // e-CNPJ: 0 empresas, mas tem responsável
            if (isCnpjCert && rep) {
              return (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/50 border p-4 space-y-2">
                    <p className="text-sm font-semibold">{rep.nome}</p>
                    {rep.addressCity && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{rep.addressCity}{rep.addressState ? ` — ${rep.addressState}` : ""}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Identificamos dados do responsável em pedidos anteriores. Deseja pré-preencher os campos do representante legal?</p>
                  <div className="flex flex-col gap-2">
                    <Button className="w-full" onClick={() => { applyRepFields(rep); confirmPreFill(); }}>Sim, usar dados do responsável</Button>
                    <Button variant="outline" className="w-full" onClick={confirmPreFill}>Não, preencher manualmente</Button>
                  </div>
                </div>
              );
            }

            // e-CPF/e-PF com responsável encontrado
            if (!isCnpjCert && rep) {
              return (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/50 border p-4 space-y-2">
                    <p className="text-sm font-semibold">{rep.nome}</p>
                    {rep.addressCity && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{rep.addressCity}{rep.addressState ? ` — ${rep.addressState}` : ""}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Identificamos um cadastro anterior para este CPF. Deseja usar os dados já registrados?</p>
                  <div className="flex flex-col gap-2">
                    <Button className="w-full" onClick={() => {
                      applyRepFields(rep);
                      setForm(prev => ({
                        ...prev,
                        customerName: rep.nome || prev.customerName,
                        customerEmail: cpfPessoal?.email || prev.customerEmail,
                        customerPhone: cpfPessoal?.phone ? maskPhone(cpfPessoal.phone) : prev.customerPhone,
                      }));
                      confirmPreFill();
                    }}>Sim, usar dados anteriores</Button>
                    <Button variant="outline" className="w-full" onClick={confirmPreFill}>Não, preencher manualmente</Button>
                  </div>
                </div>
              );
            }

            // Nenhum dado relevante → prosseguir direto
            confirmPreFill();
            return null;
          })()}
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center gap-4">
        {step === 1 ? (
          <Link href="/orders">
            <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { setStep((step - 1) as 1 | 2 | 3 | 4); window.scrollTo(0, 0); }}>
            <ArrowLeft className="h-4 w-4 mr-2" />Voltar
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-sm text-muted-foreground">Certificado Digital — Etapa {step} de 4</p>
        </div>
      </div>

      {/* Step bar */}
      <StepBar current={step} />

      {/* ════════════════════════════════════════
          ETAPA 1 — Escolha do certificado
          ════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Escolha o Certificado Digital</CardTitle>
              <p className="text-sm text-muted-foreground">Selecione o produto, tipo de emissão e validade.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Cascading selector */}
              <div className="grid grid-cols-3 divide-x border rounded-xl overflow-hidden">
                <div className="p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Produto</p>
                  <select value={pickedProduct} onChange={e => pickProduct(e.target.value)}
                    className="w-full appearance-none bg-transparent text-sm font-medium focus:outline-none cursor-pointer">
                    <option value="">Selecione ▾</option>
                    {(availableProducts.length > 0 ? availableProducts : ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"]).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className={["p-3 space-y-1.5 transition-opacity", !pickedProduct ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Emissão</p>
                  <select value={pickedIssuance} onChange={e => pickIssuance(e.target.value)} disabled={!pickedProduct}
                    className="w-full appearance-none bg-transparent text-sm font-medium focus:outline-none cursor-pointer disabled:cursor-default">
                    <option value="">Selecione ▾</option>
                    {(availableIssuances.length > 0 ? availableIssuances : ISSUANCE_ORDER).map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
                <div className={["p-3 space-y-1.5 transition-opacity", !pickedIssuance ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Validade</p>
                  <select value={pickedValidity} onChange={e => pickValidity(e.target.value)} disabled={!pickedIssuance}
                    className="w-full appearance-none bg-transparent text-sm font-medium focus:outline-none cursor-pointer disabled:cursor-default">
                    <option value="">Selecione ▾</option>
                    {availableValidities.map(v => (
                      <option key={v} value={String(v ?? 0)}>{validityLabel(v ?? 0)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cert list */}
              {pickedProduct && pickedIssuance && pickedValidity && (
                filteredCerts.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">Nenhum certificado disponível para essa combinação.</p>
                ) : (
                  <div className="border rounded-xl overflow-hidden divide-y">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 bg-muted/50">
                      <p className="text-xs font-semibold text-muted-foreground">Produto</p>
                      <p className="text-xs font-semibold text-muted-foreground text-right pr-8">Valor</p>
                    </div>
                    {filteredCerts.map(c => {
                      const selected = form.certificateId === String(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => set("certificateId", String(c.id))}
                          className={["w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors", selected ? "bg-primary/5" : "hover:bg-muted/40"].join(" ")}>
                          <div>
                            <p className="font-semibold text-sm">{c.name}</p>
                            {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                          </div>
                          <p className="font-bold text-primary text-sm">{formatBRL(certPrice(c))}</p>
                          <div className={["h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            selected ? "border-primary bg-primary" : "border-muted-foreground/30"].join(" ")}>
                            {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {/* Extended warranty */}
              {form.certificateId && (
                <div className={["border rounded-xl overflow-hidden divide-y transition-colors cursor-pointer", form.extendedWarranty ? "border-amber-300 bg-amber-50/50" : ""].join(" ")}>
                  <button type="button" onClick={() => set("extendedWarranty", !form.extendedWarranty)}
                    className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3.5 text-left">
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-2">
                        Garantia Estendida
                        <button type="button" onClick={e => { e.stopPropagation(); setWarrantyInfoOpen(true); }}
                          className="text-muted-foreground hover:text-primary transition-colors">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Suporte completo por 12 meses em caso de problemas</p>
                    </div>
                    <p className="font-bold text-amber-600 text-sm">+ {formatBRL(15)}</p>
                    <div className={["h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      form.extendedWarranty ? "border-amber-500 bg-amber-500" : "border-muted-foreground/30"].join(" ")}>
                      {form.extendedWarranty && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-center text-sm font-semibold mb-3">Entenda a diferença entre os tipos de emissão</p>
              <Accordion type="multiple" className="divide-y border rounded-xl overflow-hidden">
                {[
                  {
                    value: "videoconferencia", label: "Videoconferência",
                    desc: "Validação de qualquer lugar via videoconferência com o Titular/Responsável.",
                    steps: ["Compra do Certificado", "Validação dos documentos (caso necessário)", "Agendamento da videoconferência", "Videoconferência", "Emissão"],
                  },
                  {
                    value: "presencial", label: "Presencial",
                    desc: "O Titular/Responsável escolhe um local de atendimento para emissão presencial.",
                    steps: ["Compra do Certificado", "Agendamento do atendimento", "Atendimento presencial para emissão", "Validação dos documentos (caso necessário)"],
                  },
                  {
                    value: "fast", label: "Fast",
                    desc: "Emissão imediata e autônoma usando um e-CPF A3 existente para se identificar. Disponível 24h.",
                    steps: ["Compra do certificado", "Validação do pagamento", "Emissão"],
                  },
                  {
                    value: "renovacao", label: "Renovação",
                    desc: "Renovação on-line e autônoma usando um Certificado A3 existente e válido.",
                    steps: ["Escolha do certificado", "Validação do certificado válido existente", "Compra", "Emissão"],
                  },
                ].map(({ value, label, desc, steps }) => (
                  <AccordionItem key={value} value={value} className="border-0">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-primary hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                      {label}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-1 space-y-2">
                      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                      <ol className="text-sm space-y-1 list-none">
                        {steps.map((s, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                            <strong>{s}</strong>
                          </li>
                        ))}
                      </ol>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Button className="w-full h-12 text-base" onClick={goToStep2} disabled={!form.certificateId}>
            Avançar <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* ════════════════════════════════════════
          ETAPA 2 — Dados do titular / empresa
          ════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Cert summary */}
          {selectedCert && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-primary/5">
              <div className="flex items-center gap-2.5">
                <BadgeCheck className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-primary">{selectedCert.name}</p>
                  <p className="text-xs text-muted-foreground">{pickedIssuance} · {validityLabel(selectedCert.validityMonths ?? 0)}</p>
                </div>
              </div>
              <span className="font-bold text-primary">{formatBRL(certPrice(selectedCert))}</span>
            </div>
          )}

          {/* ── e-CPF: dados do responsável ── */}
          {!isCnpjCert && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />Dados do Responsável
                </CardTitle>
                <p className="text-sm text-muted-foreground">Dados do titular do certificado e-CPF.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>CPF *</Label>
                    <div className="relative">
                      <Input value={form.customerCpfCnpj} onChange={e => {
                        const v = maskCpfCnpj(e.target.value);
                        set("customerCpfCnpj", v);
                        const digits = v.replace(/\D/g, "");
                        if (digits.length === 11 && form.customerBirthDate.length === 10) {
                          void triggerConsultaCpf(digits, form.customerBirthDate, "customer");
                        }
                      }} required placeholder="000.000.000-00" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Nascimento *</Label>
                    <div className="relative">
                      <Input value={form.customerBirthDate} onChange={e => {
                        const v = maskDate(e.target.value);
                        set("customerBirthDate", v);
                        if (form.customerCpfCnpj.replace(/\D/g, "").length === 11 && v.length === 10) {
                          void triggerConsultaCpf(form.customerCpfCnpj, v, "customer");
                        }
                      }} placeholder="dd/mm/aaaa" maxLength={10} className="pr-8" />
                      {autoFilledCustomerName && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-1">Nome Completo *{autoFilledCustomerName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.customerName} onChange={e => { set("customerName", e.target.value); setAutoFilledCustomerName(false); }} required
                      className={autoFilledCustomerName ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} required placeholder="cliente@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone / WhatsApp *</Label>
                    <Input value={form.customerPhone} onChange={e => set("customerPhone", maskPhone(e.target.value))} required placeholder="(11) 99999-0000" />
                  </div>
                </div>

                {/* CEI / NIS / PIS */}
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm font-medium">Número Adicional <span className="text-muted-foreground font-normal text-xs">(opcional — escolha apenas um)</span></p>
                  <div className="flex flex-wrap gap-4">
                    {(["cei", "nis", "pis"] as const).map(tipo => (
                      <label key={tipo} className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="radio" name="repNumeroTipo" value={tipo} checked={form.repNumeroTipo === tipo}
                          onChange={() => setForm(f => ({ ...f, repNumeroTipo: tipo, customerCei: tipo === "cei" ? f.customerCei : "", customerNis: tipo === "nis" ? f.customerNis : "", inssNumber: tipo === "pis" ? f.inssNumber : "" }))}
                          className="accent-primary" />
                        <span className="text-sm font-medium">{tipo === "pis" ? "PIS" : tipo.toUpperCase()}</span>
                      </label>
                    ))}
                    {form.repNumeroTipo && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>
                    )}
                  </div>
                  {form.repNumeroTipo === "cei" && <Input value={form.customerCei} onChange={e => set("customerCei", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="CEI — até 12 dígitos" maxLength={12} />}
                  {form.repNumeroTipo === "nis" && <Input value={form.customerNis} onChange={e => set("customerNis", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="NIS — até 11 dígitos" maxLength={11} />}
                  {form.repNumeroTipo === "pis" && <Input value={form.inssNumber} onChange={e => set("inssNumber", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="PIS — 11 dígitos" maxLength={11} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── e-CNPJ: empresa + representante ── */}
          {isCnpjCert && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />Dados da Empresa
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Informe o CNPJ e a razão social. O representante será validado automaticamente.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>CNPJ *</Label>
                      <div className="relative">
                        <Input value={form.customerCpfCnpj} onChange={e => {
                          const v = maskCnpj(e.target.value);
                          set("customerCpfCnpj", v);
                          const digits = v.replace(/\D/g, "");
                          if (digits.length === 14) {
                            setCnpjToQuery(digits);
                            setCnpjRfbState(null);
                            if (form.repCpf.replace(/\D/g, "").length === 11 && form.repBirthDate.length === 10) {
                              void triggerCnpjRfb(v, form.repCpf, form.repBirthDate);
                            }
                          } else { setCnpjToQuery(""); setAutoFilledCustomerName(false); setCnpjRfbState(null); }
                        }} required placeholder="00.000.000/0001-00" className="pr-8" />
                        {cnpjFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Razão Social *
                        {(cnpjFetching || cnpjRfbState === "loading") && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        {!cnpjFetching && cnpjRfbState && cnpjRfbState !== "loading" && cnpjRfbState.ok && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                      </Label>
                      <Input value={form.companyName} onChange={e => { set("companyName", e.target.value); setAutoFilledCustomerName(false); }} required
                        className={(cnpjRfbState && cnpjRfbState !== "loading" && cnpjRfbState.ok) && form.companyName ? "bg-emerald-50 border-emerald-200" : ""}
                        placeholder={cnpjFetching || cnpjRfbState === "loading" ? "Consultando..." : ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail da Empresa *</Label>
                      <Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} required placeholder="empresa@email.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone / WhatsApp *</Label>
                      <Input value={form.customerPhone} onChange={e => set("customerPhone", maskPhone(e.target.value))} required placeholder="(11) 99999-0000" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />Dados do Representante Legal
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Pessoa física responsável pela emissão do certificado.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>CPF do Representante *</Label>
                      <Input value={form.repCpf} onChange={e => {
                        const v = maskCpfCnpj(e.target.value);
                        set("repCpf", v);
                        setCnpjRfbState(null);
                        const cpfDigits = v.replace(/\D/g, "");
                        if (cpfDigits.length === 11 && form.repBirthDate.length === 10) {
                          void triggerCnpjRfb(form.customerCpfCnpj, v, form.repBirthDate);
                        }
                      }} placeholder="000.000.000-00" maxLength={14} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Nascimento do Representante *</Label>
                      <Input value={form.repBirthDate} onChange={e => {
                        const v = maskDate(e.target.value);
                        set("repBirthDate", v);
                        setCnpjRfbState(null);
                        if (form.repCpf.replace(/\D/g, "").length === 11 && v.length === 10) {
                          void triggerCnpjRfb(form.customerCpfCnpj, form.repCpf, v);
                        }
                      }} placeholder="dd/mm/aaaa" maxLength={10} required />
                    </div>
                    {cnpjRfbState && cnpjRfbState !== "loading" && cnpjRfbState.ok && (
                      <div className="sm:col-span-2 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        <span>RFB confirmado — <strong>{cnpjRfbState.razaoSocial}</strong></span>
                      </div>
                    )}
                    {cnpjRfbState && cnpjRfbState !== "loading" && !cnpjRfbState.ok && (
                      <div className="sm:col-span-2 flex items-center gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <XCircle className="h-4 w-4 shrink-0" />
                        <span>{(cnpjRfbState as { ok: false; mensagem: string }).mensagem}</span>
                      </div>
                    )}
                    {cnpjError && cnpjToQuery.length === 14 && cnpjRfbState !== "loading" && !(cnpjRfbState && (cnpjRfbState as {ok:boolean}).ok) && (
                      <p className="sm:col-span-2 text-xs text-destructive">CNPJ não encontrado. Preencha a razão social manualmente.</p>
                    )}
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="flex items-center gap-1">
                        Nome Completo do Representante *
                        {autoFilledRepName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input value={form.repName} onChange={e => { set("repName", e.target.value); setAutoFilledRepName(false); }} required
                        className={autoFilledRepName ? "bg-emerald-50 border-emerald-200" : ""} />
                    </div>
                  </div>

                  {/* CEI / NIS / PIS */}
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium">Número Adicional <span className="text-muted-foreground font-normal text-xs">(opcional — escolha apenas um)</span></p>
                    <div className="flex flex-wrap gap-4">
                      {(["cei", "nis", "pis"] as const).map(tipo => (
                        <label key={tipo} className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="radio" name="repNumeroTipo" value={tipo} checked={form.repNumeroTipo === tipo}
                            onChange={() => setForm(f => ({ ...f, repNumeroTipo: tipo, customerCei: tipo === "cei" ? f.customerCei : "", customerNis: tipo === "nis" ? f.customerNis : "", inssNumber: tipo === "pis" ? f.inssNumber : "" }))}
                            className="accent-primary" />
                          <span className="text-sm font-medium">{tipo === "pis" ? "PIS" : tipo.toUpperCase()}</span>
                        </label>
                      ))}
                      {form.repNumeroTipo && (
                        <button type="button" onClick={() => setForm(f => ({ ...f, repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "" }))} className="text-xs text-muted-foreground hover:text-destructive">limpar</button>
                      )}
                    </div>
                    {form.repNumeroTipo === "cei" && <Input value={form.customerCei} onChange={e => set("customerCei", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="CEI — até 12 dígitos" maxLength={12} />}
                    {form.repNumeroTipo === "nis" && <Input value={form.customerNis} onChange={e => set("customerNis", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="NIS — até 11 dígitos" maxLength={11} />}
                    {form.repNumeroTipo === "pis" && <Input value={form.inssNumber} onChange={e => set("inssNumber", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="PIS — 11 dígitos" maxLength={11} />}
                  </div>

                  {/* Endereço do representante */}
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-4 w-4 text-primary" />Endereço do Representante Legal *</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>CEP *</Label>
                        <div className="relative">
                          <Input value={form.representanteAddressZipcode} onChange={e => { const m = maskCepFn(e.target.value); set("representanteAddressZipcode", m); fetchRepCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                            {repCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="flex items-center gap-1">Rua / Logradouro *{repCepFilled && form.representanteAddressStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                        <Input value={form.representanteAddressStreet} onChange={e => set("representanteAddressStreet", e.target.value)} className={repCepFilled && form.representanteAddressStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>Número *</Label>
                        <Input value={form.representanteAddressNumber} onChange={e => set("representanteAddressNumber", e.target.value)} placeholder="123" />
                      </div>
                      <div className="space-y-2">
                        <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                        <Input value={form.representanteAddressComplement} onChange={e => set("representanteAddressComplement", e.target.value)} placeholder="Apto, Sala..." maxLength={20} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">Bairro{repCepFilled && form.representanteAddressNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                        <Input value={form.representanteAddressNeighborhood} onChange={e => set("representanteAddressNeighborhood", e.target.value)} className={repCepFilled && form.representanteAddressNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">Cidade{repCepFilled && form.representanteAddressCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                        <Input value={form.representanteAddressCity} onChange={e => set("representanteAddressCity", e.target.value)} className={repCepFilled && form.representanteAddressCity ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">UF{repCepFilled && form.representanteAddressState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                        <Input value={form.representanteAddressState} onChange={e => set("representanteAddressState", e.target.value)} maxLength={2} placeholder="SP" className={repCepFilled && form.representanteAddressState ? "bg-emerald-50 border-emerald-200" : ""} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">IBGE{form.addressIbge && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                        <Input value={form.addressIbge} readOnly placeholder="—" className={form.addressIbge ? "bg-emerald-50 border-emerald-200 text-muted-foreground" : "text-muted-foreground"} />
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </>
          )}

          {/* ── e-CPF: endereço do responsável ── */}
          {!isCnpjCert && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Endereço do Responsável</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input value={form.representanteAddressZipcode} onChange={e => { const m = maskCepFn(e.target.value); set("representanteAddressZipcode", m); fetchRepCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {repCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-1">Rua / Logradouro{repCepFilled && form.representanteAddressStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.representanteAddressStreet} onChange={e => set("representanteAddressStreet", e.target.value)} className={repCepFilled && form.representanteAddressStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={form.representanteAddressNumber} onChange={e => set("representanteAddressNumber", e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input value={form.representanteAddressComplement} onChange={e => set("representanteAddressComplement", e.target.value)} placeholder="Apto, Sala..." maxLength={20} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Bairro{repCepFilled && form.representanteAddressNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.representanteAddressNeighborhood} onChange={e => set("representanteAddressNeighborhood", e.target.value)} className={repCepFilled && form.representanteAddressNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Cidade{repCepFilled && form.representanteAddressCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.representanteAddressCity} onChange={e => set("representanteAddressCity", e.target.value)} className={repCepFilled && form.representanteAddressCity ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">UF{repCepFilled && form.representanteAddressState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.representanteAddressState} onChange={e => set("representanteAddressState", e.target.value)} maxLength={2} placeholder="SP" className={repCepFilled && form.representanteAddressState ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">IBGE{form.addressIbge && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={form.addressIbge} readOnly placeholder="—" className={form.addressIbge ? "bg-emerald-50 border-emerald-200 text-muted-foreground" : "text-muted-foreground"} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Documento de Identificação (todos os tipos) ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />Documento de Identificação *
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Documento *</Label>
                <select value={form.repDocTipo} onChange={e => setForm(f => ({ ...f, repDocTipo: e.target.value, repDocNumero: "", repDocOrgan: "", repDocUf: "" }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="0">Selecione o tipo</option>
                  <option value="1">RG</option><option value="2">RNE</option><option value="3">Passaporte</option><option value="4">CNH</option>
                </select>
              </div>
              {form.repDocTipo !== "0" && (
                <>
                  <div className="space-y-2">
                    <Label>Número do Documento *</Label>
                    <Input value={form.repDocNumero} onChange={e => set("repDocNumero", e.target.value)} placeholder={form.repDocTipo === "3" ? "Ex: BR123456" : "Ex: 12.345.678-9"} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Órgão Expedidor <span className="text-muted-foreground font-normal text-xs">(máx. 4 car.)</span></Label>
                      <Input value={form.repDocOrgan} onChange={e => set("repDocOrgan", e.target.value.toUpperCase().slice(0, 4))} placeholder="SSP" maxLength={4} />
                    </div>
                    <div className="space-y-2">
                      <Label>UF</Label>
                      <select value={form.repDocUf} onChange={e => set("repDocUf", e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        <option value="">Selecione</option>
                        {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Documentos ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Documentos *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                <p className="font-semibold mb-1">Documento de Identificação — Instruções</p>
                <p>RG ou CNH Física: Aberta, fora do plástico e bem enquadrada. A foto deve ser feita a partir do documento original. Enviar também o verso com QR Code.</p>
                <p className="mt-1">CNH ou RG Digital: Exportada do aplicativo, com o QR Code, em PDF.</p>
              </div>

              <div>
                <Label className="mb-2 block">CNH ou RG — Frente *</Label>
                <p className="text-xs text-muted-foreground mb-2">Foto ou cópia da frente da CNH ou RG (PDF, JPG ou PNG, máx. 5 MB).</p>
                <UploadWidget
                  label="Clique para selecionar arquivo" hint="PDF, JPG, JPEG ou PNG — máx. 5 MB"
                  file={cnhFile} fileKey={cnhKey} uploading={cnhUploading}
                  inputRef={cnhInputRef}
                  onChange={f => { if (f && f.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCnhFile(f); setCnhKey(null); }}
                  onUpload={() => cnhFile && uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG (frente)")}
                  onClear={() => { setCnhFile(null); setCnhKey(null); if (cnhInputRef.current) cnhInputRef.current.value = ""; }}
                />
              </div>

              <div>
                <Label className="mb-2 block">CNH ou RG — Verso * <span className="text-xs font-normal text-muted-foreground">(com QR Code)</span></Label>
                <p className="text-xs text-muted-foreground mb-2">Foto ou cópia do verso da CNH ou RG com o QR Code (PDF, JPG ou PNG, máx. 5 MB).</p>
                <UploadWidget
                  label="Clique para selecionar arquivo" hint="PDF, JPG, JPEG ou PNG — máx. 5 MB"
                  file={cnhVersoFile} fileKey={cnhVersoKey} uploading={cnhVersoUploading}
                  inputRef={cnhVersoInputRef}
                  onChange={f => { if (f && f.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCnhVersoFile(f); setCnhVersoKey(null); }}
                  onUpload={() => cnhVersoFile && uploadDoc(cnhVersoFile, "cnh-verso", setCnhVersoUploading, setCnhVersoKey, "CNH/RG (verso)")}
                  onClear={() => { setCnhVersoFile(null); setCnhVersoKey(null); if (cnhVersoInputRef.current) cnhVersoInputRef.current.value = ""; }}
                />
              </div>

              {form.repNumeroTipo && (
                <div>
                  <Label className="mb-2 block">Documento comprobatório ({form.repNumeroTipo === "pis" ? "PIS" : form.repNumeroTipo.toUpperCase()})</Label>
                  <p className="text-xs text-muted-foreground mb-2">Documento que comprove o {form.repNumeroTipo === "pis" ? "PIS" : form.repNumeroTipo.toUpperCase()} informado.</p>
                  <UploadWidget
                    label="Clique para selecionar arquivo" hint="PDF, JPG, JPEG ou PNG — máx. 5 MB"
                    file={outrosFile} fileKey={outrosKey} uploading={outrosUploading}
                    inputRef={outrosInputRef}
                    onChange={f => { if (f && f.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setOutrosFile(f); setOutrosKey(null); }}
                    onUpload={() => outrosFile && uploadDoc(outrosFile, "outros", setOutrosUploading, setOutrosKey, "Documento comprobatório")}
                    onClear={() => { setOutrosFile(null); setOutrosKey(null); if (outrosInputRef.current) outrosInputRef.current.value = ""; }}
                  />
                </div>
              )}

              {isCnpjCert && (
                <>
                  <div>
                    <Label className="mb-2 block">Cartão CNPJ *</Label>
                    <p className="text-xs text-muted-foreground mb-2">Cartão CNPJ emitido pela Receita Federal (PDF, JPG ou PNG, máx. 5 MB).</p>
                    <UploadWidget
                      label="Clique para selecionar arquivo" hint="PDF, JPG, JPEG ou PNG — máx. 5 MB"
                      file={cartaoFile} fileKey={cartaoKey} uploading={cartaoUploading}
                      inputRef={cartaoInputRef}
                      onChange={f => { if (f && f.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCartaoFile(f); setCartaoKey(null); }}
                      onUpload={() => cartaoFile && uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ")}
                      onClear={() => { setCartaoFile(null); setCartaoKey(null); if (cartaoInputRef.current) cartaoInputRef.current.value = ""; }}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Ficha Cadastral Completa *</Label>
                    <p className="text-xs text-muted-foreground mb-2">Ficha cadastral completa da empresa (PDF, JPG ou PNG, máx. 5 MB).</p>
                    <UploadWidget
                      label="Clique para selecionar arquivo" hint="PDF, JPG, JPEG ou PNG — máx. 5 MB"
                      file={fichaFile} fileKey={fichaKey} uploading={fichaUploading}
                      inputRef={fichaInputRef}
                      onChange={f => { if (f && f.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setFichaFile(f); setFichaKey(null); }}
                      onUpload={() => fichaFile && uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral")}
                      onClear={() => { setFichaFile(null); setFichaKey(null); if (fichaInputRef.current) fichaInputRef.current.value = ""; }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Button className="w-full h-12 text-base" onClick={goToStep3}
            disabled={isCnpjCert && !(cnpjRfbState && cnpjRfbState !== "loading" && (cnpjRfbState as { ok: boolean }).ok)}>
            Avançar para Nota Fiscal <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* ════════════════════════════════════════
          ETAPA 3 — Nota Fiscal
          ════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          {selectedCert && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-primary/5">
              <div className="flex items-center gap-2.5">
                <BadgeCheck className="h-5 w-5 text-primary shrink-0" />
                <p className="text-sm font-semibold text-primary">{selectedCert.name}</p>
              </div>
              <span className="font-bold text-primary">{formatBRL(certPrice(selectedCert))}</span>
            </div>
          )}

          {preFillData?.notaFiscal && !preFillNfOffered && !nfForm.nfCpfCnpj && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <Sparkles className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-800">Dados de nota fiscal anteriores encontrados</p>
                <p className="text-xs text-blue-700/80 mt-0.5">Emitido para <strong>{preFillData.notaFiscal.nome}</strong>. Deseja usar os mesmos dados?</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => {
                    const nf = preFillData.notaFiscal!;
                    setNfForm(prev => ({
                      ...prev,
                      nfCpfCnpj: nf.cpfCnpj ? maskCpfCnpj(nf.cpfCnpj) : prev.nfCpfCnpj,
                      nfNome: nf.nome || prev.nfNome,
                      nfZipcode: nf.zipcode ? maskCepFn(nf.zipcode) : prev.nfZipcode,
                      nfStreet: nf.street || prev.nfStreet,
                      nfNumber: nf.number || prev.nfNumber,
                      nfComplement: nf.complement || prev.nfComplement,
                      nfNeighborhood: nf.neighborhood || prev.nfNeighborhood,
                      nfCity: nf.city || prev.nfCity,
                      nfState: nf.state || prev.nfState,
                    }));
                    if (nf.zipcode) fetchNfCep(nf.zipcode);
                    setPreFillNfOffered(true);
                  }}>Sim, usar estes dados</Button>
                  <Button size="sm" variant="outline" onClick={() => setPreFillNfOffered(true)}>Não, preencher manualmente</Button>
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />Dados para Nota Fiscal
              </CardTitle>
              <p className="text-sm text-muted-foreground">Informe os dados para emissão da nota fiscal do certificado.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CPF ou CNPJ *</Label>
                  <div className="relative">
                    <Input value={nfForm.nfCpfCnpj} onChange={e => {
                      const v = maskCpfCnpj(e.target.value);
                      setNf("nfCpfCnpj", v);
                      const digits = v.replace(/\D/g, "");
                      if (digits.length === 14) {
                        setNfCnpjLookup(digits);
                      } else { setNfCnpjLookup(""); }
                    }} required placeholder="CPF (000.000.000-00) ou CNPJ" />
                    {nfCnpjFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Nome / Razão Social *
                    {nfCnpjFetching && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  </Label>
                  <Input value={nfForm.nfNome} onChange={e => setNf("nfNome", e.target.value)} required
                    placeholder={nfCnpjFetching ? "Consultando..." : "Nome completo ou Razão Social"}
                    className={nfCnpjData?.razaoSocial && nfForm.nfNome ? "bg-emerald-50 border-emerald-200" : ""} />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-4 w-4 text-primary" />Endereço de Cobrança *</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>CEP *</Label>
                    <div className="relative">
                      <Input value={nfForm.nfZipcode} onChange={e => { const m = maskCepFn(e.target.value); setNf("nfZipcode", m); fetchNfCep(m); }} placeholder="00000-000" maxLength={9} className="pr-9" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {nfCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-1">Rua / Logradouro *{nfCepFilled && nfForm.nfStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={nfForm.nfStreet} onChange={e => setNf("nfStreet", e.target.value)} className={nfCepFilled && nfForm.nfStreet ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Número *</Label>
                    <Input value={nfForm.nfNumber} onChange={e => setNf("nfNumber", e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input value={nfForm.nfComplement} onChange={e => setNf("nfComplement", e.target.value)} placeholder="Apto, Sala..." maxLength={20} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Bairro{nfCepFilled && nfForm.nfNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={nfForm.nfNeighborhood} onChange={e => setNf("nfNeighborhood", e.target.value)} className={nfCepFilled && nfForm.nfNeighborhood ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Cidade{nfCepFilled && nfForm.nfCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={nfForm.nfCity} onChange={e => setNf("nfCity", e.target.value)} className={nfCepFilled && nfForm.nfCity ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">UF{nfCepFilled && nfForm.nfState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={nfForm.nfState} onChange={e => setNf("nfState", e.target.value)} maxLength={2} placeholder="SP" className={nfCepFilled && nfForm.nfState ? "bg-emerald-50 border-emerald-200" : ""} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">IBGE{nfForm.nfIbge && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}</Label>
                    <Input value={nfForm.nfIbge} readOnly placeholder="—" className={nfForm.nfIbge ? "bg-emerald-50 border-emerald-200 text-muted-foreground" : "text-muted-foreground"} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full h-12 text-base" onClick={goToStep4}>
            Avançar para Pagamento <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* ════════════════════════════════════════
          ETAPA 4 — Pagamento
          ════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-6">
          {/* Resumo */}
          <Card>
            <CardHeader><CardTitle>Resumo do Pedido</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedCert && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{selectedCert.name}</span>
                    <span className="font-medium">{formatBRL(certPrice(selectedCert))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tipo de emissão</span>
                    <span>{pickedIssuance}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Validade</span>
                    <span>{validityLabel(selectedCert.validityMonths ?? 0)}</span>
                  </div>
                  {form.extendedWarranty && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Garantia Estendida</span>
                      <span className="font-medium">{formatBRL(15)}</span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Cupom {appliedCoupon.code}</span>
                      <span>- {formatBRL(discount)}</span>
                    </div>
                  )}
                  <div className="border-t pt-3 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatBRL(total)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Cupom */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4 text-primary" />Cupom de Desconto</CardTitle>
            </CardHeader>
            <CardContent>
              {appliedCoupon ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="flex-1 text-sm font-mono font-semibold text-emerald-700">{appliedCoupon.code}</span>
                  <button type="button" onClick={() => { setAppliedCoupon(null); setCouponCode(""); setCouponError(null); }} className="text-emerald-600 hover:text-emerald-800">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }} placeholder="CÓDIGO" className={`font-mono uppercase text-sm ${couponError ? "border-destructive" : ""}`}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (couponCode.trim()) validateCouponMutation.mutate({ data: { code: couponCode.trim() } }); } }} />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={!couponCode.trim() || validateCouponMutation.isPending}
                      onClick={() => validateCouponMutation.mutate({ data: { code: couponCode.trim() } })}>
                      {validateCouponMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                    </Button>
                  </div>
                  {couponError && <p className="flex items-center gap-1.5 text-xs text-destructive mt-2"><XCircle className="h-3.5 w-3.5 shrink-0" />{couponError}</p>}
                </>
              )}
            </CardContent>
          </Card>

          {/* Forma de pagamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Forma de Pagamento</CardTitle>
              <p className="text-sm text-muted-foreground">O link de pagamento será gerado após a confirmação do pedido.</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 border rounded-xl p-4 bg-primary/5 border-primary/20">
                <div className="h-12 w-12 rounded-xl bg-[#32BCAD]/10 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
                    <path d="M11.7 36.3c1.9 1.9 4.4 2.9 7.1 2.9h10.4c2.6 0 5.2-1 7.1-2.9l7.3-7.3c3.9-3.9 3.9-10.2 0-14.1l-7.3-7.3c-1.9-1.9-4.4-2.9-7.1-2.9H18.8c-2.6 0-5.2 1-7.1 2.9L4.4 15c-3.9 3.9-3.9 10.2 0 14.1l7.3 7.2z" fill="#32BCAD"/>
                    <path d="M17.5 28.5l-3.5-3.5 3.5-3.5M30.5 28.5l3.5-3.5-3.5-3.5M21 30l6-12" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-base">PIX</p>
                  <p className="text-sm text-muted-foreground">Aprovação imediata · disponível 24h</p>
                </div>
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Pagamento processado com segurança via <strong>Mercado Pago</strong>
              </p>
            </CardContent>
          </Card>

          {/* Agendamento info */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-blue-50 border-blue-200 text-sm text-blue-800">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
            <p><strong>Agendamento após pagamento.</strong> O horário de atendimento será selecionado na tela de detalhes do pedido, assim que o pagamento for confirmado.</p>
          </div>

          {/* Confirmar */}
          <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={createOrder.isPending}>
            {createOrder.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando pedido...</>
              : <>Confirmar e Ir para Pagamento <ArrowRight className="h-4 w-4 ml-2" /></>}
          </Button>
          <p className="text-xs text-center text-muted-foreground -mt-2">
            Ao confirmar, você concorda com a{" "}
            <button type="button" onClick={() => setPrivacyOpen(true)} className="underline underline-offset-2 hover:text-primary transition-colors">
              Política de Privacidade
            </button>
          </p>
        </div>
      )}

      {/* Warranty info dialog */}
      <Dialog open={warrantyInfoOpen} onOpenChange={setWarrantyInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Garantia Estendida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>A Garantia Estendida oferece suporte completo por <strong>12 meses</strong> em caso de qualquer problema com o certificado digital:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Revogação por motivo de perda ou roubo do dispositivo</li>
              <li>Problemas técnicos na instalação do certificado</li>
              <li>Suporte prioritário via WhatsApp e e-mail</li>
              <li>Re-emissão sem custo adicional em caso de falha técnica comprovada</li>
            </ul>
            <p className="text-xs">Valor: R$ 15,00 (único, pago junto com o certificado).</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy dialog */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-w-3xl flex flex-col p-0 overflow-hidden" style={{ maxHeight: "88vh" }}>
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle>Política de Privacidade e Uso de Dados Pessoais</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Versão 5.1 — Última atualização: 23/02/2026</p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6 py-6 space-y-8 text-sm">
            <PPSection title="1. Introdução">
              <p>A Política de Privacidade e Uso de Dados Pessoais tem como objetivo principal evidenciar a transparência do compromisso da Safeweb em garantir a proteção dos dados fornecidos pelos titulares de dados pessoais.</p>
              <p>Não fornecemos informações pessoais para terceiros sem a devida autorização e não divulgamos informações que possam identificar os titulares dos dados, salvo em casos de pedido judicial ou determinação legal.</p>
              <p>A aceitação da nossa Política se dará quando você acessar ou utilizar o site, aplicativo ou serviços da Safeweb, em observância à Lei Geral de Proteção de Dados Pessoais n° 13.709/2018 (LGPD).</p>
            </PPSection>
            <PPSection title="2. Definições">
              <dl className="space-y-2">
                {([
                  ["Agentes de tratamento", "O controlador e o operador."],
                  ["ANPD", "Autoridade Nacional de Proteção de Dados."],
                  ["Consentimento", "Manifestação livre, informada e inequívoca pela qual o titular concorda com o tratamento de seus dados pessoais para uma finalidade determinada."],
                  ["Controlador", "Aquele que toma as decisões referentes ao tratamento de dados pessoais."],
                  ["Cookie", "Pequeno pedaço de informação que um site atribui ao dispositivo do titular enquanto visualiza um site."],
                  ["Dado Pessoal", "Informação relacionada a pessoa natural identificada ou identificável."],
                  ["Dado Pessoal Sensível", "Dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, dado referente à saúde ou à vida sexual, dado genético ou biométrico."],
                  ["DPO (Encarregado)", "Canal de comunicação entre o controlador, os titulares dos dados e a ANPD."],
                  ["ITI", "Instituto Nacional de Tecnologia da Informação — Autoridade Certificadora Raiz da ICP-Brasil."],
                  ["Titular", "Pessoa natural a quem se referem os dados pessoais tratados pela Safeweb."],
                ] as [string, string][]).map(([term, def]) => (
                  <div key={term}>
                    <dt className="font-semibold text-foreground">{term}</dt>
                    <dd className="text-muted-foreground ml-4">{def}</dd>
                  </div>
                ))}
              </dl>
            </PPSection>
            <PPSection title="3. Direitos dos Usuários sobre os Dados Pessoais">
              <PPSub title="3.1 Direito de Revogação"><p>Titulares de dados pessoais tratados pela Safeweb poderão solicitar a revogação das permissões de uso de dados, uma vez que o prazo legal do tratamento esteja expirado.</p></PPSub>
              <PPSub title="3.2 Direito de Divulgação"><p>A Safeweb não divulga os dados pessoais dos titulares, exceto por determinação legal ou a pedido do próprio titular do dado.</p></PPSub>
              <PPSub title="3.3 Direito de Retificação"><p>O titular tem direito de solicitar a retificação de seus dados pessoais incompletos, inexatos ou desatualizados, exceto informações contidas dentro dos Certificados Digitais, gravadas no momento da emissão.</p></PPSub>
              <PPSub title="3.4 Direito à Exclusão"><p>O titular tem direito à exclusão definitiva dos dados pessoais que tiver fornecido à Safeweb, ao término da relação entre as partes, quando ultrapassado o período obrigatório de armazenamento.</p></PPSub>
              <PPSub title="3.5 Direito à Portabilidade"><p>As solicitações de portabilidade de dados serão analisadas caso a caso, via <a href="https://portaldotitular.safecomply.com.br/safecomply/safeweb" target="_blank" rel="noopener noreferrer" className="text-primary underline">portaldotitular.safecomply.com.br</a>.</p></PPSub>
            </PPSection>
            <PPSection title="4. Responsabilidades dos Titulares">
              <p>Os titulares dos dados pessoais têm a obrigação de assegurar que os dados fornecidos à Safeweb são precisos, completos e atualizados.</p>
            </PPSection>
            <PPSection title="5. Política de Cookies">
              <p>Ao utilizar o nosso site, você concorda com a utilização dos cookies. Cookies são arquivos de texto que visam facilitar ou aprimorar a experiência do usuário. Você pode alterar a configuração a qualquer tempo no seu navegador.</p>
              <ul className="list-disc ml-5 mt-2 space-y-1 text-muted-foreground">
                {["Preferências, recursos e serviços", "Plugins", "Publicidade personalizada", "Análise e pesquisa", "Usabilidade", "Essenciais"].map(c => <li key={c}>{c}</li>)}
              </ul>
            </PPSection>
            <PPSection title="6. Controlador de Dados">
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-border">
                    {([
                      ["Nome", "Safeweb Segurança da Informação Ltda."],
                      ["CNPJ", "01.579.286/0001-74"],
                      ["Endereço", "Av. Princesa Isabel, 828 – Santana – Porto Alegre/RS – CEP 90620-000"],
                      ["Encarregado (DPO)", "Gisele Strey"],
                      ["E-mail", "privacidade@safeweb.com.br"],
                      ["Telefones", "+55 0800-728-5900 | +55 51 3018-0300"],
                    ] as [string, string][]).map(([k, v]) => (
                      <tr key={k}>
                        <td className="px-3 py-2 font-semibold text-foreground bg-muted w-1/3">{k}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PPSection>
            <PPSection title="7. Sobre o Tratamento dos Seus Dados Pessoais">
              <PPSub title="7.1 Quais informações são coletadas?">
                <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                  {["Nome", "CPF, RG, CNH, Título de Eleitor, PIS, RNE ou passaporte", "Data de nascimento", "E-mail", "Número de telefone", "Endereço / código postal / país", "Dados biométricos (face, digitais e voz)", "Dados financeiros"].map(i => <li key={i}>{i}</li>)}
                </ul>
              </PPSub>
              <PPSub title="7.4 Base Legal">
                <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                  {["Cumprimento da obrigação legal e regulatória pelo Controlador", "Garantia de prevenção à fraude e segurança do titular", "Para a execução dos serviços e produtos contratados", "Legítimo interesse do Controlador"].map(i => <li key={i}>{i}</li>)}
                </ul>
              </PPSub>
              <PPSub title="7.7 Por quanto tempo armazenamos seus dados?">
                <p>Para dados pessoais de titulares de certificação digital, por no mínimo 7 (sete) anos a partir da expiração ou revogação do Certificado Digital, conforme DOC-ICP-05, item 5.5.2.</p>
              </PPSub>
            </PPSection>
            <PPSection title="8. Atualização da Política">
              <p>A Safeweb se reserva ao direito de alterar essa Política periodicamente. Sempre que houver alterações que ensejem novas autorizações, será publicada uma nova versão sujeita a novo consentimento.</p>
            </PPSection>
          </div>
          <div className="px-6 py-4 border-t shrink-0">
            <Button className="w-full" onClick={() => setPrivacyOpen(false)}>Entendi e Aceito</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
