import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";

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

export default function ForgotPassword() {
  const { toast } = useToast();
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [sent, setSent] = useState(false);

  const forgotMutation = useForgotPassword({
    mutation: {
      onSuccess: () => {
        setSent(true);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao processar solicitação.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    forgotMutation.mutate({ data: { cpfCnpj: cpfCnpj.replace(/\D/g, "") } });
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
          {sent ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">E-mail enviado!</h1>
              <p className="text-blue-200/60 text-sm leading-relaxed mb-6">
                Se o CPF/CNPJ informado estiver cadastrado, você receberá um e-mail com a senha temporária em instantes.
              </p>
              <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-left">
                <p className="text-amber-300 text-sm font-medium mb-1">⚠️ Atenção</p>
                <p className="text-amber-200/70 text-xs leading-relaxed">
                  Ao fazer login com a senha temporária, você será obrigado a cadastrar uma nova senha permanente antes de continuar.
                </p>
              </div>
              <Link href="/login">
                <Button
                  className="w-full h-11 text-base font-semibold"
                  style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)" }}
                >
                  Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-8">
                <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                  <KeyRound className="h-8 w-8 text-blue-400" />
                </div>
                <h1 className="text-2xl font-bold text-white">Recuperar senha</h1>
                <p className="text-blue-200/60 text-sm mt-2">
                  Informe seu CPF ou CNPJ e enviaremos uma senha temporária para o e-mail cadastrado.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-blue-100/80 text-sm font-medium">CPF ou CNPJ *</Label>
                  <Input
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(maskCpfCnpj(e.target.value))}
                    required
                    placeholder="000.000.000-00"
                    className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-semibold"
                  style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
                  disabled={forgotMutation.isPending}
                >
                  {forgotMutation.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                    : "Enviar senha temporária"}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4 text-blue-200/50" />
                <Link href="/login">
                  <span className="text-sm text-blue-200/60 hover:text-blue-300 transition-colors cursor-pointer">
                    Voltar ao login
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
