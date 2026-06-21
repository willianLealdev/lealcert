import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft, Briefcase, User, CheckCircle2, XCircle, AlertCircle, Search } from "lucide-react";

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

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) =>
      `(${a}) ${b}${c ? `-${c}` : ""}`
    );
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) =>
    `(${a}) ${b}${c ? `-${c}` : ""}`
  );
}

function normalizeCrc(v: string): string {
  let s = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // CRC sempre termina com letra de tipo (O, P, T…). Converte "0" final para "O".
  if (s.length > 2 && s[s.length - 1] === "0") s = s.slice(0, -1) + "O";
  return s;
}

interface CrcResult {
  valid: boolean;
  situacao: string;
  nome: string | null;
  numeroRegistro: string | null;
  categoria: string | null;
  crc: string | null;
}

interface LookupResult {
  found: boolean;
  valid?: boolean;
  nome?: string | null;
  crc?: string | null;
  numeroRegistro?: string | null;
  situacao?: string | null;
  categoria?: string | null;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    cpfCnpj: "",
    phone: "",
    password: "",
    confirm: "",
    userType: "" as "contador" | "cliente" | "",
    crcNumber: "",
  });

  const [crcState, setCrcState] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [crcResult, setCrcResult] = useState<CrcResult | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const lookupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: () => {
        setLocation(`/verify-email?email=${encodeURIComponent(form.email)}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao criar conta.";
        toast({ title: "Erro no cadastro", description: msg, variant: "destructive" });
      },
    },
  });

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  // Auto-lookup por CPF/CNPJ quando tipo for Contador
  useEffect(() => {
    if (form.userType !== "contador") return;
    const digits = form.cpfCnpj.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      setLookupState("idle");
      return;
    }

    if (lookupDebounce.current) clearTimeout(lookupDebounce.current);
    lookupDebounce.current = setTimeout(async () => {
      setLookupState("searching");
      setCrcState("idle");
      setCrcResult(null);
      try {
        const resp = await fetch(`/api/auth/lookup-crc?cpfCnpj=${digits}`);
        const data = await resp.json() as LookupResult;
        if (data.found && data.nome) {
          setLookupState("found");
          if (data.nome) set("name", data.nome);
          if (data.crc) {
            set("crcNumber", data.crc);
            // Se CRC encontrado e ativo, marca como verificado automaticamente
            if (data.valid) {
              setCrcState("valid");
              setCrcResult({
                valid: true,
                situacao: data.situacao ?? "Ativo",
                nome: data.nome ?? null,
                numeroRegistro: data.numeroRegistro ?? null,
                categoria: data.categoria ?? null,
                crc: data.crc ?? null,
              });
            } else {
              setCrcState("invalid");
              setCrcResult({
                valid: false,
                situacao: data.situacao ?? "Inativo",
                nome: data.nome ?? null,
                numeroRegistro: data.numeroRegistro ?? null,
                categoria: data.categoria ?? null,
                crc: data.crc ?? null,
              });
            }
          }
        } else {
          setLookupState("not_found");
        }
      } catch {
        setLookupState("not_found");
      }
    }, 600);
  }, [form.cpfCnpj, form.userType]);

  async function handleValidateCrc() {
    const crcNorm = normalizeCrc(form.crcNumber);
    if (!/^[A-Z]{2}\d+[A-Z]$/.test(crcNorm)) {
      toast({ title: "Formato inválido", description: "Use: UF + número + tipo. Ex: SP100000O", variant: "destructive" });
      return;
    }
    setCrcState("checking");
    setCrcResult(null);
    try {
      const resp = await fetch(`/api/auth/validate-crc?crc=${encodeURIComponent(crcNorm)}`);
      const data = await resp.json() as CrcResult & { error?: string };
      if (!resp.ok) {
        setCrcState("error");
        toast({ title: "Erro na consulta", description: data.error ?? "Não foi possível consultar o CFC.", variant: "destructive" });
        return;
      }
      setCrcResult(data);
      setCrcState(data.valid ? "valid" : "invalid");
      if (data.valid && data.nome && !form.name) {
        set("name", data.nome);
      }
    } catch {
      setCrcState("error");
      toast({ title: "Erro de conexão", description: "Não foi possível conectar à API do CFC. Tente novamente.", variant: "destructive" });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.userType) {
      toast({ title: "Selecione o tipo de cadastro", description: "Informe se você é Contador ou Cliente.", variant: "destructive" });
      return;
    }
    if (form.userType === "contador") {
      if (!form.crcNumber.trim()) {
        toast({ title: "CRC obrigatório", description: "Informe seu número de registro CRC.", variant: "destructive" });
        return;
      }
      if (crcState !== "valid") {
        toast({ title: "CRC não verificado", description: "Verifique seu CRC antes de continuar.", variant: "destructive" });
        return;
      }
    }
    const cpfCnpjDigits = form.cpfCnpj.replace(/\D/g, "");
    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      toast({ title: "CPF ou CNPJ inválido", description: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.", variant: "destructive" });
      return;
    }
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      toast({ title: "Telefone inválido", description: "Informe um telefone com DDD e número completo.", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (form.password !== form.confirm) {
      toast({ title: "Senhas não conferem", description: "Confirme a senha corretamente.", variant: "destructive" });
      return;
    }
    registerMutation.mutate({
      data: {
        name: form.name,
        email: form.email,
        cpfCnpj: cpfCnpjDigits,
        password: form.password,
        phone: phoneDigits,
        userType: form.userType as "contador" | "cliente",
        crcNumber: form.userType === "contador" ? normalizeCrc(form.crcNumber) : undefined,
      },
    });
  }

  const inputStyle = { background: "rgba(255,255,255,0.07)" };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(220,52%,8%) 0%, hsl(218,52%,14%) 50%, hsl(214,60%,20%) 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="LealCert" className="h-24 w-auto object-contain" />
        </div>

        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(16px)" }}
        >
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-white">Criar conta</h1>
            <p className="text-blue-200/60 text-sm mt-1">Preencha os dados para se cadastrar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo de cadastro */}
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Tipo de cadastro *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { set("userType", "contador"); setCrcState("idle"); setCrcResult(null); setLookupState("idle"); }}
                  className="flex flex-col items-center gap-2 rounded-xl p-4 border-2 transition-all"
                  style={{
                    background: form.userType === "contador" ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.05)",
                    borderColor: form.userType === "contador" ? "rgba(37,99,235,0.8)" : "rgba(255,255,255,0.15)",
                  }}
                >
                  <Briefcase className={`h-6 w-6 ${form.userType === "contador" ? "text-blue-400" : "text-blue-200/40"}`} />
                  <span className={`text-sm font-semibold ${form.userType === "contador" ? "text-white" : "text-blue-200/60"}`}>
                    Contador
                  </span>
                  <span className="text-xs text-center leading-tight" style={{ color: form.userType === "contador" ? "rgba(147,197,253,0.8)" : "rgba(147,197,253,0.35)" }}>
                    Escritório ou profissional contábil
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { set("userType", "cliente"); setCrcState("idle"); setCrcResult(null); setLookupState("idle"); }}
                  className="flex flex-col items-center gap-2 rounded-xl p-4 border-2 transition-all"
                  style={{
                    background: form.userType === "cliente" ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.05)",
                    borderColor: form.userType === "cliente" ? "rgba(37,99,235,0.8)" : "rgba(255,255,255,0.15)",
                  }}
                >
                  <User className={`h-6 w-6 ${form.userType === "cliente" ? "text-blue-400" : "text-blue-200/40"}`} />
                  <span className={`text-sm font-semibold ${form.userType === "cliente" ? "text-white" : "text-blue-200/60"}`}>
                    Cliente
                  </span>
                  <span className="text-xs text-center leading-tight" style={{ color: form.userType === "cliente" ? "rgba(147,197,253,0.8)" : "rgba(147,197,253,0.35)" }}>
                    Pessoa física ou jurídica
                  </span>
                </button>
              </div>
            </div>

            {/* CPF/CNPJ — quando Contador, dispara busca automática */}
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">
                CPF ou CNPJ *
                {form.userType === "contador" && (
                  <span className="ml-2 text-blue-300/50 font-normal text-xs">— preencheremos o CRC automaticamente</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  value={form.cpfCnpj}
                  onChange={e => {
                    set("cpfCnpj", maskCpfCnpj(e.target.value));
                    if (form.userType === "contador") {
                      setCrcState("idle");
                      setCrcResult(null);
                      setLookupState("idle");
                    }
                  }}
                  required
                  placeholder="000.000.000-00"
                  className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-10"
                  style={inputStyle}
                />
                {form.userType === "contador" && lookupState === "searching" && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-400" />
                )}
                {form.userType === "contador" && lookupState === "found" && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400" />
                )}
                {form.userType === "contador" && lookupState === "not_found" && (
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400" />
                )}
              </div>

              {/* Feedback do lookup */}
              {form.userType === "contador" && lookupState === "found" && (
                <p className="text-green-400/80 text-xs flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Dados encontrados no CFC e preenchidos automaticamente
                </p>
              )}
              {form.userType === "contador" && lookupState === "not_found" && (
                <p className="text-amber-400/70 text-xs flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Não encontrado no CFC — preencha o CRC manualmente abaixo
                </p>
              )}
            </div>

            {/* Nome completo */}
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Nome completo *</Label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                required
                placeholder="Seu nome completo"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={inputStyle}
              />
            </div>

            {/* Campo CRC — somente para contador */}
            {form.userType === "contador" && (
              <div className="space-y-2">
                <Label className="text-blue-100/80 text-sm font-medium">
                  Número de Registro CRC *
                  <span className="ml-2 text-blue-300/50 font-normal text-xs">(ex: SP100000O)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={form.crcNumber}
                    onChange={e => {
                      set("crcNumber", e.target.value.toUpperCase());
                      setCrcState("idle");
                      setCrcResult(null);
                    }}
                    placeholder="SP100000O"
                    className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 font-mono tracking-wider"
                    style={inputStyle}
                  />
                  <Button
                    type="button"
                    onClick={handleValidateCrc}
                    disabled={crcState === "checking" || crcState === "valid" || !form.crcNumber.trim()}
                    className="h-11 px-4 shrink-0 font-medium"
                    style={{ background: crcState === "valid" ? "rgba(34,197,94,0.3)" : "rgba(37,99,235,0.7)", color: "white" }}
                  >
                    {crcState === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : crcState === "valid" ? <CheckCircle2 className="h-4 w-4" /> : "Verificar"}
                  </Button>
                </div>

                {crcState === "valid" && crcResult && (
                  <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}>
                    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                    <div className="text-sm space-y-0.5">
                      <p className="text-green-300 font-semibold">CRC Ativo ✓</p>
                      {crcResult.nome && <p className="text-green-200/80">{crcResult.nome}</p>}
                      {crcResult.numeroRegistro && <p className="text-green-200/60 text-xs">{crcResult.numeroRegistro} — {crcResult.categoria}</p>}
                    </div>
                  </div>
                )}
                {crcState === "invalid" && crcResult && (
                  <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-red-300 font-semibold">CRC não ativo</p>
                      <p className="text-red-200/70 text-xs">Situação: {crcResult.situacao}. Apenas profissionais com CRC ativo podem se cadastrar como contadores.</p>
                    </div>
                  </div>
                )}
                {crcState === "error" && (
                  <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80">Não foi possível conectar ao CFC. Tente novamente.</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">E-mail *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                required
                placeholder="seu@email.com"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={inputStyle}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Telefone / WhatsApp *</Label>
              <Input
                value={form.phone}
                onChange={e => set("phone", maskPhone(e.target.value))}
                required
                placeholder="(11) 99999-0000"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={inputStyle}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Senha * (mínimo 6 caracteres)</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => set("password", e.target.value)}
                  required
                  className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-11"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/50 hover:text-blue-200 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Confirmar senha *</Label>
              <Input
                type="password"
                value={form.confirm}
                onChange={e => set("confirm", e.target.value)}
                required
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={inputStyle}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold mt-2"
              style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
              disabled={registerMutation.isPending || (form.userType === "contador" && crcState !== "valid")}
            >
              {registerMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando conta...</> : "Criar conta"}
            </Button>

            {form.userType === "contador" && crcState !== "valid" && (
              <p className="text-amber-400/70 text-xs text-center">
                Verifique seu CRC antes de criar a conta
              </p>
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
