import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useListCertificates, useCreateOrder, useConsultaPrevia, getCnpjLookupQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Search, MapPin, Upload, FileText, X, Info, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
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

function maskCepFn(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
  return d;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
export default function NewOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: certificates } = useListCertificates({ activeOnly: true });

  function certPrice(c: NonNullable<typeof certificates>[number]) {
    if (user?.userType === "contador" && c.priceContador != null) return c.priceContador;
    return c.price;
  }

  const [form, setForm] = useState({
    certificateId: "",
    clientType: "cpf",
    customerName: "",
    customerCpfCnpj: "",
    customerEmail: "",
    customerPhone: "",
    customerBirthDate: "",
    companyName: "",
    inssNumber: "",
    extendedWarranty: false,
    addressZipcode: "",
    addressStreet: "",
    addressNumber: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    repName: "",
    repBirthDate: "",
    repCpf: "",
  });

  type PsbioStatus = null | "loading" | { hasPsbio: boolean; mensagem: string; requiresPresencial: boolean };
  const [psbioStatus, setPsbioStatus] = useState<PsbioStatus>(null);
  const [cnpjToQuery, setCnpjToQuery] = useState("");
  const [autoFilledCustomerName, setAutoFilledCustomerName] = useState(false);
  const [autoFilledRepName, setAutoFilledRepName] = useState(false);
  const psbioContextRef = useRef<"customer" | "rep">("customer");

  const [warrantyInfoOpen, setWarrantyInfoOpen] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFilled, setCepFilled] = useState(false);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhUploading, setCnhUploading] = useState(false);
  const [cnhKey, setCnhKey] = useState<string | null>(null);
  const cnhInputRef = useRef<HTMLInputElement>(null);
  const [cartaoFile, setCartaoFile] = useState<File | null>(null);
  const [cartaoUploading, setCartaoUploading] = useState(false);
  const [cartaoKey, setCartaoKey] = useState<string | null>(null);
  const cartaoInputRef = useRef<HTMLInputElement>(null);
  const [fichaFile, setFichaFile] = useState<File | null>(null);
  const [fichaUploading, setFichaUploading] = useState(false);
  const [fichaKey, setFichaKey] = useState<string | null>(null);
  const fichaInputRef = useRef<HTMLInputElement>(null);

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Pedido criado!", description: `Pedido ${data.orderNumber} criado com sucesso.` });
        setLocation(`/orders/${data.id}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao criar pedido.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const checkPsbio = useConsultaPrevia({
    mutation: {
      onSuccess: (data) => {
        setPsbioStatus({ hasPsbio: data.hasPsbio, mensagem: data.mensagem, requiresPresencial: data.requiresPresencial });
        if (data.customerName) {
          if (psbioContextRef.current === "rep") {
            setForm(prev => ({ ...prev, repName: prev.repName || data.customerName! }));
            setAutoFilledRepName(true);
          } else {
            setForm(prev => ({ ...prev, customerName: prev.customerName || data.customerName! }));
            setAutoFilledCustomerName(true);
          }
        }
      },
      onError: () => {
        setPsbioStatus(null);
      },
    },
  });

  const { data: cnpjData, isFetching: cnpjFetching, isError: cnpjError } = useQuery({
    ...getCnpjLookupQueryOptions({ cnpj: cnpjToQuery }),
    enabled: cnpjToQuery.length === 14,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!cnpjData) return;
    const cepMasked = cnpjData.cep ? maskCepFn(cnpjData.cep.replace(/\D/g, "")) : "";
    setForm(prev => ({
      ...prev,
      companyName: prev.companyName || cnpjData.razaoSocial,
      customerName: prev.customerName || cnpjData.razaoSocial,
      ...(cepMasked ? { addressZipcode: cepMasked } : {}),
      ...(cnpjData.logradouro ? { addressStreet: cnpjData.logradouro } : {}),
      ...(cnpjData.numero ? { addressNumber: cnpjData.numero } : {}),
      ...(cnpjData.bairro ? { addressNeighborhood: cnpjData.bairro } : {}),
      ...(cnpjData.municipio ? { addressCity: cnpjData.municipio } : {}),
      ...(cnpjData.uf ? { addressState: cnpjData.uf } : {}),
    }));
    if (cnpjData.razaoSocial) setAutoFilledCustomerName(true);
    if (cnpjData.logradouro || cnpjData.cep) setCepFilled(true);
  }, [cnpjData]);

  const triggerPsbioCheck = useCallback((cpfCnpj: string, birthDate: string, clientType: string, repCpf?: string, repBirthDate?: string) => {
    const digits = cpfCnpj.replace(/\D/g, "");
    const isCpf = clientType === "cpf" && digits.length === 11;
    const isCnpj = clientType === "cnpj" && digits.length === 14;

    if (isCpf && birthDate) {
      psbioContextRef.current = "customer";
      setPsbioStatus("loading");
      checkPsbio.mutate({ data: { cpf: digits, dataNascimento: birthDate } });
    } else if (isCnpj && repCpf && repBirthDate) {
      const repDigits = repCpf.replace(/\D/g, "");
      if (repDigits.length === 11) {
        psbioContextRef.current = "rep";
        setPsbioStatus("loading");
        checkPsbio.mutate({ data: { cnpj: digits, cpfResponsavel: repDigits, dataNascimento: repBirthDate } });
      }
    } else {
      setPsbioStatus(null);
    }
  }, [checkPsbio]);

  const selectedCert = certificates?.find(c => String(c.id) === form.certificateId);
  const total = (selectedCert ? certPrice(selectedCert) : 0) + (form.extendedWarranty ? 15 : 0);

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function maskCep(v: string) { return maskCepFn(v); }

  async function fetchCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) { if (cepFilled) setCepFilled(false); return; }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          addressStreet: data.logradouro || prev.addressStreet,
          addressNeighborhood: data.bairro || prev.addressNeighborhood,
          addressCity: data.localidade || prev.addressCity,
          addressState: data.uf || prev.addressState,
        }));
        setCepFilled(true);
        toast({ title: "CEP encontrado!", description: `${data.localidade} — ${data.uf}` });
      } else {
        setCepFilled(false);
        toast({ title: "CEP não encontrado", description: "Verifique o CEP e preencha o endereço manualmente.", variant: "destructive" });
      }
    } catch (_) {
      setCepFilled(false);
      toast({ title: "Erro ao buscar CEP", description: "Verifique sua conexão.", variant: "destructive" });
    }
    setCepLoading(false);
  }

  async function uploadDoc(
    file: File,
    tipo: "cnh" | "cartao-cnpj" | "ficha-cadastral",
    setUploading: (v: boolean) => void,
    setKey: (k: string) => void,
    label: string,
  ): Promise<string | null> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/upload/${tipo}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload falhou");
      const json = await res.json() as { key: string; url: string };
      setKey(json.key);
      toast({ title: `${label} enviado com sucesso!` });
      return json.key;
    } catch {
      toast({ title: `Erro ao enviar ${label}`, description: "Tente novamente.", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certificateId) {
      toast({ title: "Atenção", description: "Selecione um modelo de certificado.", variant: "destructive" });
      return;
    }
    if (!form.customerEmail) {
      toast({ title: "Atenção", description: "E-mail é obrigatório.", variant: "destructive" });
      return;
    }
    if (!form.customerPhone) {
      toast({ title: "Atenção", description: "Telefone é obrigatório.", variant: "destructive" });
      return;
    }
    if (!cnhFile && !cnhKey) {
      toast({ title: "Atenção", description: "Envie uma foto ou cópia da CNH / RG.", variant: "destructive" });
      return;
    }
    if (form.clientType === "cnpj") {
      if (!cartaoFile && !cartaoKey) {
        toast({ title: "Atenção", description: "Envie o Cartão CNPJ.", variant: "destructive" });
        return;
      }
      if (!fichaFile && !fichaKey) {
        toast({ title: "Atenção", description: "Envie a Ficha Cadastral.", variant: "destructive" });
        return;
      }
    }

    let uploadedKey = cnhKey;
    if (cnhFile && !cnhKey) {
      uploadedKey = await uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG");
      if (!uploadedKey) return;
    }
    if (form.clientType === "cnpj") {
      if (cartaoFile && !cartaoKey) {
        const k = await uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ");
        if (!k) return;
      }
      if (fichaFile && !fichaKey) {
        const k = await uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral");
        if (!k) return;
      }
    }

    const hasPsbioValue = psbioStatus && psbioStatus !== "loading" ? psbioStatus.hasPsbio : undefined;

    createOrder.mutate({
      data: {
        certificateId: Number(form.certificateId),
        clientType: form.clientType as "cpf" | "cnpj",
        customerName: form.customerName,
        customerCpfCnpj: form.customerCpfCnpj,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        customerBirthDate: form.customerBirthDate || undefined,
        hasPsbio: hasPsbioValue,
        companyName: form.companyName || undefined,
        inssNumber: form.inssNumber || undefined,
        extendedWarranty: form.extendedWarranty,
        addressZipcode: form.addressZipcode || undefined,
        addressStreet: form.addressStreet || undefined,
        addressNumber: form.addressNumber || undefined,
        addressNeighborhood: form.addressNeighborhood || undefined,
        addressCity: form.addressCity || undefined,
        addressState: form.addressState || undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground">Preencha os dados do cliente para emitir o certificado digital.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Modelo de Certificado *</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!certificates?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum modelo disponível.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {certificates.map(c => {
                      const selected = form.certificateId === String(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => set("certificateId", String(c.id))}
                          className={[
                            "text-left rounded-xl border-2 p-4 transition-all cursor-pointer w-full",
                            selected
                              ? "border-primary bg-primary/5 shadow-md"
                              : "border-border hover:border-primary/40 hover:bg-muted/40",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={["font-semibold text-sm leading-tight", selected ? "text-primary" : ""].join(" ")}>{c.name}</p>
                            {selected && (
                              <span className="shrink-0 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </span>
                            )}
                          </div>
                          {c.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                          )}
                          <p className={["text-lg font-bold mt-3", selected ? "text-primary" : "text-foreground"].join(" ")}>{formatBRL(certPrice(c))}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    id="warranty"
                    checked={form.extendedWarranty}
                    onCheckedChange={(v) => set("extendedWarranty", !!v)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="warranty" className="cursor-pointer font-medium">Garantia Estendida (+R$ 15,00)</Label>
                      <button
                        type="button"
                        onClick={() => setWarrantyInfoOpen(true)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Saiba mais sobre a Garantia Estendida"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Protege contra imprevistos durante a emissão.</p>
                  </div>
                </div>

                <Dialog open={warrantyInfoOpen} onOpenChange={setWarrantyInfoOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-blue-600" />
                        Garantia Estendida
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        A <strong className="text-foreground">Garantia Estendida</strong> oferece o direito de emitir
                        um novo certificado digital sem custo adicional caso o certificado atual seja danificado ou
                        extraviado, dentro do prazo de <strong className="text-foreground">90 dias</strong> a partir
                        da data de emissão.
                      </p>
                      <p>
                        Toda reemissão realizada dentro do período de garantia é <strong className="text-foreground">gratuita</strong> para o cliente.
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                        <p className="font-medium mb-1">Importante</p>
                        <p className="text-xs">
                          Alterações de dados cadastrais ou informações inerentes ao certificado <strong>não são cobertas</strong> pela Garantia Estendida, independentemente do prazo.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Pessoa *</Label>
                  <Select value={form.clientType} onValueChange={(v) => set("clientType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">Pessoa Física (CPF)</SelectItem>
                      <SelectItem value="cnpj">Pessoa Jurídica (CNPJ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Nome Completo *
                      {autoFilledCustomerName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      {cnpjFetching && form.clientType === "cnpj" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </Label>
                    <Input
                      value={form.customerName}
                      onChange={e => { set("customerName", e.target.value); setAutoFilledCustomerName(false); }}
                      required
                      className={autoFilledCustomerName ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      placeholder={cnpjFetching && form.clientType === "cnpj" ? "Buscando..." : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{form.clientType === "cnpj" ? "CNPJ *" : "CPF *"}</Label>
                    <div className="relative">
                      <Input value={form.customerCpfCnpj} onChange={e => {
                        const v = maskCpfCnpj(e.target.value);
                        set("customerCpfCnpj", v);
                        const digits = v.replace(/\D/g, "");
                        if (form.clientType === "cnpj") {
                          if (digits.length === 14) setCnpjToQuery(digits);
                          else { setCnpjToQuery(""); setAutoFilledCustomerName(false); }
                        }
                        triggerPsbioCheck(v, form.customerBirthDate, form.clientType, form.repCpf, form.repBirthDate);
                      }} required placeholder={form.clientType === "cnpj" ? "00.000.000/0001-00" : "000.000.000-00"} className="pr-8" />
                      {cnpjFetching && form.clientType === "cnpj" && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                      )}
                      {cnpjError && form.clientType === "cnpj" && cnpjToQuery.length === 14 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">!</span>
                      )}
                    </div>
                    {cnpjError && form.clientType === "cnpj" && cnpjToQuery.length === 14 && (
                      <p className="text-xs text-destructive">CNPJ não encontrado na Receita Federal.</p>
                    )}
                    {cnpjData && form.clientType === "cnpj" && cnpjData.situacao && cnpjData.situacao !== "ATIVA" && (
                      <p className="text-xs text-amber-600">Situação: {cnpjData.situacao}</p>
                    )}
                  </div>
                  {form.clientType === "cpf" && (
                    <div className="space-y-2">
                      <Label>Data de Nascimento</Label>
                      <Input
                        type="date"
                        value={form.customerBirthDate}
                        onChange={e => {
                          set("customerBirthDate", e.target.value);
                          triggerPsbioCheck(form.customerCpfCnpj, e.target.value, form.clientType, form.repCpf, form.repBirthDate);
                        }}
                      />
                    </div>
                  )}
                  {form.clientType === "cnpj" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="flex items-center gap-1">
                        Razão Social
                        {cnpjData && form.companyName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                        {cnpjFetching && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      </Label>
                      <Input
                        value={form.companyName}
                        onChange={e => set("companyName", e.target.value)}
                        className={cnpjData && form.companyName ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                        placeholder={cnpjFetching ? "Buscando..." : ""}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Número INSS</Label>
                    <Input value={form.inssNumber} onChange={e => set("inssNumber", e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} required placeholder="cliente@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone / WhatsApp *</Label>
                    <Input value={form.customerPhone} onChange={e => set("customerPhone", maskPhone(e.target.value))} required placeholder="(11) 99999-0000" />
                  </div>
                </div>

                {/* PSBio status indicator */}
                {psbioStatus === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Verificando validação biométrica...
                  </div>
                )}
                {psbioStatus && psbioStatus !== "loading" && psbioStatus.hasPsbio && (
                  <div className="flex items-start gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-700 dark:text-emerald-400">Biometria PSBio disponível</p>
                      <p className="text-emerald-600/80 dark:text-emerald-500 text-xs">{psbioStatus.mensagem} — atendimento pode ser realizado remotamente.</p>
                    </div>
                  </div>
                )}
                {psbioStatus && psbioStatus !== "loading" && !psbioStatus.hasPsbio && (
                  <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-700 dark:text-amber-400">Atendimento presencial obrigatório</p>
                      <p className="text-amber-600/80 dark:text-amber-500 text-xs">{psbioStatus.mensagem} — o cliente deverá comparecer pessoalmente para validação.</p>
                    </div>
                  </div>
                )}
                {!psbioStatus && form.customerCpfCnpj.replace(/\D/g, "").length >= 11 && !form.customerBirthDate && form.clientType === "cpf" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldQuestion className="h-4 w-4" />
                    Informe a data de nascimento para verificar disponibilidade de biometria.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dados do Representante Legal — apenas CNPJ */}
            {form.clientType === "cnpj" && (
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Representante Legal</CardTitle>
                  <p className="text-sm text-muted-foreground">Pessoa física responsável pela empresa para emissão do certificado.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="flex items-center gap-1">
                        Nome Completo do Representante *
                        {autoFilledRepName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.repName}
                        onChange={e => { set("repName", e.target.value); setAutoFilledRepName(false); }}
                        placeholder="Nome como consta no documento"
                        required={form.clientType === "cnpj"}
                        className={autoFilledRepName ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CPF do Representante *</Label>
                      <Input
                        value={form.repCpf}
                        onChange={e => {
                          const v = maskCpfCnpj(e.target.value);
                          set("repCpf", v);
                          triggerPsbioCheck(form.customerCpfCnpj, form.customerBirthDate, form.clientType, v, form.repBirthDate);
                        }}
                        placeholder="000.000.000-00"
                        required={form.clientType === "cnpj"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Nascimento *</Label>
                      <Input
                        type="date"
                        value={form.repBirthDate}
                        onChange={e => {
                          set("repBirthDate", e.target.value);
                          triggerPsbioCheck(form.customerCpfCnpj, form.customerBirthDate, form.clientType, form.repCpf, e.target.value);
                        }}
                        required={form.clientType === "cnpj"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CNH / RG Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Documento de Identidade — CNH ou RG *
                </CardTitle>
                <p className="text-sm text-muted-foreground">Envie uma foto ou cópia da CNH ou RG (PDF, JPG ou PNG, máx. 5 MB).</p>
              </CardHeader>
              <CardContent>
                <input ref={cnhInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCnhFile(f); setCnhKey(null); }} />
                {!cnhFile ? (
                  <button type="button" onClick={() => cnhInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                    <Upload className="h-8 w-8 opacity-40" />
                    <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cnhFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(cnhFile.size/1024).toFixed(0)} KB</p>
                      {cnhKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!cnhKey && (
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG")}
                          disabled={cnhUploading}>
                          {cnhUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {cnhUploading ? "Enviando..." : "Enviar"}
                        </Button>
                      )}
                      <button type="button" onClick={() => { setCnhFile(null); setCnhKey(null); if (cnhInputRef.current) cnhInputRef.current.value = ""; }}
                        className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cartão CNPJ — apenas pessoa jurídica */}
            {form.clientType === "cnpj" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Cartão CNPJ *
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Cartão CNPJ emitido pela Receita Federal (PDF, JPG ou PNG, máx. 5 MB).</p>
                </CardHeader>
                <CardContent>
                  <input ref={cartaoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCartaoFile(f); setCartaoKey(null); }} />
                  {!cartaoFile ? (
                    <button type="button" onClick={() => cartaoInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                      <Upload className="h-8 w-8 opacity-40" />
                      <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cartaoFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(cartaoFile.size/1024).toFixed(0)} KB</p>
                        {cartaoKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!cartaoKey && (
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ")}
                            disabled={cartaoUploading}>
                            {cartaoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {cartaoUploading ? "Enviando..." : "Enviar"}
                          </Button>
                        )}
                        <button type="button" onClick={() => { setCartaoFile(null); setCartaoKey(null); if (cartaoInputRef.current) cartaoInputRef.current.value = ""; }}
                          className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ficha Cadastral — apenas pessoa jurídica */}
            {form.clientType === "cnpj" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Ficha Cadastral Completa *
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Ficha cadastral completa da empresa (PDF, JPG ou PNG, máx. 5 MB).</p>
                </CardHeader>
                <CardContent>
                  <input ref={fichaInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setFichaFile(f); setFichaKey(null); }} />
                  {!fichaFile ? (
                    <button type="button" onClick={() => fichaInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                      <Upload className="h-8 w-8 opacity-40" />
                      <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fichaFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(fichaFile.size/1024).toFixed(0)} KB</p>
                        {fichaKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!fichaKey && (
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral")}
                            disabled={fichaUploading}>
                            {fichaUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {fichaUploading ? "Enviando..." : "Enviar"}
                          </Button>
                        )}
                        <button type="button" onClick={() => { setFichaFile(null); setFichaKey(null); if (fichaInputRef.current) fichaInputRef.current.value = ""; }}
                          className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Endereço
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* CEP — busca automática */}
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input
                        value={form.addressZipcode}
                        onChange={e => {
                          const masked = maskCep(e.target.value);
                          set("addressZipcode", masked);
                          fetchCep(masked);
                        }}
                        placeholder="00000-000"
                        maxLength={9}
                        className="pr-9"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {cepLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Search className="h-4 w-4" />}
                      </div>
                    </div>
                    {cepLoading && (
                      <p className="text-xs text-primary animate-pulse">Buscando endereço...</p>
                    )}
                  </div>

                  {/* Rua / Logradouro */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-1">
                      Rua / Logradouro
                      {cepFilled && form.addressStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressStreet}
                      onChange={e => set("addressStreet", e.target.value)}
                      className={cepFilled && form.addressStreet ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* Número — sempre manual */}
                  <div className="space-y-2">
                    <Label>Número <span className="text-xs text-muted-foreground">(preencha manualmente)</span></Label>
                    <Input
                      value={form.addressNumber}
                      onChange={e => set("addressNumber", e.target.value)}
                      placeholder="Ex: 123"
                      autoFocus={cepFilled}
                    />
                  </div>

                  {/* Bairro */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Bairro
                      {cepFilled && form.addressNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressNeighborhood}
                      onChange={e => set("addressNeighborhood", e.target.value)}
                      className={cepFilled && form.addressNeighborhood ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* Cidade */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Cidade
                      {cepFilled && form.addressCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressCity}
                      onChange={e => set("addressCity", e.target.value)}
                      className={cepFilled && form.addressCity ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* UF */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      UF
                      {cepFilled && form.addressState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressState}
                      onChange={e => set("addressState", e.target.value)}
                      maxLength={2}
                      placeholder="SP"
                      className={cepFilled && form.addressState ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>
                </div>

                {cepFilled && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Endereço preenchido automaticamente pelo CEP. Confira e ajuste se necessário.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3 text-sm text-blue-800 dark:text-blue-300">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                  <p>
                    <strong>Agendamento após pagamento.</strong> O horário de atendimento será selecionado na tela de detalhes do pedido,
                    assim que o pagamento for confirmado e o certificado for registrado no provedor.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="sticky top-6">
              <CardHeader><CardTitle>Resumo do Pedido</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {selectedCert ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{selectedCert.name}</span>
                      <span>{formatBRL(certPrice(selectedCert))}</span>
                    </div>
                    {form.extendedWarranty && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Garantia Estendida</span>
                        <span>{formatBRL(15)}</span>
                      </div>
                    )}
                    <div className="border-t pt-4 flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-primary text-lg">{formatBRL(total)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Selecione um certificado para ver o resumo.</p>
                )}

                <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                  {createOrder.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</>
                    : "Criar Pedido"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
