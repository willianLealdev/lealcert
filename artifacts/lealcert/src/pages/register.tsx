import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Eye, EyeOff, ArrowLeft, Briefcase, User,
  CheckCircle2, XCircle, AlertCircle, Building2, MapPin,
} from "lucide-react";

// ── Máscaras ──────────────────────────────────────────────────────────────────
function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
    [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
  );
}
function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
    `${a}.${b}.${c}/${dd}${e ? "-" + e : ""}`
  );
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ""}`);
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ""}`);
}
function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, (_, a, b) => (b ? `${a}-${b}` : a));
}
function normalizeCrc(v: string): string {
  return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{2})(\d{2})(\d{0,4})/, (_, a, b, c) => c ? `${a}/${b}/${c}` : b ? `${a}/${b}` : a);
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface CrcResult { valid: boolean; situacao: string; nome: string | null }
interface CnpjData {
  found: boolean; razaoSocial?: string | null; nomeFantasia?: string | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null;
  complemento?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null;
}
interface LookupResult {
  found: boolean; valid?: boolean; nome?: string | null; crc?: string | null;
  situacao?: string | null;
}

const inputStyle = { background: "rgba(255,255,255,0.07)" };
const sectionStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "12px",
  padding: "16px",
};

function maskCpfFromDigits(digits: string) {
  const d = digits.slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
    [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
  );
}
function maskCnpjFromDigits(digits: string) {
  const d = digits.slice(0, 14);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
    `${a}.${b}.${c}/${dd}${e ? "-" + e : ""}`
  );
}

