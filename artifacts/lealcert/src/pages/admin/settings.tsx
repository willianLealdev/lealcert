import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ShieldCheck, Globe, Link2, ToggleRight, CheckCircle2, MessageCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function MaskedInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
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

function ProviderBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />Ativo</span>
    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Inativo</span>;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading, refetch } = useGetSettings();
  const [testingAuth, setTestingAuth] = useState(false);

  const [form, setForm] = useState({
    appName: "",
    mpAccessToken: "",
    mpPublicKey: "",
    webhookSecret: "",
    mailFrom: "",
    siteUrl: "",
    garApiKey: "",
    garHashVendedor: "",
    garHashTabela: "",
    garFormaPagamento: "11",
    garPreferirVideoconferencia: "1",
    safewebUrl: "",
    safewebUrlHomologacao: "",
    safewebAmbiente: "producao",
    safewebUsername: "",
    safewebPassword: "",
    safewebCnpjAr: "",
    safewebCodigoParceiro: "",
    activeProvider: "gestaoar",
    evolutionUrl: "",
    evolutionApiKey: "",
    evolutionInstance: "",
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
        garApiKey: settings.garApiKey ?? "",
        garHashVendedor: settings.garHashVendedor ?? "",
        garHashTabela: settings.garHashTabela ?? "",
        garFormaPagamento: settings.garFormaPagamento ?? "11",
        garPreferirVideoconferencia: settings.garPreferirVideoconferencia ?? "1",
        safewebUrl: settings.safewebUrl ?? "",
        safewebUrlHomologacao: (settings as typeof settings & { safewebUrlHomologacao?: string }).safewebUrlHomologacao ?? "",
        safewebAmbiente: (settings as typeof settings & { safewebAmbiente?: string }).safewebAmbiente ?? "producao",
        safewebUsername: settings.safewebUsername ?? "",
        safewebPassword: settings.safewebPassword ?? "",
        safewebCnpjAr: settings.safewebCnpjAr ?? "",
        safewebCodigoParceiro: (settings as typeof settings & { safewebCodigoParceiro?: string }).safewebCodigoParceiro ?? "",
        activeProvider: settings.activeProvider ?? "gestaoar",
        evolutionUrl: (settings as typeof settings & { evolutionUrl?: string }).evolutionUrl ?? "",
        evolutionApiKey: (settings as typeof settings & { evolutionApiKey?: string }).evolutionApiKey ?? "",
        evolutionInstance: (settings as typeof settings & { evolutionInstance?: string }).evolutionInstance ?? "",
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

  function setActiveProvider(provider: string) {
    const updated = { ...form, activeProvider: provider };
    setForm(updated);
    update.mutate({ data: updated });
  }

  async function testSafewebAuth() {
    setTestingAuth(true);
    try {
      const resp = await fetch("/api/safeweb/test-auth", { method: "POST", credentials: "include" });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (data.ok) toast({ title: "Safeweb: autenticação OK!", description: "Conexão e credenciais validadas com sucesso." });
      else toast({ title: "Safeweb: falha na autenticação", description: data.error ?? "Erro desconhecido.", variant: "destructive" });
    } catch {
      toast({ title: "Erro ao testar autenticação", variant: "destructive" });
    } finally {
      setTestingAuth(false);
    }
  }

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;

  const isGarActive = form.activeProvider === "gestaoar";
  const isSwActive = form.activeProvider === "safeweb";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Configure as integrações e dados gerais do sistema.</p>
      </div>

      {/* Provider Toggle */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ToggleRight className="h-5 w-5 text-primary" />
            <CardTitle>Provedor Ativo de Certificação</CardTitle>
          </div>
          <CardDescription>
            Selecione qual sistema será usado para emissão e gestão de certificados digitais. Apenas um pode estar ativo por vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setActiveProvider("gestaoar")}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${isGarActive ? "border-primary bg-primary/10 shadow-sm" : "border-muted bg-background hover:border-muted-foreground/40"}`}
            >
              <Link2 className={`h-7 w-7 ${isGarActive ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-semibold text-sm">Gestão AR</span>
              <ProviderBadge active={isGarActive} />
            </button>
            <button
              type="button"
              onClick={() => setActiveProvider("safeweb")}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${isSwActive ? "border-primary bg-primary/10 shadow-sm" : "border-muted bg-background hover:border-muted-foreground/40"}`}
            >
              <ShieldCheck className={`h-7 w-7 ${isSwActive ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-semibold text-sm">Safeweb</span>
              <ProviderBadge active={isSwActive} />
            </button>
          </div>
        </CardContent>
      </Card>

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
              <MaskedInput value={form.mpAccessToken} onChange={v => set("mpAccessToken", v)} placeholder="APP_USR-..." />
              <p className="text-xs text-muted-foreground">Usado para criar preferências de pagamento no servidor.</p>
            </div>
            <div className="space-y-2">
              <Label>Public Key</Label>
              <MaskedInput value={form.mpPublicKey} onChange={v => set("mpPublicKey", v)} placeholder="APP_USR-..." />
              <p className="text-xs text-muted-foreground">Usado no checkout do lado do cliente.</p>
            </div>
            <div className="space-y-2">
              <Label>Webhook Secret</Label>
              <MaskedInput value={form.webhookSecret} onChange={v => set("webhookSecret", v)} placeholder="Chave secreta para verificar notificações" />
              <p className="text-xs text-muted-foreground">
                Configure o webhook no painel do MercadoPago apontando para:{" "}
                <code className="bg-muted px-1 rounded text-xs">{form.siteUrl || "[siteUrl]"}/api/mp/webhook</code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Gestão AR */}
        {isGarActive && <Card className="ring-2 ring-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <CardTitle>Gestão AR — Integração</CardTitle>
              </div>
              <ProviderBadge active={isGarActive} />
            </div>
            <CardDescription>
              Credenciais e preferências para integração com a plataforma Gestão AR.
              Obtenha suas chaves em <a href="https://gestaoar.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">gestaoar.com.br</a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <MaskedInput value={form.garApiKey} onChange={v => set("garApiKey", v)} placeholder="Chave de API fornecida pela Gestão AR" />
              <p className="text-xs text-muted-foreground">Enviada em todas as requisições à API GAR.</p>
            </div>
            <div className="space-y-2">
              <Label>Hash do Vendedor</Label>
              <MaskedInput value={form.garHashVendedor} onChange={v => set("garHashVendedor", v)} placeholder="Hash do vendedor/AR na plataforma GAR" />
            </div>
            <div className="space-y-2">
              <Label>Hash da Tabela de Preços</Label>
              <MaskedInput value={form.garHashTabela} onChange={v => set("garHashTabela", v)} placeholder="Hash da tabela de preços configurada no GAR" />
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento Padrão</Label>
              <Select value={form.garFormaPagamento} onValueChange={v => set("garFormaPagamento", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="11">11 — Pagamento no Local</SelectItem>
                  <SelectItem value="1">1 — Boleto Bancário</SelectItem>
                  <SelectItem value="2">2 — Cartão de Crédito</SelectItem>
                  <SelectItem value="3">3 — Transferência/PIX</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">"Pagamento no Local" (11) é o padrão pois o pagamento já é processado via MercadoPago.</p>
            </div>
            <div className="space-y-2">
              <Label>Preferir Videoconferência</Label>
              <Select value={form.garPreferirVideoconferencia} onValueChange={v => set("garPreferirVideoconferencia", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sim — priorizar agendamento por videoconferência</SelectItem>
                  <SelectItem value="0">Não — usar locais presenciais</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>}

        {/* Safeweb */}
        {isSwActive && <Card className="ring-2 ring-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Safeweb — Integração</CardTitle>
              </div>
              <ProviderBadge active={isSwActive} />
            </div>
            <CardDescription>
              Credenciais para integração com a API Safeweb. Documentação em{" "}
              <a href="https://developers.safeweb.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">developers.safeweb.com.br</a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ambiente */}
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={form.safewebAmbiente} onValueChange={v => set("safewebAmbiente", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="producao">Produção — developers.safeweb.com.br</SelectItem>
                  <SelectItem value="homologacao">Homologação — h-acsafeweb.safewebpss.com.br</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione o ambiente ativo. O sistema usará automaticamente a URL correspondente.
              </p>
            </div>

            {/* URL Produção */}
            <div className="space-y-2">
              <Label>URL — Produção</Label>
              <Input
                value={form.safewebUrl}
                onChange={e => set("safewebUrl", e.target.value)}
                placeholder="https://acsafeweb.safewebpss.com.br"
              />
              <p className="text-xs text-muted-foreground">
                URL fornecida pela Safeweb para o ambiente de produção.
                Documentação: <a href="https://developers.safeweb.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">developers.safeweb.com.br</a>
              </p>
            </div>

            {/* URL Homologação */}
            <div className="space-y-2">
              <Label>URL — Homologação</Label>
              <Input
                value={form.safewebUrlHomologacao}
                onChange={e => set("safewebUrlHomologacao", e.target.value)}
                placeholder="https://h-acsafeweb.safewebpss.com.br"
              />
              <p className="text-xs text-muted-foreground">
                URL do ambiente de testes/homologação.
                Documentação: <a href="https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safeweb/home" target="_blank" rel="noopener noreferrer" className="text-primary underline">documentação de homologação</a>
              </p>
            </div>

            {/* Usuário */}
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Input
                value={form.safewebUsername}
                onChange={e => set("safewebUsername", e.target.value)}
                placeholder="Usuário fornecido pela Safeweb"
                autoComplete="off"
              />
            </div>

            {/* Senha */}
            <div className="space-y-2">
              <Label>Senha</Label>
              <MaskedInput value={form.safewebPassword} onChange={v => set("safewebPassword", v)} placeholder="Senha fornecida pela Safeweb" />
            </div>

            {/* CNPJ AR */}
            <div className="space-y-2">
              <Label>CNPJ da AR</Label>
              <Input
                value={form.safewebCnpjAr}
                onChange={e => set("safewebCnpjAr", e.target.value)}
                placeholder="00000000000000"
              />
              <p className="text-xs text-muted-foreground">CNPJ da sua Autoridade de Registro cadastrada na Safeweb.</p>
            </div>

            {/* Código do Parceiro */}
            <div className="space-y-2">
              <Label>Código do Parceiro <span className="text-destructive font-semibold">*</span></Label>
              <Input
                value={form.safewebCodigoParceiro}
                onChange={e => set("safewebCodigoParceiro", e.target.value)}
                placeholder="Código fornecido pela Safeweb ao cadastrar como parceiro integrador"
              />
              <p className="text-xs text-muted-foreground">
                Campo <strong>obrigatório</strong> pela API Safeweb (campo <code>CodigoParceiro</code>). Obtido no contrato de parceria com a Safeweb.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testingAuth || !(form.safewebAmbiente === "homologacao" ? form.safewebUrlHomologacao : form.safewebUrl) || !form.safewebUsername || !form.safewebPassword}
              onClick={testSafewebAuth}
            >
              {testingAuth ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testando...</> : `Testar Conexão (${form.safewebAmbiente === "homologacao" ? "Homologação" : "Produção"})`}
            </Button>
          </CardContent>
        </Card>}

        {/* Evolution API — WhatsApp */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <CardTitle>WhatsApp — Evolution API</CardTitle>
            </div>
            <CardDescription>
              Integração com Evolution API para envio de notificações via WhatsApp.
              Configure sua instância em <a href="https://evolution-api.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">evolution-api.com</a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL da Evolution API</Label>
              <Input
                value={form.evolutionUrl}
                onChange={e => set("evolutionUrl", e.target.value)}
                placeholder="https://evolution.seudominio.com.br"
              />
              <p className="text-xs text-muted-foreground">URL base da sua instância Evolution API.</p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <MaskedInput value={form.evolutionApiKey} onChange={v => set("evolutionApiKey", v)} placeholder="Chave de autenticação da API" />
            </div>
            <div className="space-y-2">
              <Label>Nome da Instância</Label>
              <Input
                value={form.evolutionInstance}
                onChange={e => set("evolutionInstance", e.target.value)}
                placeholder="lealcert"
              />
              <p className="text-xs text-muted-foreground">Nome da instância configurada na Evolution API.</p>
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
