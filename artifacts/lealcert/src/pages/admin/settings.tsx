import { useState, useState as useLocalState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ShieldCheck, Globe, Mail } from "lucide-react";

function MaskedInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useLocalState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pr-10"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading, refetch } = useGetSettings();
  const [form, setForm] = useState({
    appName: "", mpAccessToken: "", mpPublicKey: "", webhookSecret: "", mailFrom: "", siteUrl: ""
  });

  useEffect(() => {
    if (settings) {
      setForm({
        appName: settings.appName ?? "",
        mpAccessToken: settings.mpAccessToken ?? "",
        mpPublicKey: settings.mpPublicKey ?? "",
        webhookSecret: settings.webhookSecret ?? "",
        mailFrom: settings.mailFrom ?? "",
        siteUrl: settings.siteUrl ?? "",
      });
    }
  }, [settings]);

  const update = useUpdateSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Configurações salvas!" }); refetch(); },
      onError: (e: unknown) => toast({ title: "Erro", description: (e as { data?: { error?: string } })?.data?.error ?? (e as Error)?.message ?? "Erro ao salvar.", variant: "destructive" }),
    },
  });

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({ data: form });
  }

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Configure as integrações e dados gerais do sistema.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* General */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Configurações Gerais</CardTitle>
            </div>
            <CardDescription>Informações básicas da plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Plataforma</Label>
              <Input value={form.appName} onChange={e => set("appName", e.target.value)} placeholder="LealCert" />
            </div>
            <div className="space-y-2">
              <Label>URL do Site (para redirects de pagamento)</Label>
              <Input type="url" value={form.siteUrl} onChange={e => set("siteUrl", e.target.value)} placeholder="https://lealcert.com.br" />
            </div>
            <div className="space-y-2">
              <Label>E-mail de envio</Label>
              <Input type="email" value={form.mailFrom} onChange={e => set("mailFrom", e.target.value)} placeholder="noreply@lealcert.com.br" />
            </div>
          </CardContent>
        </Card>

        {/* MercadoPago */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>MercadoPago</CardTitle>
            </div>
            <CardDescription>
              Credenciais para processamento de pagamentos via MercadoPago.
              Acesse <a href="https://www.mercadopago.com.br/developers/pt/docs" target="_blank" rel="noopener noreferrer" className="text-primary underline">mercadopago.com.br/developers</a> para obter suas chaves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Access Token</Label>
              <MaskedInput
                value={form.mpAccessToken}
                onChange={v => set("mpAccessToken", v)}
                placeholder="APP_USR-..."
              />
              <p className="text-xs text-muted-foreground">Usado para criar preferências de pagamento no servidor.</p>
            </div>
            <div className="space-y-2">
              <Label>Public Key</Label>
              <MaskedInput
                value={form.mpPublicKey}
                onChange={v => set("mpPublicKey", v)}
                placeholder="APP_USR-..."
              />
              <p className="text-xs text-muted-foreground">Usado no checkout do lado do cliente.</p>
            </div>
            <div className="space-y-2">
              <Label>Webhook Secret</Label>
              <MaskedInput
                value={form.webhookSecret}
                onChange={v => set("webhookSecret", v)}
                placeholder="Chave secreta para verificar notificações"
              />
              <p className="text-xs text-muted-foreground">
                Configure o webhook no painel do MercadoPago apontando para:{" "}
                <code className="bg-muted px-1 rounded text-xs">{form.siteUrl || "[siteUrl]"}/api/mp/webhook</code>
              </p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={update.isPending} size="lg">
          {update.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Configurações"}
        </Button>
      </form>
    </div>
  );
}