export default function Register() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  // Lê parâmetros da URL (vindos do fluxo de novo usuário no login)
  const urlParams = new URLSearchParams(search);
  const urlPersonType = urlParams.get("personType") as "fisica" | "juridica" | null;
  const urlUserType = urlParams.get("userType") as "contador" | "cliente" | null;
  const urlCpfCnpj = urlParams.get("cpfCnpj") ?? "";
  const referralCode = urlParams.get("indicacao") ?? undefined;

  const [userType, setUserType] = useState<"contador" | "cliente" | "">(urlUserType ?? "");
  const [personType, setPersonType] = useState<"fisica" | "juridica" | "">(urlPersonType ?? "");

  const [form, setForm] = useState({
    cpfCnpj: urlCpfCnpj
      ? (urlPersonType === "juridica" ? maskCnpjFromDigits(urlCpfCnpj) : maskCpfFromDigits(urlCpfCnpj))
      : "",
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    crcNumber: "",
    companyName: "",
    companyFantasyName: "",
    responsibleCpf: "",
    responsibleName: "",
    birthDate: "",
    zipCode: "",
    street: "",
    addressNumber: "",
    complement: "",
    neighborhood: "",
    city: "",
    addressState: "",
  });

  const [crcState, setCrcState] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [crcResult, setCrcResult] = useState<CrcResult | null>(null);
  const [cnpjState, setCnpjState] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [cepState, setCepState] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [responsibleState, setResponsibleState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [cpfLookupState, setCpfLookupState] = useState<"idle" | "searching" | "found" | "not_found">("idle");

  const cnpjDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cpfCfcDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responsibleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cepDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cpfLookupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [crcDuplicate, setCrcDuplicate] = useState(false);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: () => setLocation(`/verify-email?email=${encodeURIComponent(form.email)}`),
      onError: (err: unknown) => {
        const data = (err as { data?: { error?: string; crcDuplicate?: boolean } })?.data;
        if (data?.crcDuplicate) { setCrcDuplicate(true); return; }
        const msg = data?.error ?? (err as Error)?.message ?? "Erro ao criar conta.";
        toast({ title: "Erro no cadastro", description: msg, variant: "destructive" });
      },
    },
  });

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  function resetTypeSelection() {
    setPersonType("");
    setForm(p => ({ ...p, cpfCnpj: "", name: "", crcNumber: "", companyName: "", companyFantasyName: "", responsibleCpf: "", responsibleName: "", birthDate: "" }));
    setCrcState("idle"); setCrcResult(null); setCnpjState("idle"); setResponsibleState("idle"); setCrcDuplicate(false); setCpfLookupState("idle");
  }

  // ── Auto-lookup CNPJ (jurídica) ────────────────────────────────────────────
  useEffect(() => {
    if (personType !== "juridica") return;
    const digits = form.cpfCnpj.replace(/\D/g, "");
    if (digits.length !== 14) { setCnpjState("idle"); return; }
    if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current);
    cnpjDebounce.current = setTimeout(async () => {
      setCnpjState("searching");
      try {
        const resp = await fetch(`/api/auth/lookup-cnpj?cnpj=${digits}`);
        const data = await resp.json() as CnpjData;
        if (data.found) {
          setCnpjState("found");
          if (data.razaoSocial) set("companyName", data.razaoSocial);
          if (data.nomeFantasia) set("companyFantasyName", data.nomeFantasia);
          if (data.cep) set("zipCode", maskCep(data.cep));
          if (data.logradouro) set("street", data.logradouro);
          if (data.numero && data.numero !== "S/N") set("addressNumber", data.numero);
          if (data.complemento) set("complement", data.complemento);
          if (data.bairro) set("neighborhood", data.bairro);
          if (data.municipio) set("city", data.municipio);
          if (data.uf) set("addressState", data.uf);
        } else {
          setCnpjState("not_found");
        }
      } catch { setCnpjState("not_found"); }
    }, 600);
  }, [form.cpfCnpj, personType]);

  // ── Auto-lookup CFC por CPF (contador PF) ─────────────────────────────────
  useEffect(() => {
    if (userType !== "contador" || personType !== "fisica") return;
    const digits = form.cpfCnpj.replace(/\D/g, "");
    if (digits.length !== 11) { setCrcState("idle"); setCrcResult(null); return; }
    if (cpfCfcDebounce.current) clearTimeout(cpfCfcDebounce.current);
    cpfCfcDebounce.current = setTimeout(async () => {
      setCrcState("checking");
      try {
        const resp = await fetch(`/api/auth/lookup-crc?cpfCnpj=${digits}`);
        const data = await resp.json() as LookupResult;
        if (data.found && data.nome) {
          set("name", data.nome);
          if (data.crc) {
            set("crcNumber", data.crc);
            setCrcState(data.valid ? "valid" : "invalid");
            setCrcResult({ valid: data.valid ?? false, situacao: data.situacao ?? "", nome: data.nome });
          } else {
            setCrcState("idle");
          }
        } else {
          setCrcState("idle");
        }
      } catch { setCrcState("idle"); }
    }, 700);
  }, [form.cpfCnpj, userType, personType]);

  // ── Auto-lookup responsável técnico (contador PJ) ─────────────────────────
  useEffect(() => {
    if (userType !== "contador" || personType !== "juridica") return;
    const digits = form.responsibleCpf.replace(/\D/g, "");
    if (digits.length !== 11) { setResponsibleState("idle"); set("responsibleName", ""); set("crcNumber", ""); setCrcState("idle"); setCrcResult(null); return; }
    if (responsibleDebounce.current) clearTimeout(responsibleDebounce.current);
    responsibleDebounce.current = setTimeout(async () => {
      setResponsibleState("checking");
      try {
        const resp = await fetch(`/api/auth/lookup-crc?cpfCnpj=${digits}`);
        const data = await resp.json() as LookupResult;
        if (data.found && data.nome) {
          set("responsibleName", data.nome);
          setResponsibleState(data.valid ? "valid" : "invalid");
          if (data.crc) {
            set("crcNumber", data.crc);
            setCrcState(data.valid ? "valid" : "invalid");
            setCrcResult({ valid: data.valid ?? false, situacao: data.situacao ?? "", nome: data.nome });
          }
        } else {
          setResponsibleState("invalid");
          set("responsibleName", "");
        }
      } catch { setResponsibleState("invalid"); }
    }, 700);
  }, [form.responsibleCpf, userType, personType]);

  // ── Auto-lookup CPF via Safeweb (cliente PF) ───────────────────────────────
  useEffect(() => {
    if (userType !== "cliente" || personType !== "fisica") return;
    const digits = form.cpfCnpj.replace(/\D/g, "");
    const dateDigits = form.birthDate.replace(/\D/g, "");
    if (digits.length !== 11 || dateDigits.length !== 8) { setCpfLookupState("idle"); return; }
    if (cpfLookupDebounce.current) clearTimeout(cpfLookupDebounce.current);
    cpfLookupDebounce.current = setTimeout(async () => {
      setCpfLookupState("searching");
      try {
        const resp = await fetch(`/api/auth/lookup-cpf?cpf=${digits}&birthDate=${encodeURIComponent(form.birthDate)}`);
        const data = await resp.json() as { found: boolean; nome?: string };
        if (data.found && data.nome) {
          set("name", data.nome);
          setCpfLookupState("found");
        } else {
          setCpfLookupState("not_found");
        }
      } catch { setCpfLookupState("not_found"); }
    }, 700);
  }, [form.cpfCnpj, form.birthDate, userType, personType]);

  // ── Auto-lookup CEP ────────────────────────────────────────────────────────
  useEffect(() => {
    const digits = form.zipCode.replace(/\D/g, "");
    if (digits.length !== 8) { if (digits.length === 0) setCepState("idle"); return; }
    if (cepDebounce.current) clearTimeout(cepDebounce.current);
    cepDebounce.current = setTimeout(async () => {
      setCepState("searching");
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (data.erro) { setCepState("not_found"); return; }
        setCepState("found");
        if (data.logradouro) set("street", data.logradouro);
        if (data.bairro) set("neighborhood", data.bairro);
        if (data.localidade) set("city", data.localidade);
        if (data.uf) set("addressState", data.uf);
      } catch { setCepState("not_found"); }
    }, 600);
  }, [form.zipCode]);

  // ── Verificação manual de CRC ──────────────────────────────────────────────
  async function handleValidateCrc() {
    const crcRaw = form.crcNumber.trim();
    if (!crcRaw) {
      toast({ title: "Preencha o número do CRC", description: "Informe o CRC no formato SP100000O.", variant: "destructive" });
      return;
    }
    setCrcState("checking"); setCrcResult(null);
    try {
      const resp = await fetch(`/api/auth/validate-crc?crc=${encodeURIComponent(crcRaw)}`);
      const data = await resp.json() as { valid: boolean; situacao: string; nome: string | null; crc: string | null };
      const result: CrcResult = { valid: data.valid, situacao: data.situacao, nome: data.nome };
      setCrcResult(result);
      setCrcState(data.valid ? "valid" : "invalid");
      if (data.nome) set("name", data.nome);
      if (data.crc) set("crcNumber", data.crc);
    } catch { setCrcState("error"); }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userType) { toast({ title: "Selecione o tipo de cadastro", variant: "destructive" }); return; }
    if (!personType) { toast({ title: "Selecione Pessoa Física ou Jurídica", variant: "destructive" }); return; }

    const digits = form.cpfCnpj.replace(/\D/g, "");
    if (personType === "fisica" && digits.length !== 11) {
      toast({ title: "CPF inválido", description: "Informe um CPF com 11 dígitos.", variant: "destructive" }); return;
    }
    if (personType === "juridica" && digits.length !== 14) {
      toast({ title: "CNPJ inválido", description: "Informe um CNPJ com 14 dígitos.", variant: "destructive" }); return;
    }
    if (userType === "contador" && personType === "fisica") {
      if (!form.crcNumber.trim()) { toast({ title: "CRC obrigatório", variant: "destructive" }); return; }
      if (crcState !== "valid") { toast({ title: "Verifique seu CRC antes de continuar", variant: "destructive" }); return; }
    }
    if (userType === "contador" && personType === "juridica") {
      const respDigits = form.responsibleCpf.replace(/\D/g, "");
      if (respDigits.length !== 11) { toast({ title: "CPF do responsável técnico obrigatório", variant: "destructive" }); return; }
      if (responsibleState !== "valid") { toast({ title: "O responsável técnico deve ter CRC ativo no CFC para prosseguir.", variant: "destructive" }); return; }
    }
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!form.email.trim()) { toast({ title: "E-mail obrigatório", variant: "destructive" }); return; }
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) { toast({ title: "Telefone inválido", variant: "destructive" }); return; }
    if (form.password.length < 8) { toast({ title: "Senha deve ter no mínimo 8 caracteres", variant: "destructive" }); return; }
    if (form.password !== form.confirm) { toast({ title: "Senhas não conferem", variant: "destructive" }); return; }

    const affiliateCode = urlParams.get("ref") ?? undefined;
    registerMutation.mutate({
      data: {
        name: form.name.trim(),
        email: form.email.trim(),
        cpfCnpj: digits,
        password: form.password,
        phone: phoneDigits,
        userType: userType as "contador" | "cliente",
        personType,
        crcNumber: userType === "contador" && personType === "fisica" ? normalizeCrc(form.crcNumber) : undefined,
        companyName: personType === "juridica" ? form.companyName || undefined : undefined,
        companyFantasyName: personType === "juridica" ? form.companyFantasyName || undefined : undefined,
        responsibleCpf: userType === "contador" && personType === "juridica" ? form.responsibleCpf.replace(/\D/g, "") || undefined : undefined,
        responsibleName: userType === "contador" && personType === "juridica" ? form.responsibleName || undefined : undefined,
        zipCode: form.zipCode.replace(/\D/g, "") || undefined,
        street: form.street || undefined,
        addressNumber: form.addressNumber || undefined,
        complement: form.complement || undefined,
        neighborhood: form.neighborhood || undefined,
        city: form.city || undefined,
        addressState: form.addressState || undefined,
        affiliateCode,
        referralCode,
      } as Parameters<typeof registerMutation.mutate>[0]["data"] & { affiliateCode?: string },
    });
  }

  const showForm = userType !== "" && personType !== "";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(220,52%,8%) 0%, hsl(218,52%,14%) 50%, hsl(214,60%,20%) 100%)" }}
    >
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img src="/logo-novo-transparente.png" alt="LealCert" className="h-56 w-auto object-contain" />
        </div>

        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(16px)" }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Criar conta</h1>
            <p className="text-blue-200/60 text-sm mt-1">Preencha os dados para se cadastrar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Tipo de cadastro ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Tipo de cadastro *</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["contador", "cliente"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setUserType(t); resetTypeSelection(); }}
                    className="flex flex-col items-center gap-2 rounded-xl p-4 border-2 transition-all"
                    style={{
                      background: userType === t ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.05)",
                      borderColor: userType === t ? "rgba(37,99,235,0.8)" : "rgba(255,255,255,0.15)",
                    }}
                  >
                    {t === "contador"
                      ? <Briefcase className={`h-6 w-6 ${userType === t ? "text-blue-400" : "text-blue-200/40"}`} />
                      : <User className={`h-6 w-6 ${userType === t ? "text-blue-400" : "text-blue-200/40"}`} />}
                    <span className={`text-sm font-semibold ${userType === t ? "text-white" : "text-blue-200/60"}`}>
                      {t === "contador" ? "Contador" : "Cliente"}
                    </span>
                    <span className="text-xs text-center leading-tight" style={{ color: userType === t ? "rgba(147,197,253,0.8)" : "rgba(147,197,253,0.35)" }}>
                      {t === "contador" ? "Escritório ou profissional contábil" : "Pessoa física ou jurídica"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Pessoa física ou jurídica ─────────────────────────────────── */}
            {userType && (
              <div className="space-y-2">
                <Label className="text-blue-100/80 text-sm font-medium">Tipo de pessoa *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["fisica", "juridica"] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => {
                        setPersonType(pt);
                        setForm(p => ({ ...p, cpfCnpj: "", name: "", crcNumber: "", companyName: "", companyFantasyName: "", responsibleCpf: "", responsibleName: "" }));
                        setCrcState("idle"); setCrcResult(null); setCnpjState("idle"); setResponsibleState("idle");
                      }}
                      className="flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-all"
                      style={{
                        background: personType === pt ? "rgba(37,99,235,0.20)" : "rgba(255,255,255,0.04)",
                        borderColor: personType === pt ? "rgba(37,99,235,0.7)" : "rgba(255,255,255,0.12)",
                      }}
                    >
                      {pt === "fisica"
                        ? <User className={`h-5 w-5 ${personType === pt ? "text-blue-400" : "text-blue-200/40"}`} />
                        : <Building2 className={`h-5 w-5 ${personType === pt ? "text-blue-400" : "text-blue-200/40"}`} />}
                      <span className={`text-sm font-semibold ${personType === pt ? "text-white" : "text-blue-200/60"}`}>
                        {pt === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </span>
                      <span className="text-xs text-center" style={{ color: personType === pt ? "rgba(147,197,253,0.7)" : "rgba(147,197,253,0.30)" }}>
                        {pt === "fisica" ? "CPF" : "CNPJ"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showForm && (
              <>
                {/* ── Seção 1: Identificação ────────────────────────────────── */}
                <div style={sectionStyle} className="space-y-3">
                  <p className="text-blue-300/70 text-xs font-semibold uppercase tracking-wider">
                    {personType === "juridica" ? "Dados da Empresa" : "Identificação"}
                  </p>

                  {/* CNPJ ou CPF */}
                  <div className="space-y-1">
                    <Label className="text-blue-100/80 text-sm">
                      {personType === "juridica" ? "CNPJ *" : "CPF *"}
                    </Label>
                    <div className="relative">
                      <Input
                        value={form.cpfCnpj}
                        onChange={e => {
                          const v = personType === "juridica" ? maskCnpj(e.target.value) : maskCpf(e.target.value);
                          set("cpfCnpj", v);
                          if (personType === "juridica") { setCnpjState("idle"); }
                          else { setCrcState("idle"); setCrcResult(null); }
                        }}
                        placeholder={personType === "juridica" ? "00.000.000/0000-00" : "000.000.000-00"}
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-10"
                        style={inputStyle}
                      />
                      {cnpjState === "searching" && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-blue-400" />}
                      {cnpjState === "found" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-green-400" />}
                      {cnpjState === "not_found" && <AlertCircle className="absolute right-3 top-3.5 h-4 w-4 text-amber-400" />}
                      {userType === "contador" && personType === "fisica" && crcState === "checking" && (
                        <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-blue-400" />
                      )}
                    </div>
                    {cnpjState === "found" && (
                      <p className="text-green-400/80 text-xs flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Dados encontrados e preenchidos automaticamente
                      </p>
                    )}
                    {cnpjState === "not_found" && (
                      <p className="text-amber-400/70 text-xs flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> CNPJ não encontrado — preencha os dados manualmente
                      </p>
                    )}
                  </div>

                  {/* Campos PJ: razão social + fantasia */}
                  {personType === "juridica" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-blue-100/80 text-sm">Razão Social *</Label>
                        <Input
                          value={form.companyName}
                          onChange={e => set("companyName", e.target.value)}
                          placeholder="Nome da empresa"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                          style={inputStyle}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-blue-100/80 text-sm">Nome Fantasia</Label>
                        <Input
                          value={form.companyFantasyName}
                          onChange={e => set("companyFantasyName", e.target.value)}
                          placeholder="Nome fantasia (opcional)"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                          style={inputStyle}
                        />
                      </div>
                    </>
                  )}

                  {/* Cliente PF: data de nascimento para consulta Safeweb */}
                  {userType === "cliente" && personType === "fisica" && (
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Data de nascimento *</Label>
                      <div className="relative">
                        <Input
                          value={form.birthDate}
                          onChange={e => { set("birthDate", maskDate(e.target.value)); setCpfLookupState("idle"); }}
                          placeholder="DD/MM/AAAA"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-10"
                          style={inputStyle}
                        />
                        {cpfLookupState === "searching" && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-blue-400" />}
                        {cpfLookupState === "found" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-green-400" />}
                        {cpfLookupState === "not_found" && <AlertCircle className="absolute right-3 top-3.5 h-4 w-4 text-amber-400" />}
                      </div>
                      {cpfLookupState === "found" && (
                        <p className="text-green-400/80 text-xs flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Dados encontrados e preenchidos automaticamente
                        </p>
                      )}
                      {cpfLookupState === "not_found" && (
                        <p className="text-amber-400/70 text-xs flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> CPF/data não encontrados — preencha o nome manualmente
                        </p>
                      )}
                    </div>
                  )}

                  {/* Contador PF: CRC ao lado do CPF (nome auto-preenchido pelo CFC) */}
                  {userType === "contador" && personType === "fisica" && (
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">
                        Número de Registro CRC *
                        <span className="ml-2 text-blue-300/50 font-normal text-xs">(ex: SP100000O)</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={form.crcNumber}
                          onChange={e => { set("crcNumber", e.target.value.toUpperCase()); setCrcState("idle"); setCrcResult(null); }}
                          placeholder="SP100000O"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 font-mono tracking-wider"
                          style={inputStyle}
                        />
                        <Button
                          type="button"
                          onClick={handleValidateCrc}
                          disabled={crcState === "checking" || crcState === "valid" || !form.crcNumber.trim()}
                          className="h-11 px-4 shrink-0"
                          style={{ background: crcState === "valid" ? "rgba(34,197,94,0.3)" : "rgba(37,99,235,0.7)", color: "white" }}
                        >
                          {crcState === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : crcState === "valid" ? <CheckCircle2 className="h-4 w-4" /> : "Verificar"}
                        </Button>
                      </div>
                      {crcState === "valid" && crcResult && (
                        <div className="rounded-lg p-2 flex items-center gap-2" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}>
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                          <p className="text-green-300 text-sm">{crcResult.nome ?? "CRC Ativo ✓"}</p>
                        </div>
                      )}
                      {crcState === "invalid" && crcResult && (
                        <div className="rounded-lg p-2 flex items-center gap-2" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }}>
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          <p className="text-red-300 text-sm">CRC não ativo — situação: {crcResult.situacao}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Seção 2: Responsável técnico (contador PJ) ──────────────── */}
                {userType === "contador" && personType === "juridica" && (
                  <div style={sectionStyle} className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-blue-300/70 text-xs font-semibold uppercase tracking-wider">
                          Responsável Técnico (CFC) *
                        </p>
                        <p className="text-blue-200/50 text-xs mt-1">
                          O escritório deve ter um contador com CRC <strong className="text-amber-400/80">ativo</strong> vinculado. O CRC não pode estar cadastrado em outro escritório.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">CPF do Responsável *</Label>
                      <div className="relative">
                        <Input
                          value={form.responsibleCpf}
                          onChange={e => {
                            set("responsibleCpf", maskCpf(e.target.value));
                            setResponsibleState("idle");
                            set("responsibleName", "");
                            setCrcDuplicate(false);
                          }}
                          placeholder="000.000.000-00"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-10"
                          style={inputStyle}
                        />
                        {responsibleState === "checking" && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-blue-400" />}
                        {responsibleState === "valid" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-green-400" />}
                        {responsibleState === "invalid" && <XCircle className="absolute right-3 top-3.5 h-4 w-4 text-red-400" />}
                      </div>
                    </div>

                    {/* CRC Duplicado */}
                    {crcDuplicate && (
                      <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.40)" }}>
                        <div className="flex items-start gap-2">
                          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-red-300 text-sm font-semibold">CRC já vinculado a outro cadastro</p>
                            <p className="text-red-300/70 text-xs mt-1">
                              Este CRC já está registrado em outra conta na plataforma. Se você acredita que isso é um erro ou deseja transferir o cadastro, entre em contato com nosso suporte.
                            </p>
                          </div>
                        </div>
                        <a
                          href="/suporte"
                          className="flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-sm font-medium transition-colors"
                          style={{ background: "rgba(239,68,68,0.25)", color: "rgba(252,165,165,1)", border: "1px solid rgba(239,68,68,0.50)" }}
                        >
                          Abrir chamado no suporte →
                        </a>
                      </div>
                    )}

                    {form.responsibleName && !crcDuplicate && (
                      <div className="rounded-lg p-3 flex items-start gap-3" style={{
                        background: responsibleState === "valid" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        border: `1px solid ${responsibleState === "valid" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
                      }}>
                        {responsibleState === "valid"
                          ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                          : <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />}
                        <div>
                          <p className={`text-sm font-semibold ${responsibleState === "valid" ? "text-green-300" : "text-amber-300"}`}>
                            {form.responsibleName}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: responsibleState === "valid" ? "rgba(134,239,172,0.7)" : "rgba(253,230,138,0.7)" }}>
                            {responsibleState === "valid" ? "CRC ativo no CFC ✓" : "CRC não está ativo no CFC — cadastro não permitido"}
                          </p>
                        </div>
                      </div>
                    )}
                    {responsibleState === "invalid" && !form.responsibleName && (
                      <p className="text-red-400/70 text-xs flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> CPF não encontrado no cadastro do CFC
                      </p>
                    )}

                    {/* CRC do responsável técnico (PJ contador) */}
                    {!crcDuplicate && (
                      <div className="space-y-1">
                        <Label className="text-blue-100/80 text-sm">
                          Número de Registro CRC
                          <span className="ml-2 text-blue-300/50 font-normal text-xs">(preenchido automaticamente ou ajuste manualmente)</span>
                        </Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={form.crcNumber}
                              onChange={e => { set("crcNumber", normalizeCrc(e.target.value)); setCrcState("idle"); setCrcResult(null); }}
                              placeholder="SP000000O"
                              maxLength={12}
                              className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-10"
                              style={inputStyle}
                            />
                            {crcState === "checking" && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-blue-400" />}
                            {crcState === "valid" && <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-green-400" />}
                            {(crcState === "invalid" || crcState === "error") && <XCircle className="absolute right-3 top-3.5 h-4 w-4 text-red-400" />}
                          </div>
                          <Button
                            type="button"
                            onClick={handleValidateCrc}
                            disabled={crcState === "checking" || !form.crcNumber}
                            className="h-11 px-4 text-sm font-medium shrink-0"
                            style={{ background: "#2563eb", color: "white", border: "none" }}
                          >
                            {crcState === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
                          </Button>
                        </div>
                        {crcResult && (
                          <div className="rounded-lg p-2 flex items-start gap-2" style={{
                            background: crcResult.valid ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                            border: `1px solid ${crcResult.valid ? "rgba(34,197,94,0.30)" : "rgba(239,68,68,0.30)"}`,
                          }}>
                            {crcResult.valid
                              ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                              : <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
                            <div>
                              {crcResult.nome && <p className={`text-xs font-semibold ${crcResult.valid ? "text-green-300" : "text-amber-300"}`}>{crcResult.nome}</p>}
                              <p className="text-xs" style={{ color: crcResult.valid ? "rgba(134,239,172,0.7)" : "rgba(253,230,138,0.7)" }}>
                                {crcResult.valid ? "CRC ativo ✓" : `Situação: ${crcResult.situacao}`}
                              </p>
                            </div>
                          </div>
                        )}
                        {crcState === "error" && !crcResult && (
                          <p className="text-red-400/70 text-xs flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Erro ao consultar o CFC. Verifique o número digitado.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Seção 3: Endereço ─────────────────────────────────────── */}
                <div style={sectionStyle} className="space-y-3">
                  <p className="text-blue-300/70 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Endereço
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">CEP</Label>
                      <div className="relative">
                        <Input
                          value={form.zipCode}
                          onChange={e => { set("zipCode", maskCep(e.target.value)); setCepState("idle"); }}
                          placeholder="00000-000"
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-8"
                          style={inputStyle}
                        />
                        {cepState === "searching" && <Loader2 className="absolute right-2 top-3.5 h-3.5 w-3.5 animate-spin text-blue-400" />}
                        {cepState === "found" && <CheckCircle2 className="absolute right-2 top-3.5 h-3.5 w-3.5 text-green-400" />}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Número</Label>
                      <Input
                        value={form.addressNumber}
                        onChange={e => set("addressNumber", e.target.value)}
                        placeholder="123"
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-blue-100/80 text-sm">Logradouro</Label>
                    <Input
                      value={form.street}
                      onChange={e => set("street", e.target.value)}
                      placeholder="Rua, Av..."
                      className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                      style={inputStyle}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Complemento</Label>
                      <Input
                        value={form.complement}
                        onChange={e => set("complement", e.target.value)}
                        placeholder="Sala, apto..."
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Bairro</Label>
                      <Input
                        value={form.neighborhood}
                        onChange={e => set("neighborhood", e.target.value)}
                        placeholder="Bairro"
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-blue-100/80 text-sm">Cidade</Label>
                      <Input
                        value={form.city}
                        onChange={e => set("city", e.target.value)}
                        placeholder="Cidade"
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">UF</Label>
                      <Input
                        value={form.addressState}
                        onChange={e => set("addressState", e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="SP"
                        maxLength={2}
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 font-mono"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Seção 4: Dados pessoais / contato ────────────────────── */}
                <div style={sectionStyle} className="space-y-3">
                  <p className="text-blue-300/70 text-xs font-semibold uppercase tracking-wider">Dados Pessoais</p>

                  <div className="space-y-1">
                    <Label className="text-blue-100/80 text-sm">
                      {personType === "juridica" ? "Nome do representante *" : "Nome completo *"}
                    </Label>
                    <Input
                      value={form.name}
                      onChange={e => set("name", e.target.value)}
                      placeholder="Nome completo"
                      className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                      style={inputStyle}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">E-mail *</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={e => set("email", e.target.value)}
                        placeholder="seu@email.com"
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Telefone *</Label>
                      <Input
                        value={form.phone}
                        onChange={e => set("phone", maskPhone(e.target.value))}
                        placeholder="(11) 99999-0000"
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Seção 5: Senha ────────────────────────────────────────── */}
                <div style={sectionStyle} className="space-y-3">
                  <p className="text-blue-300/70 text-xs font-semibold uppercase tracking-wider">Senha de acesso</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Senha * (mín. 8 chars)</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={e => set("password", e.target.value)}
                          className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-11"
                          style={inputStyle}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-blue-200/50 hover:text-blue-200" tabIndex={-1}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-blue-100/80 text-sm">Confirmar senha *</Label>
                      <Input
                        type="password"
                        value={form.confirm}
                        onChange={e => set("confirm", e.target.value)}
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Submit ─────────────────────────────────────────────────── */}
                {(() => {
                  const pfBlocked = userType === "contador" && personType === "fisica" && crcState !== "valid";
                  const pjBlocked = userType === "contador" && personType === "juridica" && responsibleState !== "valid";
                  const blocked = pfBlocked || pjBlocked || crcDuplicate;
                  return (
                    <>
                      <Button
                        type="submit"
                        className="w-full h-11 text-base font-semibold"
                        style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                        disabled={registerMutation.isPending || blocked}
                      >
                        {registerMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando conta...</> : "Criar conta"}
                      </Button>
                      {pfBlocked && <p className="text-amber-400/70 text-xs text-center">Verifique seu CRC antes de criar a conta</p>}
                      {pjBlocked && !crcDuplicate && <p className="text-amber-400/70 text-xs text-center">O responsável técnico deve ter CRC ativo no CFC para continuar</p>}
                    </>
                  );
                })()}
              </>
            )}

          </form>

          <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-center gap-2">
            <ArrowLeft className="h-4 w-4 text-blue-200/50" />
            <Link href="/login">
              <span className="text-sm text-blue-200/60 hover:text-blue-300 transition-colors cursor-pointer">
                Já tenho conta — Fazer login
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
