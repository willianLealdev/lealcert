import { useState } from "react";
import { useLocation } from "wouter";
import { useChangePassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useChangePassword({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Senha alterada!", description: "Sua nova senha foi salva com sucesso." });
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/dashboard");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao alterar senha.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A nova senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não conferem", description: "Confirme a nova senha corretamente.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ data: { currentPassword, newPassword } });
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
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Cadastre uma nova senha</h1>
            {user && (
              <p className="text-blue-200/60 text-sm mt-2">
                Olá, <span className="text-blue-300 font-medium">{user.name}</span>!<br />
                Por segurança, defina uma nova senha para continuar.
              </p>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-6">
            <p className="text-amber-300 text-sm text-center">
              Você está usando uma senha temporária. Cadastre uma nova senha permanente abaixo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Senha temporária *</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Digite a senha temporária"
                  className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-11"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/50 hover:text-blue-200 transition-colors" tabIndex={-1}>
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Nova senha * (mínimo 6 caracteres)</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="Escolha uma nova senha"
                  className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11 pr-11"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/50 hover:text-blue-200 transition-colors" tabIndex={-1}>
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-blue-100/80 text-sm font-medium">Confirmar nova senha *</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita a nova senha"
                className="border-white/15 text-white placeholder:text-white/30 focus-visible:border-blue-400 h-11"
                style={inputStyle}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold mt-2"
              style={{ background: "linear-gradient(135deg, hsl(214,80%,50%) 0%, hsl(214,80%,42%) 100%)", boxShadow: "0 4px 20px hsl(214,80%,46%,0.45)" }}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                : "Salvar nova senha"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
