import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, MapPin, Building2 } from "lucide-react";

function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, (_, a, b) => (b ? `${a}-${b}` : a));
}

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Address fields
  const [zipCode, setZipCode] = useState(user?.zipCode ?? "");
  const [street, setStreet] = useState(user?.street ?? "");
  const [addressNumber, setAddressNumber] = useState(user?.addressNumber ?? "");
  const [complement, setComplement] = useState(user?.complement ?? "");
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [addressState, setAddressState] = useState(user?.addressState ?? "");

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetMeQueryKey(), data);
        toast({ title: "Perfil atualizado com sucesso!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao atualizar perfil.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await resp.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!data.erro) {
        if (data.logradouro) setStreet(data.logradouro);
        if (data.bairro) setNeighborhood(data.bairro);
        if (data.localidade) setCity(data.localidade);
        if (data.uf) setAddressState(data.uf);
      }
    } catch { /* silently ignore */ }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    updateProfile.mutate({
      data: {
        name,
        email: email || undefined,
        phone: phone || undefined,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
        zipCode: zipCode.replace(/\D/g, "") || undefined,
        street: street || undefined,
        addressNumber: addressNumber || undefined,
        complement: complement || undefined,
        neighborhood: neighborhood || undefined,
        city: city || undefined,
        addressState: addressState || undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Gerencie seus dados e senha de acesso.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Dados Pessoais */}
            <Card>
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
                <CardDescription>Atualize seu nome, e-mail e telefone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF/CNPJ</Label>
                    <Input value={user?.cpfCnpj ?? ""} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
                  </div>
                </div>

                {/* Informações do Cadastro (somente leitura) */}
                {(user?.companyName || user?.crcNumber) && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Dados do Registro
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {user?.companyName && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Razão Social</Label>
                          <Input value={user.companyName} disabled className="bg-muted text-sm" />
                        </div>
                      )}
                      {user?.companyFantasyName && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nome Fantasia</Label>
                          <Input value={user.companyFantasyName} disabled className="bg-muted text-sm" />
                        </div>
                      )}
                      {user?.crcNumber && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">CRC</Label>
                          <Input value={user.crcNumber} disabled className="bg-muted font-mono text-sm" />
                        </div>
                      )}
                      {user?.responsibleName && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Responsável Técnico</Label>
                          <Input value={user.responsibleName} disabled className="bg-muted text-sm" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">Alterar Senha (opcional)</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Senha Atual</Label>
                      <Input id="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nova Senha</Label>
                      <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                      <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endereço */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" /> Endereço
                </CardTitle>
                <CardDescription>Mantenha seu endereço atualizado para emissão de certificados.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input
                      id="zipCode"
                      value={zipCode}
                      onChange={e => { const v = maskCep(e.target.value); setZipCode(v); if (v.replace(/\D/g,"").length === 8) lookupCep(v); }}
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="street">Logradouro</Label>
                    <Input id="street" value={street} onChange={e => setStreet(e.target.value)} placeholder="Rua, Avenida..." />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="addressNumber">Número</Label>
                    <Input id="addressNumber" value={addressNumber} onChange={e => setAddressNumber(e.target.value)} placeholder="123" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input id="complement" value={complement} onChange={e => setComplement(e.target.value)} placeholder="Sala, apto, bloco..." />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input id="neighborhood" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input value={addressState} onChange={e => setAddressState(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} className="font-mono" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" value={city} onChange={e => setCity(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Alterações"}
            </Button>
          </form>
        </div>

        <div>
          <Card>
            <CardHeader><CardTitle>Sua Conta</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{user?.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {user?.role === "admin" ? "Administrador" : user?.userType === "contador" ? "Contador" : "Cliente"}
                  </p>
                  {user?.personType && (
                    <p className="text-xs text-muted-foreground">
                      Pessoa {user.personType === "juridica" ? "Jurídica" : "Física"}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-sm space-y-1 border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPF/CNPJ</span>
                  <span className="font-mono text-xs">{user?.cpfCnpj}</span>
                </div>
                {user?.email && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">E-mail</span>
                    <span className="truncate text-right text-xs">{user.email}</span>
                  </div>
                )}
                {user?.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefone</span>
                    <span>{user.phone}</span>
                  </div>
                )}
                {user?.city && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cidade</span>
                    <span>{user.city}{user.addressState ? `/${user.addressState}` : ""}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
