import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, RefreshCw, UserCheck } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type ContadorRow = {
  id: number; name: string; email: string | null; cpfCnpj: string; phone: string | null;
  isActive: boolean; mustChangePassword: boolean; createdAt: string; userType: string; companyName: string | null;
};

type ContadorForm = {
  name: string; email: string; cpfCnpj: string; phone: string;
  userType: string; personType: string; companyName: string; companyFantasyName: string;
  responsibleCpf: string; responsibleName: string; tempPassword: string;
};

const EMPTY: ContadorForm = {
  name: "", email: "", cpfCnpj: "", phone: "", userType: "contador",
  personType: "fisica", companyName: "", companyFantasyName: "",
  responsibleCpf: "", responsibleName: "", tempPassword: "",
};

const apiFetch = (url: string, init?: RequestInit) => fetch(url, { credentials: "include", ...init });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function useContadores() {
  return useQuery<ContadorRow[]>({
    queryKey: ["vendedor-contadores"],
    queryFn: async () => {
      const res = await apiFetch("/api/vendedor/contadores");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

function useCreateContador(opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<{ id: number; message: string }, Error, ContadorForm>({
    mutationFn: async (data) => {
      const res = await apiFetch("/api/vendedor/contadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendedor-contadores"] }); opts?.onSuccess?.(); },
    onError: opts?.onError,
  });
}

function useResetContadorPassword(opts?: { onSuccess?: (d: { tempPassword: string }) => void; onError?: (e: Error) => void }) {
  return useMutation<{ tempPassword: string; message: string }, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/vendedor/contadores/${id}/reset-password`, { method: "POST" });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });
}

export default function VendedorContadores() {
  const { toast } = useToast();
  const { data: contadores, isLoading } = useContadores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContadorForm>(EMPTY);

  const createContador = useCreateContador({
    onSuccess: () => { toast({ title: "Contador cadastrado!", description: "E-mail de boas-vindas enviado com a senha provisória." }); setOpen(false); setForm(EMPTY); },
    onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });
  const resetPassword = useResetContadorPassword({
    onSuccess: (d) => toast({ title: "Senha redefinida!", description: `Nova senha temporária: ${d.tempPassword}` }),
    onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });

  function set(k: keyof ContadorForm, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    createContador.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meus Contadores</h1>
          <p className="text-muted-foreground text-sm">Contadores vinculados à sua conta.</p>
        </div>
        <Button className="shrink-0" onClick={() => { setForm(EMPTY); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Contador</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : !contadores?.length ? (
            <div className="text-center py-10 space-y-3">
              <UserCheck className="h-12 w-12 text-muted-foreground mx-auto opacity-40" />
              <p className="text-muted-foreground">Nenhum contador cadastrado ainda.</p>
              <Button onClick={() => { setForm(EMPTY); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro contador</Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">CPF/CNPJ</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {contadores.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {c.name}
                        {c.companyName && <p className="text-xs text-muted-foreground">{c.companyName}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{c.cpfCnpj}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={c.isActive ? "default" : "destructive"}>{c.isActive ? "Ativo" : "Inativo"}</Badge>
                          {c.mustChangePassword && <Badge variant="outline" className="text-amber-600 border-amber-400">Senha provisória</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" title="Resetar senha" disabled={resetPassword.isPending} onClick={() => resetPassword.mutate(c.id)}>
                          <RefreshCw className="h-4 w-4 mr-1.5" /> Reset senha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal cadastro */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cadastrar Novo Contador</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome Completo *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>CPF/CNPJ *</Label>
                <Input value={form.cpfCnpj} onChange={e => set("cpfCnpj", e.target.value)} required placeholder="00000000000" />
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <div className="space-y-2">
                <Label>Tipo de pessoa</Label>
                <Select value={form.personType} onValueChange={v => set("personType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fisica">Pessoa Física</SelectItem>
                    <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.personType === "juridica" && (
                <>
                  <div className="space-y-2">
                    <Label>Razão Social</Label>
                    <Input value={form.companyName} onChange={e => set("companyName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Fantasia</Label>
                    <Input value={form.companyFantasyName} onChange={e => set("companyFantasyName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF do Responsável Técnico</Label>
                    <Input value={form.responsibleCpf} onChange={e => set("responsibleCpf", e.target.value)} placeholder="00000000000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Responsável</Label>
                    <Input value={form.responsibleName} onChange={e => set("responsibleName", e.target.value)} />
                  </div>
                </>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>Senha provisória</Label>
                <Input value={form.tempPassword} onChange={e => set("tempPassword", e.target.value)} placeholder="Gerada automaticamente se não preenchida" />
                <p className="text-xs text-muted-foreground">O contador receberá um e-mail com essa senha e será solicitado a alterá-la no primeiro acesso.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createContador.isPending}>
                {createContador.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cadastrando...</> : "Cadastrar e Enviar E-mail"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
