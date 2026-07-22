import { useState, useEffect } from "react";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Eye, EyeOff, Phone, MessageCircle, Mail, MapPin, ShieldAlert, Clock, KeyRound, RefreshCw, User, Building2, ArrowLeft, XCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";

type Step = "credentials" | "ip-verify" | "new-user";

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
type IpBlockInfo = { code: "ip_banned" | "ip_blocked"; error: string; isForeign?: boolean; unblockAt?: string } | null;

function homeRoute(role?: string) {
  return role === "agente" ? "/consultar" : "/dashboard";
}

export default function Login() {
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>("credentials");
  const [ipCode, setIpCode] = useState("");
  const [ipVerifyLoading, setIpVerifyLoading] = useState(false);
  const [ipResendLoading, setIpResendLoading] = useState(false);
  const [ipResendCooldown, setIpResendCooldown] = useState(0);
  const [ipBlockInfo, setIpBlockInfo] = useState<IpBlockInfo>(null);

  // ── Fluxo "novo usuário" ────────────────────────────────────────────────────
  const [nuPersonType, setNuPersonType] = useState<"cpf" | "cnpj">("cpf");
  const [nuDoc, setNuDoc] = useState("");
  const [nuLoading, setNuLoading] = useState(false);
  const [nuResult, setNuResult] = useState<{ found: boolean; name?: string } | null>(null);
  const [nuError, setNuError] = useState("");

  const nuDocDigits = nuDoc.replace(/\D/g, "");
  const nuMinLen = nuPersonType === "cpf" ? 11 : 14;

  const handleNuLookup = async () => {
    if (nuDocDigits.length !== nuMinLen) { setNuError(`Informe um ${nuPersonType === "cpf" ? "CPF" : "CNPJ"} válido.`); return; }
    setNuLoading(true); setNuError(""); setNuResult(null);
    try {
      const r = await fetch("/api/public/checkout/lookup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfCnpj: nuDocDigits }),
      });
      const data = await r.json() as { found: boolean; name?: string };
      setNuResult(data);
    } catch { setNuError("Erro de rede. Tente novamente."); }
    finally { setNuLoading(false); }
  };

  const { user } = useAuth();
  const branding = useBranding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const goToRegister = () => {
    const params = new URLSearchParams({ personType: nuPersonType === "cpf" ? "fisica" : "juridica" });
    if (nuDocDigits) params.set("cpfCnpj", nuDocDigits);
    setLocation(`/register?${params.toString()}`);
  };

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        // 202 case: server returns { requiresIpVerification: true }
        if ((data as unknown as Record<string, unknown>)?.requiresIpVerification) {
          setStep("ip-verify");
          return;
        }
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        const d = data as { mustChangePassword?: boolean; role?: string };
        if (d.mustChangePassword) {
          setLocation("/change-password");
        } else {
          setLocation(homeRoute(d.role));
        }
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        const body = (err as { data?: { error?: string; email?: string; code?: string; isForeign?: boolean; unblockAt?: string } })?.data;
        if (!status) {
          toast({ title: "Servidor indisponível", description: "Não foi possível conectar ao servidor. Tente novamente em instantes.", variant: "destructive" });
        } else if (status === 403 && body?.email) {
          toast({ title: "E-mail não verificado", description: "Verifique sua caixa de entrada e confirme o código enviado.", variant: "destructive" });
          setLocation(`/verify-email?email=${encodeURIComponent(body.email)}`);
        } else if (status === 403 && body?.code === "ip_banned") {
          setIpBlockInfo({ code: "ip_banned", error: body.error ?? "" });
        } else if (status === 423 && body?.code === "ip_blocked") {
          setIpBlockInfo({ code: "ip_blocked", error: body.error ?? "", isForeign: body.isForeign, unblockAt: body.unblockAt });
        } else {
          toast({ title: "Acesso negado", description: body?.error ?? "CPF/CNPJ ou senha inválidos.", variant: "destructive" });
        }
      },
    },
  });

  useEffect(() => {
    if (!user) return;
    if (user.mustChangePassword) setLocation("/change-password");
    else setLocation(homeRoute(user.role));
  }, [user]);

  useEffect(() => {
    if (ipResendCooldown <= 0) return;
    const t = setTimeout(() => setIpResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [ipResendCooldown]);

  if (user) return null;

  const handleResendIpCode = async () => {
    setIpResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-ip-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpfCnpj }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erro", description: data.error ?? "Não foi possível reenviar.", variant: "destructive" });
        return;
      }
      toast({ title: "Código reenviado!", description: "Verifique sua caixa de entrada." });
      setIpResendCooldown(60);
    } catch {
      toast({ title: "Erro", description: "Não foi possível reenviar o código.", variant: "destructive" });
    } finally {
      setIpResendLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIpBlockInfo(null);
    loginMutation.mutate({ data: { cpfCnpj, password } });
  };

  const handleIpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipCode.trim()) return;
    setIpVerifyLoading(true);
    try {
      const res = await fetch("/api/auth/verify-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpfCnpj, code: ipCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Código inválido", description: data.error ?? "Código incorreto ou expirado.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (data.mustChangePassword) setLocation("/change-password");
      else setLocation(homeRoute(data.role));
    } catch {
      toast({ title: "Erro", description: "Não foi possível verificar o código. Tente novamente.", variant: "destructive" });
    } finally {
      setIpVerifyLoading(false);
    }
  };

  const leftPanel = (
    <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden">
      <div className="relative z-10 flex flex-col items-center text-center space-y-8">
        <img src={branding.logoUrl || "/logo-novo-transparente.png"} alt={branding.appName} className="h-56 w-auto object-contain cursor-pointer" onClick={() => window.location.href = "/"} />
        <p className="text-blue-200/80 text-lg max-w-sm leading-relaxed">
          Plataforma completa para emissão e gerenciamento de certificados digitais com segurança e agilidade.
        </p>
        <div className="flex items-center gap-6 text-blue-200/60 text-sm">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400/80" /><span>e-CPF &amp; e-CNPJ</span></div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400/80" /><span>A1 &amp; A3</span></div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400/80" /><span>ICP-Brasil</span></div>
        </div>
        {(branding.contactPhone || branding.contactWhatsapp || branding.contactEmailSupport || branding.contactAddress) && (
          <div className="mt-4 space-y-2 text-blue-200/50 text-sm text-left w-full max-w-xs">
            {branding.contactPhone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{branding.contactPhone}</span></div>}
            {branding.contactWhatsapp && <div className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5 shrink-0" /><span>{branding.contactWhatsapp}</span></div>}
            {branding.contactEmailSupport && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" /><span>{branding.contactEmailSupport}</span></div>}
            {branding.contactAddress && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" /><span>{branding.contactAddress}</span></div>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    <div className="min-h-screen flex" style={{ background: "linear-gradient(135deg, hsl(220,52%,8%) 0%, hsl(218,52%,14%) 50%, hsl(214,60%,20%) 100%)" }}>
      {leftPanel}

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <img src={branding.logoUrl || "/logo.png"} alt={branding.appName} className="h-24 w-auto object-contain cursor-pointer" onClick={() => window.location.href = "/"} />
          </div>

          <div className="rounded-2xl p-8 shadow-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(16px)" }}>

            {/* ── IP Banned / Blocked banner ──────────────────── */}
            {ipBlockInfo && (
              <div className={`mb-5 rounded-xl p-4 border ${ipBlockInfo.code === "ip_banned" ? "bg-red-950/60 border-red-500/30" : "bg-amber-950/60 border-amber-500/30"}`}>
                <div className="flex gap-3">
                  <ShieldAlert className={`h-5 w-5 mt-0.5 shrink-0 ${ipBlockInfo.code === "ip_banned" ? "text-red-400" : "text-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${ipBlockInfo.code === "ip_banned" ? "text-red-300" : "text-amber-300"}`}>
                      {ipBlockInfo.code === "ip_banned" ? "IP Banido" : "Acesso Temporariamente Bloqueado"}
                    </p>
                    <p className="text-xs text-white/60 mt-1">{ipBlockInfo.error}</p>
                    {ipBlockInfo.unblockAt && (
                      <p className="text-xs text-amber-300/70 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Desbloqueio automático: {new Date(ipBlockInfo.unblockAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      <p className="text-xs text-white/50 flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">💡</span>
                        <span>
                          Se você estiver usando uma <strong className="text-white/70">VPN com IP fora do Brasil</strong>, desative-a e tente novamente.
                        </span>
                      </p>
                      <p className="text-xs text-white/50 flex items-start gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                        <span>
                          Acredita que o bloqueio está errado?{" "}
                          <button
                            type="button"
                            onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
                            className="underline text-blue-400 hover:text-blue-300 transition-colors font-medium"
                          >
                            Fale com o assistente
                          </button>
                          {" "}e informe seu nome e CPF/CNPJ para abrirmos um chamado.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step: credentials ───────────────────────────── */}
            {step === "credentials" && (
              <>
                <div className="mb-7">
                  <h1 className="text-2xl font-bold text-white">Acesso ao sistema</h1>
                  <p className="text-blue-200/60 text-sm mt-1">Insira suas credenciais para continuar</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="cpfCnpj" className="text-blue-100/80 text-sm font-medium">CPF ou CNPJ</Label>
                    <Input
                      id="cpfCnpj"
                      placeholder="000.000.000-00"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      required
                      className="bg-white/8 border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 focus-visible:ring-blue-400/30 h-11"
                      style={{ background: "rgba(255,255,255,0.07)" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-blue-100/80 text-sm font-medium">Senha</Label>
                      <Link href="/forgot-password">
                        <span className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">Esqueci minha senha</span>
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 focus-visible:ring-blue-400/30 h-11 pr-11"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/50 hover:text-blue-200 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold mt-2"
                    style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando...</> : "Entrar"}
                  </Button>
                </form>
                <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setStep("new-user"); setNuDoc(""); setNuResult(null); setNuError(""); setNuPersonType("cpf"); }}
                      className="text-sm text-blue-300 hover:text-blue-200 transition-colors cursor-pointer font-medium"
                    >
                      Não tem conta? Cadastre-se
                    </button>
                  </div>
                  <p className="text-xs text-center text-blue-200/40">Em caso de problemas de acesso, entre em contato com o administrador.</p>
                </div>
              </>
            )}

            {/* ── Step: new-user ──────────────────────────────── */}
            {step === "new-user" && (
              <>
                <div className="mb-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("credentials")}
                    className="text-blue-200/50 hover:text-blue-200 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h1 className="text-xl font-bold text-white">Novo cadastro</h1>
                    <p className="text-blue-200/60 text-sm mt-0.5">Informe seus dados para verificarmos</p>
                  </div>
                </div>

                {/* Tipo de pessoa */}
                <div className="space-y-3 mb-4">
                  <Label className="text-blue-100/80 text-sm font-medium">Você é:</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["cpf", "cnpj"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setNuPersonType(t); setNuDoc(""); setNuResult(null); setNuError(""); }}
                        className="flex flex-col items-center gap-2 rounded-xl p-4 border-2 transition-all"
                        style={{
                          background: nuPersonType === t ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.05)",
                          borderColor: nuPersonType === t ? "rgba(37,99,235,0.8)" : "rgba(255,255,255,0.15)",
                        }}
                      >
                        {t === "cpf"
                          ? <User className={`h-6 w-6 ${nuPersonType === t ? "text-blue-400" : "text-blue-200/40"}`} />
                          : <Building2 className={`h-6 w-6 ${nuPersonType === t ? "text-blue-400" : "text-blue-200/40"}`} />}
                        <div className="text-center">
                          <p className={`text-sm font-semibold ${nuPersonType === t ? "text-white" : "text-blue-200/60"}`}>
                            {t === "cpf" ? "Pessoa Física" : "Pessoa Jurídica"}
                          </p>
                          <p className="text-xs" style={{ color: nuPersonType === t ? "rgba(147,197,253,0.7)" : "rgba(147,197,253,0.30)" }}>
                            {t === "cpf" ? "CPF" : "CNPJ"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Documento */}
                {!nuResult && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-blue-100/80 text-sm font-medium">
                        {nuPersonType === "cpf" ? "CPF" : "CNPJ"} *
                      </Label>
                      <Input
                        placeholder={nuPersonType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                        value={nuDoc}
                        onChange={e => {
                          const v = nuPersonType === "cpf" ? maskCpf(e.target.value) : maskCnpj(e.target.value);
                          setNuDoc(v); setNuError("");
                        }}
                        onKeyDown={e => e.key === "Enter" && !nuLoading && handleNuLookup()}
                        className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 focus-visible:ring-blue-400/30 h-11"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                        inputMode="numeric"
                        autoFocus
                      />
                    </div>
                    {nuError && (
                      <p className="text-sm text-red-400 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 shrink-0" />{nuError}
                      </p>
                    )}
                    <Button
                      type="button"
                      className="w-full h-11 text-base font-semibold"
                      style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                      disabled={nuLoading || nuDocDigits.length < nuMinLen}
                      onClick={handleNuLookup}
                    >
                      {nuLoading
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
                        : <><ChevronRight className="h-4 w-4 mr-2" />Verificar</>}
                    </Button>
                  </div>
                )}

                {/* Resultado: já tem cadastro */}
                {nuResult?.found && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4 border border-blue-500/30" style={{ background: "rgba(37,99,235,0.15)" }}>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-blue-200">Cadastro já existe!</p>
                          {nuResult.name && <p className="text-xs text-blue-300/80 mt-0.5">Encontramos o cadastro de <strong>{nuResult.name}</strong>.</p>}
                          <p className="text-xs text-blue-200/60 mt-1">Use suas credenciais para entrar normalmente.</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="w-full h-11 text-base font-semibold"
                      style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                      onClick={() => { setStep("credentials"); setCpfCnpj(nuDoc); }}
                    >
                      Ir para o login
                    </Button>
                    <button
                      type="button"
                      className="w-full text-xs text-blue-200/50 hover:text-blue-200 transition-colors text-center"
                      onClick={() => { setNuResult(null); setNuDoc(""); }}
                    >
                      Verificar outro documento
                    </button>
                  </div>
                )}

                {/* Resultado: não tem cadastro → seguir para registro */}
                {nuResult?.found === false && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4 border border-emerald-500/30" style={{ background: "rgba(16,185,129,0.10)" }}>
                      <div className="flex items-start gap-3">
                        <User className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-300">Nenhum cadastro encontrado</p>
                          <p className="text-xs text-emerald-200/60 mt-1">Você pode criar sua conta agora.</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="w-full h-11 text-base font-semibold"
                      style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                      onClick={goToRegister}
                    >
                      Criar minha conta
                    </Button>
                    <button
                      type="button"
                      className="w-full text-xs text-blue-200/50 hover:text-blue-200 transition-colors text-center"
                      onClick={() => { setNuResult(null); setNuDoc(""); }}
                    >
                      Verificar outro documento
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Step: ip-verify ─────────────────────────────── */}
            {step === "ip-verify" && (
              <>
                <div className="mb-7 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="h-14 w-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                      <KeyRound className="h-7 w-7 text-amber-400" />
                    </div>
                  </div>
                  <h1 className="text-xl font-bold text-white">Verificação de acesso</h1>
                  <p className="text-blue-200/60 text-sm mt-2">
                    Detectamos acesso de uma rede diferente. Enviamos um código de 6 dígitos para seu e-mail cadastrado.
                  </p>
                </div>
                <form onSubmit={handleIpVerify} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="ipCode" className="text-blue-100/80 text-sm font-medium">Código de verificação</Label>
                    <Input
                      id="ipCode"
                      placeholder="000000"
                      value={ipCode}
                      onChange={(e) => setIpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      required
                      className="text-center text-2xl font-bold tracking-widest border-white/15 text-white placeholder:text-white/20 focus-visible:border-blue-400 focus-visible:ring-blue-400/30 h-14"
                      style={{ background: "rgba(255,255,255,0.07)" }}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold"
                    style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                    disabled={ipVerifyLoading || ipCode.length !== 6}
                  >
                    {ipVerifyLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</> : "Confirmar acesso"}
                  </Button>
                </form>
                <div className="mt-5 space-y-3">
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResendIpCode}
                      disabled={ipResendLoading || ipResendCooldown > 0}
                      className="text-blue-200/60 hover:text-blue-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-2 ${ipResendLoading ? "animate-spin" : ""}`} />
                      {ipResendCooldown > 0
                        ? `Reenviar em ${ipResendCooldown}s`
                        : "Reenviar código"}
                    </Button>
                  </div>
                  <div className="text-center pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => { setStep("credentials"); setIpCode(""); }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      Voltar ao login
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
    <ChatWidget />
    </>
  );
}
