import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, useSendTestEmail, useGetGarFormasPagamento } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Eye, EyeOff, ShieldCheck, Globe, Link2, ToggleRight,
  CheckCircle2, MessageCircle, CreditCard, Mail, Phone, Palette, Send, Bell, BellOff, Bot, Megaphone, Receipt, Volume2, Mic, Video,
} from "lucide-react";
import { useSendTestPush } from "@workspace/api-client-react";
import { usePush } from "@/lib/use-push";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function MaskedInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} className="pr-10" />
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

const PRESET_COLORS = [
  { label: "Azul Cobalto", value: "#2563eb" },
  { label: "Azul Royal", value: "#1d4ed8" },
  { label: "Verde Esmeralda", value: "#059669" },
  { label: "Verde Lima", value: "#16a34a" },
  { label: "Roxo", value: "#7c3aed" },
  { label: "Rosa", value: "#db2777" },
  { label: "Laranja", value: "#ea580c" },
  { label: "Âmbar", value: "#d97706" },
  { label: "Cinza Ardósia", value: "#475569" },
  { label: "Preto", value: "#0f172a" },
];

export default function AdminSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading, refetch } = useGetSettings();
  const { data: garFormasPagamento } = useGetGarFormasPagamento();
  const [testingAuth, setTestingAuth] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");

  const push = usePush();

  const testPushMutation = useSendTestPush({
    mutation: {
      onSuccess: (d) => {
        const data = d as { ok?: boolean; error?: string };
        if (data.ok) toast({ title: "✅ Notificação de teste enviada!" });
        else toast({ title: "Falha", description: data.error, variant: "destructive" });
      },
      onError: (e: unknown) => toast({ title: "Erro", description: (e as Error)?.message, variant: "destructive" }),
    },
  });

  const [form, setForm] = useState({
    appName: "",
    siteUrl: "",
    mailFrom: "",
    logoUrl: "",
    primaryColor: "#2563eb",
    contactPhone: "",
    contactWhatsapp: "",
    contactEmailSupport: "",
    contactAddress: "",
    mpAccessToken: "",
    mpPublicKey: "",
    webhookSecret: "",
    garApiKey: "",
    garDocumento: "",
    garHashVendedor: "",
    garHashParceiro: "",
    garHashTabela: "",
    garFormaPagamento: "8",
    garPreferirVideoconferencia: "1",
    safewebUrl: "",
    safewebUrlHomologacao: "",
    safewebAmbiente: "producao",
    safewebUsername: "",
    safewebPassword: "",
    safewebUsernameHomologacao: "",
    safewebPasswordHomologacao: "",
    safewebCnpjAr: "",
    safewebCodigoParceiro: "",
    activeProvider: "gestaoar",
    evolutionUrl: "",
    evolutionApiKey: "",
    evolutionInstance: "",
    evolutionMktUrl: "",
    evolutionMktApiKey: "",
    evolutionMktInstance: "",
    smtpHostDb: "",
    smtpPortDb: "587",
    smtpUserDb: "",
    smtpPassDb: "",
    mktSmtpHostDb: "",
    mktSmtpPortDb: "587",
    mktSmtpUserDb: "",
    mktSmtpPassDb: "",
    mktMailFrom: "",
    vapidSubject: "mailto:contato@lealcert.com.br",
    vapidPublicKey: "",
    vapidPrivateKey: "",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    aiProvider: "openai",
    deepseekApiKey: "",
    deepseekModel: "deepseek-chat",
    claudeApiKey: "",
    claudeModel: "claude-3-5-haiku-20241022",
    zeroBounceApiKey: "",
    // Discagem IA
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhoneNumber: "",
    cartesiaApiKey: "",
    cartesiaVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    willianCartesiaVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    alineCartesiaVoiceId: "694f9389-aac1-45b6-b726-9d9369183238",
    elevenlabsApiKey: "",
    elevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    willianElevenlabsVoiceId: "TxGEqnHWrfWFTfGW9XjX",
    alineElevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    deepgramApiKey: "",
    discagemAiFallback: '["deepseek","claude","openai"]',
    discagemTtsFallback: '["cartesia","elevenlabs"]',
    discagemPublicHostname: "",
    jitsiAppId: "",
    jitsiAppSecret: "",
    jitsiDomain: "meet.lealcert.com.br",
    resendApiKey: "",
    mktUseResend: "0",
    nfseAmbiente: "homologacao",
    nfseAutoEmit: "0",
    nfseTokenTest: "",
    nfseTokenProd: "",
    nfsePrestadorCnpj: "",
    nfsePrestadorIm: "",
    nfseServicoCodigo: "1.09",
    nfseServicoAliquota: "2",
    nfseDiscriminacao: "Emissão de Certificado Digital",
    nfseIssRetido: "0",
  });

  useEffect(() => {
    if (settings) {
      const s = settings as typeof settings & {
        logoUrl?: string; primaryColor?: string;
        contactPhone?: string; contactWhatsapp?: string;
        contactEmailSupport?: string; contactAddress?: string;
        safewebUrlHomologacao?: string; safewebAmbiente?: string;
        safewebCodigoParceiro?: string;
        safewebUsernameHomologacao?: string; safewebPasswordHomologacao?: string;
        evolutionUrl?: string; evolutionApiKey?: string; evolutionInstance?: string;
        smtpHostDb?: string; smtpPortDb?: string; smtpUserDb?: string; smtpPassDb?: string;
        mktSmtpHostDb?: string; mktSmtpPortDb?: string; mktSmtpUserDb?: string; mktSmtpPassDb?: string; mktMailFrom?: string;
        vapidSubject?: string; vapidPublicKey?: string; vapidPrivateKey?: string;
        openaiApiKey?: string; openaiModel?: string;
        aiProvider?: string;
        deepseekApiKey?: string; deepseekModel?: string;
        claudeApiKey?: string; claudeModel?: string;
        zeroBounceApiKey?: string;
         jitsiAppId?: string; jitsiAppSecret?: string; jitsiDomain?: string;
      };
      setForm({
        appName: s.appName ?? "",
        siteUrl: s.siteUrl ?? "",
        mailFrom: s.mailFrom ?? "",
        logoUrl: s.logoUrl ?? "",
        primaryColor: s.primaryColor ?? "#2563eb",
        contactPhone: s.contactPhone ?? "",
        contactWhatsapp: s.contactWhatsapp ?? "",
        contactEmailSupport: s.contactEmailSupport ?? "",
        contactAddress: s.contactAddress ?? "",
        mpAccessToken: s.mpAccessToken ?? "",
        mpPublicKey: s.mpPublicKey ?? "",
        webhookSecret: s.webhookSecret ?? "",
        garApiKey: s.garApiKey ?? "",
        garDocumento: s.garDocumento ?? "",
        garHashVendedor: s.garHashVendedor ?? "",
        garHashParceiro: s.garHashParceiro ?? "",
        garHashTabela: s.garHashTabela ?? "",
        garFormaPagamento: s.garFormaPagamento ?? "8",
        garPreferirVideoconferencia: s.garPreferirVideoconferencia ?? "1",
        safewebUrl: s.safewebUrl ?? "",
        safewebUrlHomologacao: s.safewebUrlHomologacao ?? "",
        safewebAmbiente: s.safewebAmbiente ?? "producao",
        safewebUsername: s.safewebUsername ?? "",
        safewebPassword: s.safewebPassword ?? "",
        safewebUsernameHomologacao: s.safewebUsernameHomologacao ?? "",
        safewebPasswordHomologacao: s.safewebPasswordHomologacao ?? "",
        safewebCnpjAr: s.safewebCnpjAr ?? "",
        safewebCodigoParceiro: s.safewebCodigoParceiro ?? "",
        activeProvider: s.activeProvider ?? "gestaoar",
        evolutionUrl: s.evolutionUrl ?? "",
        evolutionApiKey: s.evolutionApiKey ?? "",
        evolutionInstance: s.evolutionInstance ?? "",
        evolutionMktUrl: (s as unknown as Record<string, string>).evolutionMktUrl ?? "",
        evolutionMktApiKey: (s as unknown as Record<string, string>).evolutionMktApiKey ?? "",
        evolutionMktInstance: (s as unknown as Record<string, string>).evolutionMktInstance ?? "",
        smtpHostDb: s.smtpHostDb ?? "",
        smtpPortDb: s.smtpPortDb ?? "587",
        smtpUserDb: s.smtpUserDb ?? "",
        smtpPassDb: s.smtpPassDb ?? "",
        mktSmtpHostDb: s.mktSmtpHostDb ?? "",
        mktSmtpPortDb: s.mktSmtpPortDb ?? "587",
        mktSmtpUserDb: s.mktSmtpUserDb ?? "",
        mktSmtpPassDb: s.mktSmtpPassDb ?? "",
        mktMailFrom: s.mktMailFrom ?? "",
        vapidSubject: s.vapidSubject ?? "mailto:contato@lealcert.com.br",
        vapidPublicKey: s.vapidPublicKey ?? "",
        vapidPrivateKey: s.vapidPrivateKey ?? "",
        openaiApiKey: s.openaiApiKey ?? "",
        openaiModel: s.openaiModel ?? "gpt-4o-mini",
        aiProvider: s.aiProvider ?? "openai",
        deepseekApiKey: s.deepseekApiKey ?? "",
        deepseekModel: s.deepseekModel ?? "deepseek-chat",
        claudeApiKey: s.claudeApiKey ?? "",
        zeroBounceApiKey: s.zeroBounceApiKey ?? "",
        resendApiKey: (s as unknown as Record<string, string>).resendApiKey ?? "",
        mktUseResend: (s as unknown as Record<string, string>).mktUseResend ?? "0",
        claudeModel: s.claudeModel ?? "claude-3-5-haiku-20241022",
        // Discagem
        twilioAccountSid: (s as unknown as Record<string, string>).twilioAccountSid ?? "",
        twilioAuthToken: (s as unknown as Record<string, string>).twilioAuthToken ?? "",
        twilioPhoneNumber: (s as unknown as Record<string, string>).twilioPhoneNumber ?? "",
        cartesiaApiKey: (s as unknown as Record<string, string>).cartesiaApiKey ?? "",
        cartesiaVoiceId: (s as unknown as Record<string, string>).cartesiaVoiceId ?? "a0e99841-438c-4a64-b679-ae501e7d6091",
        willianCartesiaVoiceId: (s as unknown as Record<string, string>).willianCartesiaVoiceId ?? "a0e99841-438c-4a64-b679-ae501e7d6091",
        alineCartesiaVoiceId: (s as unknown as Record<string, string>).alineCartesiaVoiceId ?? "694f9389-aac1-45b6-b726-9d9369183238",
        elevenlabsApiKey: (s as unknown as Record<string, string>).elevenlabsApiKey ?? "",
        elevenlabsVoiceId: (s as unknown as Record<string, string>).elevenlabsVoiceId ?? "21m00Tcm4TlvDq8ikWAM",
        willianElevenlabsVoiceId: (s as unknown as Record<string, string>).willianElevenlabsVoiceId ?? "TxGEqnHWrfWFTfGW9XjX",
        alineElevenlabsVoiceId: (s as unknown as Record<string, string>).alineElevenlabsVoiceId ?? "21m00Tcm4TlvDq8ikWAM",
        deepgramApiKey: (s as unknown as Record<string, string>).deepgramApiKey ?? "",
        discagemAiFallback: (s as unknown as Record<string, string>).discagemAiFallback ?? '["deepseek","claude","openai"]',
        discagemTtsFallback: (s as unknown as Record<string, string>).discagemTtsFallback ?? '["cartesia","elevenlabs"]',
        discagemPublicHostname: (s as unknown as Record<string, string>).discagemPublicHostname ?? "",
         jitsiAppId: s.jitsiAppId ?? "",
         jitsiAppSecret: s.jitsiAppSecret ?? "",
         jitsiDomain: s.jitsiDomain ?? "meet.lealcert.com.br",
        nfseAmbiente: (s as unknown as Record<string, string>).nfseAmbiente ?? "homologacao",
        nfseAutoEmit: (s as unknown as Record<string, string>).nfseAutoEmit ?? "0",
        nfseTokenTest: (s as unknown as Record<string, string>).nfseTokenTest ?? "",
        nfseTokenProd: (s as unknown as Record<string, string>).nfseTokenProd ?? "",
        nfsePrestadorCnpj: (s as unknown as Record<string, string>).nfsePrestadorCnpj ?? "",
        nfsePrestadorIm: (s as unknown as Record<string, string>).nfsePrestadorIm ?? "",
        nfseServicoCodigo: (s as unknown as Record<string, string>).nfseServicoCodigo ?? "1.09",
        nfseServicoAliquota: (s as unknown as Record<string, string>).nfseServicoAliquota ?? "2",
        nfseDiscriminacao: (s as unknown as Record<string, string>).nfseDiscriminacao ?? "Emissão de Certificado Digital",
        nfseIssRetido: (s as unknown as Record<string, string>).nfseIssRetido ?? "0",
      });
    }
  }, [settings]);

  const update = useUpdateSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Configurações salvas!" }); refetch(); },
      onError: (e: unknown) => toast({ title: "Erro", description: (e as { data?: { error?: string } })?.data?.error ?? (e as Error)?.message ?? "Erro ao salvar.", variant: "destructive" }),
    },
  });

  const testEmailMutation = useSendTestEmail({
    mutation: {
      onSuccess: (data) => {
        const d = data as { ok?: boolean; error?: string };
        if (d.ok) toast({ title: "✅ E-mail de teste enviado!", description: `Verifique a caixa de entrada de ${testEmailTo}.` });
        else toast({ title: "Falha no envio", description: d.error ?? "Erro desconhecido.", variant: "destructive" });
      },
      onError: (e: unknown) => toast({ title: "Erro no SMTP", description: (e as { data?: { error?: string } })?.data?.error ?? (e as Error)?.message, variant: "destructive" }),
    },
  });

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); update.mutate({ data: form }); }

  function setActiveProvider(provider: string) {
    const updated = { ...form, activeProvider: provider };
    setForm(updated);
    update.mutate({ data: updated });
  }

  async function testSafewebAuth() {
    setTestingAuth(true);
    try {
      const resp = await fetch("/api/safeweb/test-auth", { method: "POST", credentials: "include" });
      const data = await resp.json() as { ok?: boolean; tokenPreview?: string; error?: string };
      if (resp.ok && data.ok) toast({ title: "✅ Safeweb: autenticação OK!", description: data.tokenPreview ? `Token: ${data.tokenPreview}` : undefined });
      else toast({ title: "Safeweb: credenciais inválidas", description: data.error ?? "Verifique o Identificador e Segredo.", variant: "destructive" });
    } catch {
      toast({ title: "Erro ao testar autenticação", variant: "destructive" });
    } finally {
      setTestingAuth(false);
    }
  }

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Carregando...</div>;

  const isGarActive = form.activeProvider === "gestaoar";
  const isSwActive = form.activeProvider === "safeweb";

  const SaveButton = () => (
    <Button type="submit" disabled={update.isPending} size="lg" className="mt-2">
      {update.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Configurações"}
    </Button>
  );

  // Derive domain from mailFrom or smtpUserDb for DNS instructions
  const emailDomain = (() => {
    const src = form.mailFrom || form.smtpUserDb;
    const match = src.match(/@([\w.-]+)/);
    return match ? match[1] : "seudominio.com.br";
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Configure as integrações e dados gerais do sistema.</p>
      </div>

      <Tabs defaultValue="identidade" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 max-w-3xl">
          <TabsTrigger value="identidade" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Palette className="h-4 w-4" /><span>Identidade</span>
          </TabsTrigger>
          <TabsTrigger value="contato" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Phone className="h-4 w-4" /><span>Contato</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Mail className="h-4 w-4" /><span>E-mail</span>
          </TabsTrigger>
          <TabsTrigger value="certificado" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ShieldCheck className="h-4 w-4" /><span>Certificado</span>
          </TabsTrigger>
          <TabsTrigger value="pagamento" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-4 w-4" /><span>Pagamento</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <MessageCircle className="h-4 w-4" /><span>WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" /><span>Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="ia" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Bot className="h-4 w-4" /><span>IA</span>
          </TabsTrigger>
          <TabsTrigger value="discagem" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Phone className="h-4 w-4" /><span>Discagem</span>
          </TabsTrigger>
          <TabsTrigger value="jitsi" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Video className="h-4 w-4" /><span>Reuniões</span>
          </TabsTrigger>
          <TabsTrigger value="nfse" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Receipt className="h-4 w-4" /><span>NFS-e</span>
          </TabsTrigger>
        </TabsList>

        {/* ── IA ────────────────────────────────────────────────────────── */}
        <TabsContent value="ia">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle>Assistente de Vendas (IA)</CardTitle>
                </div>
                <CardDescription>
                  Configure sua própria chave OpenAI para o chat de vendas automatizado. A chave é armazenada com segurança no servidor e nunca exposta ao navegador.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Provider selector */}
                <div className="space-y-2">
                  <Label>Provedor de IA Ativo</Label>
                  <Select value={form.aiProvider} onValueChange={v => set("aiProvider", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                      <SelectItem value="deepseek">DeepSeek — mais econômico</SelectItem>
                      <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">O provedor selecionado será usado no chat de vendas. Configure a chave correspondente abaixo.</p>
                </div>

                {/* OpenAI */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <span className={form.aiProvider === "openai" ? "text-primary" : "text-muted-foreground"}>OpenAI (GPT)</span>
                    {form.aiProvider === "openai" && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">ativo</span>}
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Chave de API</Label>
                    <MaskedInput value={form.openaiApiKey} onChange={v => set("openaiApiKey", v)} placeholder="sk-proj-..." />
                    <p className="text-xs text-muted-foreground">Obtenha em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Modelo</Label>
                    <Select value={form.openaiModel} onValueChange={v => set("openaiModel", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o-mini">gpt-4o-mini — Econômico (recomendado)</SelectItem>
                        <SelectItem value="gpt-4o">gpt-4o — Mais inteligente</SelectItem>
                        <SelectItem value="gpt-4.1-mini">gpt-4.1-mini — Nova geração econômica</SelectItem>
                        <SelectItem value="gpt-4.1">gpt-4.1 — Nova geração completa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Custo gpt-4o-mini: ~$0,15/1M tokens entrada · ~$0,60/1M saída</p>
                </div>

                {/* DeepSeek */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <span className={form.aiProvider === "deepseek" ? "text-primary" : "text-muted-foreground"}>DeepSeek</span>
                    {form.aiProvider === "deepseek" && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">ativo</span>}
                  </p>
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                    💰 <strong>Mais econômico</strong> — deepseek-chat custa ~$0,014/1M tokens entrada · ~$0,28/1M saída (≈10× mais barato que GPT-4o-mini)
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Chave de API</Label>
                    <MaskedInput value={form.deepseekApiKey} onChange={v => set("deepseekApiKey", v)} placeholder="sk-..." />
                    <p className="text-xs text-muted-foreground">Obtenha em <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="underline">platform.deepseek.com</a></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Modelo</Label>
                    <Select value={form.deepseekModel} onValueChange={v => set("deepseekModel", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deepseek-chat">deepseek-chat — Recomendado</SelectItem>
                        <SelectItem value="deepseek-reasoner">deepseek-reasoner — Raciocínio avançado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Claude */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <span className={form.aiProvider === "claude" ? "text-primary" : "text-muted-foreground"}>Claude (Anthropic)</span>
                    {form.aiProvider === "claude" && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">ativo</span>}
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Chave de API</Label>
                    <MaskedInput value={form.claudeApiKey} onChange={v => set("claudeApiKey", v)} placeholder="sk-ant-..." />
                    <p className="text-xs text-muted-foreground">Obtenha em <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Modelo</Label>
                    <Select value={form.claudeModel} onValueChange={v => set("claudeModel", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-3-5-haiku-20241022">claude-3-5-haiku — Rápido e econômico</SelectItem>
                        <SelectItem value="claude-3-5-sonnet-20241022">claude-3-5-sonnet — Mais inteligente</SelectItem>
                        <SelectItem value="claude-opus-4-5">claude-opus-4-5 — Máximo desempenho</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Custo haiku: ~$0,80/1M tokens entrada · ~$4/1M saída</p>
                </div>
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── DISCAGEM IA ─────────────────────────────────────────────────── */}
        <TabsContent value="discagem">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            {/* Twilio */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <CardTitle>Twilio — Voz</CardTitle>
                </div>
                <CardDescription>Credenciais para realizar chamadas outbound. Encontre em console.twilio.com.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Account SID</Label>
                  <MaskedInput value={form.twilioAccountSid} onChange={v => set("twilioAccountSid", v)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Auth Token</Label>
                  <MaskedInput value={form.twilioAuthToken} onChange={v => set("twilioAuthToken", v)} placeholder="Token secreto do Twilio" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Número de telefone Twilio</Label>
                  <Input value={form.twilioPhoneNumber} onChange={e => set("twilioPhoneNumber", e.target.value)} placeholder="+5511000000000" />
                  <p className="text-xs text-muted-foreground">Número comprado no Twilio com capacidade de voz (formato E.164).</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">URL pública da aplicação</Label>
                  <Input value={form.discagemPublicHostname} onChange={e => set("discagemPublicHostname", e.target.value)} placeholder="https://meusite.com.br" />
                  <p className="text-xs text-muted-foreground">O Twilio chama esta URL nos webhooks de voz. Deve ser acessível publicamente (não localhost).</p>
                </div>
              </CardContent>
            </Card>

            {/* TTS */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-primary" />
                  <CardTitle>Voz (TTS) — Prioridade e Fallback</CardTitle>
                </div>
                <CardDescription>
                  Se o primeiro provedor ficar sem crédito, o sistema usa o próximo automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs">Ordem de prioridade</Label>
                  <Select
                    value={form.discagemTtsFallback}
                    onValueChange={v => set("discagemTtsFallback", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='["cartesia","elevenlabs"]'>1º Cartesia → 2º ElevenLabs</SelectItem>
                      <SelectItem value='["elevenlabs","cartesia"]'>1º ElevenLabs → 2º Cartesia</SelectItem>
                      <SelectItem value='["cartesia"]'>Somente Cartesia</SelectItem>
                      <SelectItem value='["elevenlabs"]'>Somente ElevenLabs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Cartesia */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-semibold text-sm">Cartesia</p>
                  <div className="space-y-2">
                    <Label className="text-xs">Chave de API</Label>
                    <MaskedInput value={form.cartesiaApiKey} onChange={v => set("cartesiaApiKey", v)} placeholder="Cartesia API Key" />
                    <p className="text-xs text-muted-foreground"><a href="https://play.cartesia.ai/console" target="_blank" rel="noopener noreferrer" className="underline">play.cartesia.ai/console</a></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Voice ID padrão (fallback global)</Label>
                    <Input value={form.cartesiaVoiceId} onChange={e => set("cartesiaVoiceId", e.target.value)} placeholder="a0e99841-438c-4a64-b679-ae501e7d6091" />
                    <p className="text-xs text-muted-foreground">Usado apenas se o agente não tiver ID próprio. Encontre em <a href="https://play.cartesia.ai/voices" target="_blank" rel="noopener noreferrer" className="underline">play.cartesia.ai/voices</a></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Voice ID — Willian (Cartesia)</Label>
                      <Input value={(form as any).willianCartesiaVoiceId} onChange={e => set("willianCartesiaVoiceId", e.target.value)} placeholder="a0e99841-438c-4a64-b679-ae501e7d6091" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Voice ID — Aline (Cartesia)</Label>
                      <Input value={(form as any).alineCartesiaVoiceId} onChange={e => set("alineCartesiaVoiceId", e.target.value)} placeholder="694f9389-aac1-45b6-b726-9d9369183238" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">IDs por agente sobrescrevem o padrão global. Deixe em branco para usar o padrão.</p>
                </div>

                {/* ElevenLabs */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-semibold text-sm">ElevenLabs</p>
                  <div className="space-y-2">
                    <Label className="text-xs">Chave de API</Label>
                    <MaskedInput value={form.elevenlabsApiKey} onChange={v => set("elevenlabsApiKey", v)} placeholder="ElevenLabs API Key" />
                    <p className="text-xs text-muted-foreground"><a href="https://elevenlabs.io/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline">elevenlabs.io/settings/api-keys</a></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Voice ID padrão (fallback global)</Label>
                    <Input value={form.elevenlabsVoiceId} onChange={e => set("elevenlabsVoiceId", e.target.value)} placeholder="21m00Tcm4TlvDq8ikWAM" />
                    <p className="text-xs text-muted-foreground">Padrão: Rachel (multilíngue). <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="underline">Biblioteca de vozes</a></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Voice ID — Willian (ElevenLabs)</Label>
                      <Input value={(form as any).willianElevenlabsVoiceId} onChange={e => set("willianElevenlabsVoiceId", e.target.value)} placeholder="TxGEqnHWrfWFTfGW9XjX" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Voice ID — Aline (ElevenLabs)</Label>
                      <Input value={(form as any).alineElevenlabsVoiceId} onChange={e => set("alineElevenlabsVoiceId", e.target.value)} placeholder="21m00Tcm4TlvDq8ikWAM" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">IDs por agente sobrescrevem o padrão global. Deixe em branco para usar o padrão.</p>
                </div>
              </CardContent>
            </Card>

            {/* IA Fallback */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle>IA (Agente) — Prioridade e Fallback</CardTitle>
                </div>
                <CardDescription>
                  Se o primeiro modelo ficar sem crédito, o agente muda automaticamente para o próximo.
                  As chaves são configuradas na aba <strong>IA</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Ordem de prioridade</Label>
                  <Select
                    value={form.discagemAiFallback}
                    onValueChange={v => set("discagemAiFallback", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='["deepseek","claude","openai"]'>1º DeepSeek → 2º Claude → 3º GPT</SelectItem>
                      <SelectItem value='["claude","deepseek","openai"]'>1º Claude → 2º DeepSeek → 3º GPT</SelectItem>
                      <SelectItem value='["openai","claude","deepseek"]'>1º GPT → 2º Claude → 3º DeepSeek</SelectItem>
                      <SelectItem value='["deepseek","claude"]'>1º DeepSeek → 2º Claude</SelectItem>
                      <SelectItem value='["claude","openai"]'>1º Claude → 2º GPT</SelectItem>
                      <SelectItem value='["deepseek"]'>Somente DeepSeek</SelectItem>
                      <SelectItem value='["claude"]'>Somente Claude</SelectItem>
                      <SelectItem value='["openai"]'>Somente GPT</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Configure as chaves de API de cada modelo na aba <strong>IA</strong> acima.
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                  <p><strong>Como o fallback funciona:</strong></p>
                  <p>1. O agente tenta o 1º modelo da lista.</p>
                  <p>2. Se receber erro de crédito esgotado, muda para o 2º.</p>
                  <p>3. Se todos acabarem, a campanha é pausada com alerta na tela.</p>
                  <p>4. Assim que você recarregar os créditos, clique em <strong>Retomar</strong> — o sistema continua do ponto onde parou.</p>
                </div>
              </CardContent>
            </Card>

            {/* Deepgram */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-primary" />
                  <CardTitle>Deepgram — Transcrição STT</CardTitle>
                </div>
                <CardDescription>Usado para transcrição pós-chamada de alta qualidade. Opcional.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="text-xs">Chave de API</Label>
                  <MaskedInput value={form.deepgramApiKey} onChange={v => set("deepgramApiKey", v)} placeholder="Deepgram API Key" />
                  <p className="text-xs text-muted-foreground"><a href="https://console.deepgram.com/signup" target="_blank" rel="noopener noreferrer" className="underline">console.deepgram.com</a></p>
                </div>
              </CardContent>
            </Card>

            <SaveButton />
          </form>
        </TabsContent>

        {/* ── JITSI / REUNIÕES ─────────────────────────────────────────────── */}
        <TabsContent value="jitsi">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  <CardTitle>Jitsi — Reuniões on-line</CardTitle>
                </div>
                <CardDescription>
                  Configure o domínio de videoconferência. O App ID e o segredo habilitam links assinados, individuais e seguros nos convites.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Domínio Jitsi</Label>
                  <Input value={form.jitsiDomain} onChange={e => set("jitsiDomain", e.target.value)} placeholder="meet.lealcert.com.br" />
                  <p className="text-xs text-muted-foreground">Use somente o domínio, sem https://. O DNS, certificado HTTPS e servidor Jitsi devem estar configurados externamente.</p>
                </div>
                <div className="space-y-2">
                  <Label>App ID</Label>
                  <Input value={form.jitsiAppId} onChange={e => set("jitsiAppId", e.target.value)} placeholder="lealcert" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label>App Secret</Label>
                  <MaskedInput value={form.jitsiAppSecret} onChange={v => set("jitsiAppSecret", v)} placeholder="Segredo de assinatura JWT" autoComplete="new-password" />
                  <p className="text-xs text-muted-foreground">O segredo fica armazenado de forma protegida e nunca é enviado ao navegador.</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
                  <p className="font-semibold">Links de reunião</p>
                  <p>Com as três informações preenchidas, cada organizador e participante recebe um link Jitsi assinado. Sem App ID e segredo, a agenda ainda gera links diretos para o domínio informado.</p>
                </div>
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── IDENTIDADE ──────────────────────────────────────────────────── */}
        <TabsContent value="identidade">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <CardTitle>Identidade da Plataforma</CardTitle>
                </div>
                <CardDescription>Nome, logo e cores que aparecem para todos os usuários.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Nome + URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Plataforma</Label>
                    <Input value={form.appName} onChange={e => set("appName", e.target.value)} placeholder="LealCert" />
                    <p className="text-xs text-muted-foreground">Aparece no título do navegador e nos e-mails.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>URL do Site</Label>
                    <Input type="url" value={form.siteUrl} onChange={e => set("siteUrl", e.target.value)} placeholder="https://lealcert.com.br" />
                    <p className="text-xs text-muted-foreground">Usada em links nos e-mails e webhooks.</p>
                  </div>
                </div>

                {/* Logo */}
                <div className="space-y-2">
                  <Label>URL do Logotipo</Label>
                  <Input type="url" value={form.logoUrl} onChange={e => set("logoUrl", e.target.value)} placeholder="https://seusite.com.br/logo.png" />
                  <p className="text-xs text-muted-foreground">
                    Cole a URL pública da imagem do logotipo (PNG, SVG ou WebP). Recomendado: fundo transparente, pelo menos 300px de largura.
                  </p>
                  {form.logoUrl && (
                    <div className="mt-2 p-3 bg-muted rounded-lg inline-flex items-center gap-3">
                      <img
                        src={form.logoUrl}
                        alt="Pré-visualização do logo"
                        className="h-12 w-auto object-contain max-w-[160px]"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="text-xs text-muted-foreground">Pré-visualização</span>
                    </div>
                  )}
                </div>

                {/* Cor principal */}
                <div className="space-y-3">
                  <Label>Cor Principal</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={e => set("primaryColor", e.target.value)}
                      className="h-10 w-14 rounded-md border border-input cursor-pointer bg-transparent p-0.5"
                    />
                    <Input
                      value={form.primaryColor}
                      onChange={e => set("primaryColor", e.target.value)}
                      placeholder="#2563eb"
                      className="w-32 font-mono text-sm"
                      maxLength={7}
                    />
                    <div
                      className="h-10 w-10 rounded-md border border-input shrink-0"
                      style={{ background: form.primaryColor }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Aplicada em botões, links, badges e ícones. Exemplos de combinações:</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        onClick={() => set("primaryColor", c.value)}
                        className={`h-8 w-8 rounded-full border-2 transition-all ${form.primaryColor === c.value ? "border-foreground scale-110 shadow" : "border-transparent hover:scale-105"}`}
                        style={{ background: c.value }}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── CONTATO ─────────────────────────────────────────────────────── */}
        <TabsContent value="contato">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <CardTitle>Fale Conosco</CardTitle>
                </div>
                <CardDescription>
                  Informações de contato exibidas na página de login e em e-mails enviados aos clientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone / Fixo</Label>
                    <Input value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="(11) 3000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input value={form.contactWhatsapp} onChange={e => set("contactWhatsapp", e.target.value)} placeholder="(11) 99999-0000" />
                    <p className="text-xs text-muted-foreground">Número com DDD, sem formatação especial.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail de Suporte</Label>
                  <Input type="email" value={form.contactEmailSupport} onChange={e => set("contactEmailSupport", e.target.value)} placeholder="suporte@seusite.com.br" />
                  <p className="text-xs text-muted-foreground">Mostrado na página de login e em rodapés de e-mail.</p>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={form.contactAddress} onChange={e => set("contactAddress", e.target.value)} placeholder="Rua Exemplo, 123 — Bairro, Cidade/UF" />
                  <p className="text-xs text-muted-foreground">Endereço físico da AR, opcional.</p>
                </div>
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── E-MAIL ──────────────────────────────────────────────────────── */}
        <TabsContent value="email">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <CardTitle>Configurações de E-mail</CardTitle>
                </div>
                <CardDescription>
                  Configure o servidor SMTP para que os e-mails saiam pelo domínio do seu cliente.
                  Quando preenchido aqui, substitui as variáveis de ambiente do servidor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Servidor SMTP (Host)</Label>
                    <Input value={form.smtpHostDb} onChange={e => set("smtpHostDb", e.target.value)} placeholder="smtp.seudominio.com.br" />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta</Label>
                    <Select value={form.smtpPortDb} onValueChange={v => set("smtpPortDb", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="587">587 — STARTTLS (recomendado)</SelectItem>
                        <SelectItem value="465">465 — SSL/TLS</SelectItem>
                        <SelectItem value="25">25 — Sem criptografia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usuário SMTP</Label>
                    <Input value={form.smtpUserDb} onChange={e => set("smtpUserDb", e.target.value)} placeholder="naoresponda@seudominio.com.br" autoComplete="off" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha SMTP</Label>
                    <MaskedInput value={form.smtpPassDb} onChange={v => set("smtpPassDb", v)} placeholder="Senha do servidor de e-mail" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail remetente (From)</Label>
                  <Input value={form.mailFrom} onChange={e => set("mailFrom", e.target.value)} placeholder='Nome AR <naoresponda@seudominio.com.br>' />
                  <p className="text-xs text-muted-foreground">Formato: <code>Nome Exibido &lt;email@dominio.com&gt;</code></p>
                </div>

                {/* Test Email */}
                <div className="flex items-end gap-2 pt-2">
                  <div className="space-y-2 flex-1">
                    <Label>Testar envio</Label>
                    <Input value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} placeholder="seu@email.com" type="email" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testEmailMutation.isPending || !testEmailTo || !form.smtpHostDb}
                    onClick={() => testEmailMutation.mutate({ data: { to: testEmailTo } })}
                  >
                    {testEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />Enviar teste</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Marketing SMTP Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  <CardTitle>E-mail de Marketing</CardTitle>
                </div>
                <CardDescription>
                  Configure um servidor SMTP exclusivo para campanhas de marketing. Se deixado em branco, usa o SMTP principal acima.
                  Use um subdomínio dedicado (ex: <code>mkt.lealcert.com.br</code>) para proteger a reputação do domínio principal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Servidor SMTP — Marketing (Host)</Label>
                    <Input value={form.mktSmtpHostDb} onChange={e => set("mktSmtpHostDb", e.target.value)} placeholder="smtp.mkt.seudominio.com.br" />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta</Label>
                    <Select value={form.mktSmtpPortDb} onValueChange={v => set("mktSmtpPortDb", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="587">587 — STARTTLS (recomendado)</SelectItem>
                        <SelectItem value="465">465 — SSL/TLS</SelectItem>
                        <SelectItem value="25">25 — Sem criptografia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usuário SMTP — Marketing</Label>
                    <Input value={form.mktSmtpUserDb} onChange={e => set("mktSmtpUserDb", e.target.value)} placeholder="mkt@seudominio.com.br" autoComplete="off" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha SMTP — Marketing</Label>
                    <MaskedInput value={form.mktSmtpPassDb} onChange={v => set("mktSmtpPassDb", v)} placeholder="Senha do servidor de marketing" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail remetente de Marketing (From)</Label>
                  <Input value={form.mktMailFrom} onChange={e => set("mktMailFrom", e.target.value)} placeholder='LealCert Marketing <mkt@seudominio.com.br>' />
                  <p className="text-xs text-muted-foreground">Formato: <code>Nome Exibido &lt;email@dominio.com&gt;</code></p>
                </div>
                {form.mktSmtpHostDb && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    Campanhas de marketing e respostas serão enviadas pelo servidor de marketing configurado acima.
                  </div>
                )}
                <div className="border-t pt-4 space-y-2">
                  <Label className="flex items-center gap-1.5">
                    ZeroBounce — API Key
                    <span className="text-xs font-normal text-muted-foreground">(validação de e-mails)</span>
                  </Label>
                  <MaskedInput value={form.zeroBounceApiKey} onChange={v => set("zeroBounceApiKey", v)} placeholder="Chave da API ZeroBounce" />
                  <p className="text-xs text-muted-foreground">
                    Quando configurada, a validação de contatos usa ZeroBounce para verificar cada e-mail com precisão.
                    Sem a chave, usa apenas verificação MX local.
                  </p>
                  {form.zeroBounceApiKey && form.zeroBounceApiKey !== "***" && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      ZeroBounce ativo — validação profissional habilitada.
                    </div>
                  )}
                  {form.zeroBounceApiKey === "***" && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      ZeroBounce ativo — chave salva.
                    </div>
                  )}
                </div>

                {/* Resend */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        Resend — API de envio
                        <span className="text-xs font-normal text-muted-foreground">(alternativa ao SMTP)</span>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quando ativado, os e-mails de marketing saem pelo <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-primary underline">Resend</a> em vez do servidor SMTP. O SMTP acima continua sendo usado para e-mails transacionais.
                      </p>
                    </div>
                    <Select value={form.mktUseResend} onValueChange={v => set("mktUseResend", v)}>
                      <SelectTrigger className="w-[130px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">SMTP próprio</SelectItem>
                        <SelectItem value="1">🚀 Resend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.mktUseResend === "1" && (
                    <div className="space-y-2">
                      <Label>Chave de API Resend</Label>
                      <MaskedInput value={form.resendApiKey} onChange={v => set("resendApiKey", v)} placeholder="re_xxxxxxxxxxxxxxxxxxxx" />
                      <p className="text-xs text-muted-foreground">
                        Obtenha sua chave em <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">resend.com/api-keys</a>. O remetente precisa estar configurado e verificado no Resend.
                      </p>
                    </div>
                  )}
                  {form.mktUseResend === "1" && (form.resendApiKey === "***" || (form.resendApiKey && form.resendApiKey !== "***")) && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Resend ativado — campanhas de marketing serão enviadas via API Resend.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* DNS Records Card */}
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-base text-amber-900">Registros DNS — Guia para o cliente</CardTitle>
                <CardDescription className="text-amber-700">
                  Para que os e-mails enviados pelo domínio <strong>{emailDomain}</strong> não caiam no spam,
                  o cliente precisa adicionar estes registros no painel DNS do seu provedor (Registro.br, Cloudflare, etc.):
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* SPF */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">TXT</span>
                    <span className="text-sm font-semibold">SPF — Autorizar envios</span>
                  </div>
                  <div className="bg-white border rounded p-3 font-mono text-xs space-y-1">
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Nome:</span><code className="text-foreground">@</code>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Valor:</span><code className="text-foreground select-all">v=spf1 include:{form.smtpHostDb || "smtp.seudominio.com.br"} ~all</code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Se já existe um registro SPF, apenas adicione <code>include:{form.smtpHostDb || "smtp.seudominio.com.br"}</code> antes do <code>~all</code>.</p>
                </div>

                {/* DKIM */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">TXT</span>
                    <span className="text-sm font-semibold">DKIM — Assinatura digital</span>
                  </div>
                  <div className="bg-white border rounded p-3 font-mono text-xs space-y-1">
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Nome:</span><code className="text-foreground">mail._domainkey.{emailDomain}</code>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Valor:</span><code className="text-foreground">v=DKIM1; k=rsa; p=<em>[chave pública gerada no seu servidor SMTP]</em></code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">A chave DKIM é gerada pelo servidor SMTP. Consulte a documentação do provedor de e-mail utilizado (Mailgun, SendGrid, Brevo, Zoho, etc.).</p>
                </div>

                {/* DMARC */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">TXT</span>
                    <span className="text-sm font-semibold">DMARC — Política de rejeição</span>
                  </div>
                  <div className="bg-white border rounded p-3 font-mono text-xs space-y-1">
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Nome:</span><code className="text-foreground">_dmarc.{emailDomain}</code>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-muted-foreground">
                      <span>Valor:</span><code className="text-foreground select-all">v=DMARC1; p=none; rua=mailto:dmarc@{emailDomain}</code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Comece com <code>p=none</code> para monitorar. Após confirmar que tudo funciona, mude para <code>p=quarantine</code> ou <code>p=reject</code>.</p>
                </div>
              </CardContent>
            </Card>

            <SaveButton />
          </form>
        </TabsContent>

        {/* ── CERTIFICADO ─────────────────────────────────────────────────── */}
        <TabsContent value="certificado">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ToggleRight className="h-5 w-5 text-primary" />
                  <CardTitle>Provedor Ativo de Certificação</CardTitle>
                </div>
                <CardDescription>Selecione qual sistema será usado para emissão e gestão de certificados digitais. Apenas um pode estar ativo por vez.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => setActiveProvider("gestaoar")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${isGarActive ? "border-primary bg-primary/10 shadow-sm" : "border-muted bg-background hover:border-muted-foreground/40"}`}>
                    <Link2 className={`h-7 w-7 ${isGarActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-semibold text-sm">Gestão AR</span>
                    <ProviderBadge active={isGarActive} />
                  </button>
                  <button type="button" onClick={() => setActiveProvider("safeweb")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${isSwActive ? "border-primary bg-primary/10 shadow-sm" : "border-muted bg-background hover:border-muted-foreground/40"}`}>
                    <ShieldCheck className={`h-7 w-7 ${isSwActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-semibold text-sm">Safeweb</span>
                    <ProviderBadge active={isSwActive} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {isGarActive && (
              <Card className="ring-2 ring-primary/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /><CardTitle>Gestão AR — Integração</CardTitle></div>
                    <ProviderBadge active />
                  </div>
                  <CardDescription>Credenciais para integração com a plataforma Gestão AR. Acesse <a href="https://gestaoar.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">gestaoar.com.br</a>.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>API Key</Label><MaskedInput value={form.garApiKey} onChange={v => set("garApiKey", v)} placeholder="Chave de API fornecida pela Gestão AR" /></div>
                  <div className="space-y-2"><Label>CNPJ da AR (Documento)</Label><Input value={form.garDocumento ?? ""} onChange={e => set("garDocumento", e.target.value)} placeholder="Ex: 62233985000152" /></div>
                  <div className="space-y-2"><Label>Hash do Vendedor (AR)</Label><Input value={form.garHashVendedor} onChange={e => set("garHashVendedor", e.target.value)} placeholder="Hash da AR — usado para importar catálogo" /></div>
                  <div className="space-y-2">
                    <Label>Hash do Parceiro (Relatório)</Label>
                    <Input value={form.garHashParceiro} onChange={e => set("garHashParceiro", e.target.value)} placeholder="Hash do parceiro — usado no Relatório GAR" />
                    <p className="text-xs text-muted-foreground">Hash específico do parceiro para filtrar apenas os pedidos dele no relatório. Se vazio, usa o Hash do Vendedor.</p>
                  </div>
                  <div className="space-y-2"><Label>Hash da Tabela de Preços</Label><Input value={form.garHashTabela} onChange={e => set("garHashTabela", e.target.value)} placeholder="Hash da tabela configurada no GAR" /></div>
                  <div className="space-y-2">
                    <Label>Forma de Pagamento Padrão</Label>
                    <Select value={form.garFormaPagamento} onValueChange={v => set("garFormaPagamento", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {garFormasPagamento && garFormasPagamento.length > 0
                          ? garFormasPagamento.map(fp => (
                              <SelectItem key={fp.Id} value={String(fp.Id)}>{fp.Id} — {fp.Nome}</SelectItem>
                            ))
                          : (
                              <>
                                <SelectItem value="8">8 — Boleto Bancário</SelectItem>
                                <SelectItem value="9">9 — Cartão Crédito</SelectItem>
                                <SelectItem value="19">19 — Pix</SelectItem>
                              </>
                            )
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Preferir Videoconferência</Label>
                    <Select value={form.garPreferirVideoconferencia} onValueChange={v => set("garPreferirVideoconferencia", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Sim — priorizar videoconferência</SelectItem>
                        <SelectItem value="0">Não — usar locais presenciais</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {isSwActive && (
              <Card className="ring-2 ring-primary/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><CardTitle>Safeweb — Integração</CardTitle></div>
                    <ProviderBadge active />
                  </div>
                  <CardDescription>Credenciais para integração com a API Safeweb (Identificador e Segredo são fornecidos pela Safeweb). Documentação: <a href="https://developers.safewebpss.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">Produção</a> · <a href="https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safewebpss/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Homologação</a></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ambiente ativo</Label>
                    <Select value={form.safewebAmbiente} onValueChange={v => set("safewebAmbiente", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="producao">Produção</SelectItem>
                        <SelectItem value="homologacao">Homologação</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Define qual ambiente será usado nas emissões de certificados.</p>
                  </div>

                  {form.safewebAmbiente === "producao" ? (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <p className="text-sm font-medium text-foreground">Credenciais — Produção</p>
                      <div className="space-y-2">
                        <Label>URL Base</Label>
                        <Input value={form.safewebUrl} onChange={e => set("safewebUrl", e.target.value)} placeholder="https://pss.safewebpss.com.br" />
                        <p className="text-xs text-muted-foreground">Padrão: <code className="text-primary">https://pss.safewebpss.com.br</code></p>
                      </div>
                      <div className="space-y-2">
                        <Label>Identificador</Label>
                        <Input value={form.safewebUsername} onChange={e => set("safewebUsername", e.target.value)} placeholder="Identificador fornecido pela Safeweb" autoComplete="off" />
                      </div>
                      <div className="space-y-2">
                        <Label>Segredo</Label>
                        <MaskedInput value={form.safewebPassword} onChange={v => set("safewebPassword", v)} placeholder="Segredo fornecido pela Safeweb" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Credenciais — Homologação</p>
                      <div className="space-y-2">
                        <Label>URL Base</Label>
                        <Input value={form.safewebUrlHomologacao} onChange={e => set("safewebUrlHomologacao", e.target.value)} placeholder="https://h-pss.safewebpss.com.br" />
                        <p className="text-xs text-muted-foreground">Padrão: <code className="text-primary">https://h-pss.safewebpss.com.br</code></p>
                      </div>
                      <div className="space-y-2">
                        <Label>Identificador</Label>
                        <Input value={form.safewebUsernameHomologacao} onChange={e => set("safewebUsernameHomologacao", e.target.value)} placeholder="Identificador de homologação" autoComplete="off" />
                      </div>
                      <div className="space-y-2">
                        <Label>Segredo</Label>
                        <MaskedInput value={form.safewebPasswordHomologacao} onChange={v => set("safewebPasswordHomologacao", v)} placeholder="Segredo de homologação" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>CNPJ da AR <span className="text-muted-foreground font-normal text-xs">(fornecido pela Safeweb no onboarding)</span></Label>
                    <Input value={form.safewebCnpjAr} onChange={e => set("safewebCnpjAr", e.target.value)} placeholder="00000000000000" />
                    <p className="text-xs text-muted-foreground">Necessário para listar produtos e criar solicitações. Não é obrigatório para testar a conexão.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Código do Parceiro <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                    <Input value={form.safewebCodigoParceiro} onChange={e => set("safewebCodigoParceiro", e.target.value)} placeholder="Se fornecido pela Safeweb" />
                    <p className="text-xs text-muted-foreground">Incluso nas solicitações apenas se preenchido. Deixe em branco se não tiver sido fornecido.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm"
                    disabled={
                      testingAuth ||
                      !(form.safewebAmbiente === "homologacao" ? form.safewebUrlHomologacao : form.safewebUrl) ||
                      !(form.safewebAmbiente === "homologacao" ? form.safewebUsernameHomologacao : form.safewebUsername) ||
                      !(form.safewebAmbiente === "homologacao" ? form.safewebPasswordHomologacao : form.safewebPassword)
                    }
                    onClick={testSafewebAuth}>
                    {testingAuth ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testando...</> : `Testar Conexão (${form.safewebAmbiente === "homologacao" ? "Homologação" : "Produção"})`}
                  </Button>
                </CardContent>
              </Card>
            )}
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── PAGAMENTO ───────────────────────────────────────────────────── */}
        <TabsContent value="pagamento">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /><CardTitle>MercadoPago</CardTitle></div>
                <CardDescription>Credenciais para processamento de pagamentos. Acesse <a href="https://www.mercadopago.com.br/developers/pt/docs" target="_blank" rel="noopener noreferrer" className="text-primary underline">mercadopago.com.br/developers</a>.</CardDescription>
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
                    Configure o webhook no painel do MercadoPago para:{" "}
                    <code className="bg-muted px-1 rounded text-xs">{form.siteUrl || "[siteUrl]"}/api/mp/webhook</code>
                  </p>
                </div>
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── WHATSAPP ────────────────────────────────────────────────────── */}
        <TabsContent value="whatsapp">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            {/* Instância de notificações */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <CardTitle>WhatsApp — Notificações</CardTitle>
                </div>
                <CardDescription>
                  Instância exclusiva para notificações transacionais: confirmação de pagamento, agendamento, status de pedido, etc.
                  Configure em <a href="https://evolution-api.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">evolution-api.com</a>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL da Evolution API</Label>
                  <Input value={form.evolutionUrl} onChange={e => set("evolutionUrl", e.target.value)} placeholder="https://evolution.seudominio.com.br" />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <MaskedInput value={form.evolutionApiKey} onChange={v => set("evolutionApiKey", v)} placeholder="Chave de autenticação da API" />
                </div>
                <div className="space-y-2">
                  <Label>Nome da Instância</Label>
                  <Input value={form.evolutionInstance} onChange={e => set("evolutionInstance", e.target.value)} placeholder="lealcert-notif" />
                </div>
              </CardContent>
            </Card>

            {/* Instância de marketing */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-amber-500" />
                  <CardTitle>WhatsApp — Marketing</CardTitle>
                </div>
                <CardDescription>
                  Instância dedicada exclusivamente para campanhas de marketing (página Campanhas WhatsApp).
                  Use um número diferente do de notificações para proteger a reputação do número principal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL da Evolution API</Label>
                  <Input value={form.evolutionMktUrl} onChange={e => set("evolutionMktUrl", e.target.value)} placeholder="https://evolution.seudominio.com.br" />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <MaskedInput value={form.evolutionMktApiKey} onChange={v => set("evolutionMktApiKey", v)} placeholder="Chave de autenticação da API" />
                </div>
                <div className="space-y-2">
                  <Label>Nome da Instância</Label>
                  <Input value={form.evolutionMktInstance} onChange={e => set("evolutionMktInstance", e.target.value)} placeholder="lealcert-marketing" />
                </div>
                {form.evolutionMktInstance && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    Instância de marketing configurada — campanhas WhatsApp usarão este número.
                  </div>
                )}
              </CardContent>
            </Card>
            <SaveButton />
          </form>
        </TabsContent>

        {/* ── NOTIFICAÇÕES ────────────────────────────────────────────────── */}
        <TabsContent value="notificacoes">
          <div className="space-y-6 max-w-2xl">
            {/* VAPID Keys form */}
            <form onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <CardTitle>Web Push — Chaves VAPID</CardTitle>
                  </div>
                  <CardDescription>
                    Credenciais VAPID para envio de notificações push quando o app está instalado no celular ou computador do cliente.
                    Cada instalação (cliente) deve ter suas próprias chaves.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject (contato)</Label>
                    <Input value={form.vapidSubject} onChange={e => set("vapidSubject", e.target.value)} placeholder="mailto:contato@seudominio.com.br" />
                    <p className="text-xs text-muted-foreground">Endereço de e-mail ou URL para contato sobre este servidor VAPID.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave Pública (Public Key)</Label>
                    <Input
                      value={form.vapidPublicKey}
                      onChange={e => set("vapidPublicKey", e.target.value)}
                      placeholder="BO--ilvprE2wgaeL..."
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">Chave pública VAPID — usada no frontend para criar a inscrição push.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave Privada (Private Key)</Label>
                    <MaskedInput
                      value={form.vapidPrivateKey}
                      onChange={v => set("vapidPrivateKey", v)}
                      placeholder="asu5usN0r9cxl..."
                    />
                    <p className="text-xs text-muted-foreground">Chave privada VAPID — mantida em segredo no servidor, nunca exposta ao cliente.</p>
                  </div>

                  <div className="rounded-lg bg-muted/50 border p-4 text-sm space-y-2">
                    <p className="font-semibold text-sm">Como gerar novas chaves VAPID</p>
                    <p className="text-muted-foreground text-xs">Execute no terminal do servidor:</p>
                    <code className="block bg-background border rounded p-2 text-xs font-mono select-all">
                      npx web-push generate-vapid-keys
                    </code>
                    <p className="text-xs text-muted-foreground">
                      Cole as chaves geradas nos campos acima. Cada cliente AR deve ter seu próprio par de chaves.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Button type="submit" disabled={update.isPending} size="lg" className="mt-4">
                {update.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Chaves VAPID"}
              </Button>
            </form>

            {/* Push permission + test */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Testar Notificações neste Dispositivo</CardTitle>
                <CardDescription>
                  Ative as notificações neste navegador/app e envie uma mensagem de teste para verificar se tudo está funcionando.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!push.supported && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    ⚠️ Este navegador não suporta notificações push. Tente no Chrome, Edge ou Safari (iOS 16.4+).
                  </div>
                )}
                {push.supported && (
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      {push.subscribed
                        ? <Bell className="h-5 w-5 text-emerald-600" />
                        : <BellOff className="h-5 w-5 text-muted-foreground" />
                      }
                      <div>
                        <p className="font-medium text-sm">
                          {push.subscribed ? "Notificações ativas neste dispositivo" : "Notificações desativadas"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {push.permission === "denied"
                            ? "Permissão bloqueada pelo navegador. Altere nas configurações do site."
                            : push.subscribed
                            ? "Você receberá alertas mesmo com o app fechado."
                            : "Clique para ativar e receber alertas de pagamento."}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={push.subscribed ? "outline" : "default"}
                      size="sm"
                      disabled={push.loading || push.permission === "denied"}
                      onClick={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
                    >
                      {push.loading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : push.subscribed ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                )}
                {push.error && (
                  <p className="text-sm text-destructive">{push.error}</p>
                )}
                {push.subscribed && form.vapidPublicKey && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testPushMutation.isPending}
                    onClick={() => testPushMutation.mutate({ data: { title: "Teste LealCert 🔔", body: "Notificações push estão funcionando corretamente!" } })}
                  >
                    {testPushMutation.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                      : <><Send className="h-4 w-4 mr-2" />Enviar notificação de teste</>}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="text-base text-blue-900">Como funciona</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-800 space-y-2">
                <div className="flex gap-2"><span className="font-bold shrink-0">1.</span><span>O cliente instala o app (botão "Adicionar à tela inicial" no celular) e aceita as notificações.</span></div>
                <div className="flex gap-2"><span className="font-bold shrink-0">2.</span><span>Quando o pagamento é confirmado no MercadoPago, o sistema dispara automaticamente uma notificação push para o celular do cliente.</span></div>
                <div className="flex gap-2"><span className="font-bold shrink-0">3.</span><span>O cliente toca na notificação e é levado diretamente para o pedido no app.</span></div>
                <div className="flex gap-2"><span className="font-bold shrink-0">4.</span><span>Para personalizar com as chaves do seu cliente AR, gere um novo par VAPID e salve acima.</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── NFS-e ──────────────────────────────────────────────────────── */}
        <TabsContent value="nfse" className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Ambiente e modo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-5 w-5 text-primary" />
                  Nota Fiscal de Serviço (NFS-e) — BrasilNFe
                </CardTitle>
                <CardDescription>
                  Configure a emissão de NFS-e via <a href="https://brasilnfe.com.br" target="_blank" rel="noreferrer" className="text-primary underline">BrasilNFe API</a>. Crie sua conta lá para obter os tokens de acesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ambiente ativo</Label>
                    <Select value={form.nfseAmbiente} onValueChange={v => set("nfseAmbiente", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homologacao">🟡 Homologação (testes)</SelectItem>
                        <SelectItem value="producao">🟢 Produção</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Homologação é gratuita e ilimitada para testes.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Modo de emissão</Label>
                    <Select value={form.nfseAutoEmit} onValueChange={v => set("nfseAutoEmit", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Manual — emitir por pedido</SelectItem>
                        <SelectItem value="1">Automático — ao mudar status para "Emitido"</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">No modo manual, cada pedido terá um botão "Emitir NFS-e".</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tokens */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tokens de API</CardTitle>
                <CardDescription>Gere os tokens no painel do BrasilNFe em Configurações → API.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Token de Homologação</Label>
                  <MaskedInput value={form.nfseTokenTest} onChange={v => set("nfseTokenTest", v)} placeholder="Token de teste..." />
                </div>
                <div className="space-y-2">
                  <Label>Token de Produção</Label>
                  <MaskedInput value={form.nfseTokenProd} onChange={v => set("nfseTokenProd", v)} placeholder="Token de produção..." />
                </div>
              </CardContent>
            </Card>

            {/* Dados do prestador */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados da Empresa (Prestador)</CardTitle>
                <CardDescription>Informações do seu CNPJ que aparecerão nas notas emitidas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CNPJ do Prestador</Label>
                    <Input value={form.nfsePrestadorCnpj} onChange={e => set("nfsePrestadorCnpj", e.target.value)} placeholder="00.000.000/0001-00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Inscrição Municipal</Label>
                    <Input value={form.nfsePrestadorIm} onChange={e => set("nfsePrestadorIm", e.target.value)} placeholder="123456" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dados do serviço */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados do Serviço</CardTitle>
                <CardDescription>Defina como o serviço aparecerá na nota fiscal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código do Serviço (LC 116)</Label>
                    <Input value={form.nfseServicoCodigo} onChange={e => set("nfseServicoCodigo", e.target.value)} placeholder="1.09" />
                    <p className="text-xs text-muted-foreground">Ex: 1.09 (Disponibilização de sistemas e banco de dados). Consulte a tabela LC 116 do seu município.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Alíquota ISS (%)</Label>
                    <Input value={form.nfseServicoAliquota} onChange={e => set("nfseServicoAliquota", e.target.value)} placeholder="2" type="number" step="0.01" min="0" max="5" />
                    <p className="text-xs text-muted-foreground">Alíquota cobrada pelo seu município.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discriminação do Serviço (fallback)</Label>
                  <Input value={form.nfseDiscriminacao} onChange={e => set("nfseDiscriminacao", e.target.value)} placeholder="Emissão de Certificado Digital" />
                  <p className="text-xs text-muted-foreground">
                    <strong>Preenchido automaticamente</strong> com o nome do produto do pedido (ex: "e-CPF 12 meses"). Este texto só é usado se o pedido não tiver produto identificado.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>ISS Retido na Fonte</Label>
                  <Select value={form.nfseIssRetido} onValueChange={v => set("nfseIssRetido", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Não retido (padrão)</SelectItem>
                      <SelectItem value="1">Retido na fonte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar configurações NFS-e
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
