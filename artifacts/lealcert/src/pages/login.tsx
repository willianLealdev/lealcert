import { useState } from "react";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Eye, EyeOff, Phone, MessageCircle, Mail, MapPin } from "lucide-react";

export default function Login() {
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { user } = useAuth();
  const branding = useBranding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (data.mustChangePassword) {
          setLocation("/change-password");
        } else {
          setLocation("/dashboard");
        }
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        const body = (err as { data?: { error?: string; email?: string } })?.data;
        if (!status) {
          toast({ title: "Servidor indisponível", description: "Não foi possível conectar ao servidor. Tente novamente em instantes.", variant: "destructive" });
        } else if (status === 403 && body?.email) {
          toast({
            title: "E-mail não verificado",
            description: "Verifique sua caixa de entrada e confirme o código enviado.",
            variant: "destructive",
          });
          setLocation(`/verify-email?email=${encodeURIComponent(body.email)}`);
        } else {
          toast({ title: "Acesso negado", description: body?.error ?? "CPF/CNPJ ou senha inválidos.", variant: "destructive" });
        }
      },
    },
  });

  if (user) {
    if (user.mustChangePassword) {
      setLocation("/change-password");
    } else {
      setLocation("/dashboard");
    }
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { cpfCnpj, password } });
  };

  return (
    <div
      className="min-h-screen flex"
      style={{
        background: "linear-gradient(135deg, hsl(220,52%,8%) 0%, hsl(218,52%,14%) 50%, hsl(214,60%,20%) 100%)",
      }}
    >
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center text-center space-y-8">
          <img
            src={branding.logoUrl || "/logo.png"}
            alt={branding.appName}
            className="h-56 w-auto object-contain drop-shadow-2xl"
          />
          <p className="text-blue-200/80 text-lg max-w-sm leading-relaxed">
            Plataforma completa para emissão e gerenciamento de certificados digitais com segurança e agilidade.
          </p>
          <div className="flex items-center gap-6 text-blue-200/60 text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-400/80" />
              <span>e-CPF &amp; e-CNPJ</span>
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-400/80" />
              <span>A1 &amp; A3</span>
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-400/80" />
              <span>ICP-Brasil</span>
            </div>
          </div>

          {/* Contact info */}
          {(branding.contactPhone || branding.contactWhatsapp || branding.contactEmailSupport || branding.contactAddress) && (
            <div className="mt-4 space-y-2 text-blue-200/50 text-sm text-left w-full max-w-xs">
              {branding.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{branding.contactPhone}</span>
                </div>
              )}
              {branding.contactWhatsapp && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{branding.contactWhatsapp}</span>
                </div>
              )}
              {branding.contactEmailSupport && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span>{branding.contactEmailSupport}</span>
                </div>
              )}
              {branding.contactAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{branding.contactAddress}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src={branding.logoUrl || "/logo.png"} alt={branding.appName} className="h-24 w-auto object-contain" />
          </div>

          <div
            className="rounded-2xl p-8 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(16px)" }}
          >
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-white">Acesso ao sistema</h1>
              <p className="text-blue-200/60 text-sm mt-1">Insira suas credenciais para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="cpfCnpj" className="text-blue-100/80 text-sm font-medium">
                  CPF ou CNPJ
                </Label>
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
                  <Label htmlFor="password" className="text-blue-100/80 text-sm font-medium">
                    Senha
                  </Label>
                  <Link href="/forgot-password">
                    <span className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
                      Esqueci minha senha
                    </span>
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
                style={{
                  background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)",
                  boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)",
                }}
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando...</>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
              <div className="text-center">
                <Link href="/register">
                  <span className="text-sm text-blue-300 hover:text-blue-200 transition-colors cursor-pointer font-medium">
                    Não tem conta? Cadastre-se
                  </span>
                </Link>
              </div>
              <p className="text-xs text-center text-blue-200/40">
                Em caso de problemas de acesso, entre em contato com o administrador.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
