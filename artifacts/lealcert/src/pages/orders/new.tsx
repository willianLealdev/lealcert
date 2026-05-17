import { useState } from "react";
import { useLocation } from "wouter";
import { useListCertificates, useListSlots, useCreateOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Search, MapPin } from "lucide-react";
import { Link } from "wouter";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatSlotDateTime(d: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit"
  }).format(new Date(d));
}

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: certificates } = useListCertificates({ activeOnly: true });
  const { data: slots } = useListSlots();

  const [form, setForm] = useState({
    certificateId: "",
    clientType: "cpf",
    customerName: "",
    customerCpfCnpj: "",
    customerEmail: "",
    customerPhone: "",
    companyName: "",
    inssNumber: "",
    scheduledAt: "",
    extendedWarranty: false,
    addressZipcode: "",
    addressStreet: "",
    addressNumber: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
  });

  const [cepLoading, setCepLoading] = useState(false);
  const [cepFilled, setCepFilled] = useState(false);

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Pedido criado!", description: `Pedido ${data.orderNumber} criado com sucesso.` });
        setLocation(`/orders/${data.id}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Erro ao criar pedido.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const selectedCert = certificates?.find(c => String(c.id) === form.certificateId);
  const total = (selectedCert?.price ?? 0) + (form.extendedWarranty ? 15 : 0);

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function maskCep(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
    return d;
  }

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certificateId) {
      toast({ title: "Atenção", description: "Selecione um modelo de certificado.", variant: "destructive" });
      return;
    }
    if (!form.scheduledAt) {
      toast({ title: "Atenção", description: "Selecione um horário para o atendimento.", variant: "destructive" });
      return;
    }
    createOrder.mutate({
      data: {
        certificateId: Number(form.certificateId),
        clientType: form.clientType as "cpf" | "cnpj",
        customerName: form.customerName,
        customerCpfCnpj: form.customerCpfCnpj,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        companyName: form.companyName || undefined,
        inssNumber: form.inssNumber || undefined,
        scheduledAt: form.scheduledAt,
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
              <CardHeader><CardTitle>Tipo de Certificado</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Modelo de Certificado *</Label>
                  <Select value={form.certificateId} onValueChange={(v) => set("certificateId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {certificates?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} — {formatBRL(c.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    id="warranty"
                    checked={form.extendedWarranty}
                    onCheckedChange={(v) => set("extendedWarranty", !!v)}
                  />
                  <div>
                    <Label htmlFor="warranty" className="cursor-pointer font-medium">Garantia Estendida (+R$ 15,00)</Label>
                    <p className="text-xs text-muted-foreground">Protege contra imprevistos durante a emissão.</p>
                  </div>
                </div>
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
                    <Label>Nome Completo *</Label>
                    <Input value={form.customerName} onChange={e => set("customerName", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{form.clientType === "cnpj" ? "CNPJ *" : "CPF *"}</Label>
                    <Input value={form.customerCpfCnpj} onChange={e => set("customerCpfCnpj", e.target.value)} required placeholder={form.clientType === "cnpj" ? "00.000.000/0001-00" : "000.000.000-00"} />
                  </div>
                  {form.clientType === "cnpj" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Razão Social</Label>
                      <Input value={form.companyName} onChange={e => set("companyName", e.target.value)} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Número INSS</Label>
                    <Input value={form.inssNumber} onChange={e => set("inssNumber", e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} placeholder="(11) 99999-0000" />
                  </div>
                </div>
              </CardContent>
            </Card>

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

            <Card>
              <CardHeader><CardTitle>Agendamento *</CardTitle></CardHeader>
              <CardContent>
                {!slots?.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum horário disponível no momento.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {slots.map(slot => (
                      <label
                        key={slot.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${form.scheduledAt === slot.slotDatetime ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                      >
                        <input
                          type="radio"
                          name="slot"
                          value={slot.slotDatetime}
                          checked={form.scheduledAt === slot.slotDatetime}
                          onChange={() => set("scheduledAt", slot.slotDatetime)}
                          className="accent-primary"
                        />
                        <span className="text-sm capitalize">{formatSlotDateTime(slot.slotDatetime)}</span>
                      </label>
                    ))}
                  </div>
                )}
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
                      <span>{formatBRL(selectedCert.price)}</span>
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
