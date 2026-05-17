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
import { ArrowLeft, Loader2 } from "lucide-react";
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

  async function fetchCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          addressStreet: data.logradouro ?? prev.addressStreet,
          addressNeighborhood: data.bairro ?? prev.addressNeighborhood,
          addressCity: data.localidade ?? prev.addressCity,
          addressState: data.uf ?? prev.addressState,
        }));
      }
    } catch (_) {}
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
              <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input
                      value={form.addressZipcode}
                      onChange={e => { set("addressZipcode", e.target.value); fetchCep(e.target.value); }}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {cepLoading && <p className="text-xs text-muted-foreground">Buscando...</p>}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Rua / Logradouro</Label>
                    <Input value={form.addressStreet} onChange={e => set("addressStreet", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={form.addressNumber} onChange={e => set("addressNumber", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={form.addressNeighborhood} onChange={e => set("addressNeighborhood", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={form.addressCity} onChange={e => set("addressCity", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input value={form.addressState} onChange={e => set("addressState", e.target.value)} maxLength={2} placeholder="SP" />
                  </div>
                </div>
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
