import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useVerifyEmail, useResendVerification } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function VerifyEmail() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
  const email = params.get("email") ?? "";

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const verifyMutation = useVerifyEmail({
    mutation: {
      onSuccess: () => {
        toast({ title: "E-mail verificado!", description: "Bem-vindo ao LealCert." });
        setLocation("/dashboard");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Código inválido ou expirado.";
        toast({ title: "Erro na verificação", description: msg, variant: "destructive" });
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      },
    },
  });

  const resendMutation = useResendVerification({
    mutation: {
      onSuccess: () => {
        toast({ title: "Código reenviado!", description: "Verifique sua caixa de entrada." });
        setCooldown(60);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Erro ao reenviar.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  function handleDigit(idx: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (next.every(d => d !== "") && char) {
      verifyMutation.mutate({ data: { email, code: next.join("") } });
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      const next = text.split("");
      setDigits(next);
      inputRefs.current[5]?.focus();
      verifyMutation.mutate({ data: { email, code: text } });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      toast({ title: "Atenção", description: "Digite os 6 dígitos do código.", variant: "destructive" });
      return;
    }
    verifyMutation.mutate({ data: { email, code } });
  }

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
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Verifique seu e-mail</h1>
            <p className="text-blue-200/60 text-sm mt-2">
              Enviamos um código de 6 dígitos para<br />
              <span className="text-blue-300 font-medium">{email || "seu e-mail"}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 text-white transition-all outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    borderColor: d ? "rgba(96,165,250,0.8)" : "rgba(255,255,255,0.15)",
                  }}
                />
              ))}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
              disabled={verifyMutation.isPending || code.length !== 6}
            >
              {verifyMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</> : "Confirmar código"}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resendMutation.mutate({ data: { email } })}
                disabled={resendMutation.isPending || cooldown > 0 || !email}
                className="text-blue-200/60 hover:text-blue-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${resendMutation.isPending ? "animate-spin" : ""}`} />
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/10">
              <ArrowLeft className="h-4 w-4 text-blue-200/50" />
              <Link href="/login">
                <span className="text-sm text-blue-200/60 hover:text-blue-300 transition-colors cursor-pointer">
                  Voltar ao login
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
