import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";

function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
      [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
    );
  }
  return d
    .slice(0, 14)
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
      [a, b, c].filter(Boolean).join(".").replace(/^(\d{2})/, "$1") +
      "/" + dd + (e ? "-" + e : "")
    )
    .replace(/^(\d{2})(\d{3})/, "$1.$2")
    .replace(/\.(\d{3})(\d{3})/, ".$1.$2");
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", cpfCnpj: "", phone: "", password: "", confirm: "" });

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

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        cpfCnpj: form.cpfCnpj.replace(/\D/g, ""),
        password: form.password,
        phone: form.phone || undefined,
      },
    });
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
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-white">Criar conta</h1>
            <p className="text-blue-200/60 text-sm mt-1">Preencha os dados para se cadastrar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Nome completo *</Label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                required
                placeholder="Seu nome completo"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">E-mail *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                required
                placeholder="seu@email.com"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">CPF ou CNPJ *</Label>
              <Input
                value={form.cpfCnpj}
                onChange={e => set("cpfCnpj", maskCpfCnpj(e.target.value))}
                required
                placeholder="000.000.000-00"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Telefone / WhatsApp</Label>
              <Input
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="(11) 99999-0000"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={{ background: "rgba(255,255,255,0.07)" }}
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
                  style={{ background: "rgba(255,255,255,0.07)" }}
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
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold mt-2"
              style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando conta...</> : "Criar conta"}
            </Button>
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
