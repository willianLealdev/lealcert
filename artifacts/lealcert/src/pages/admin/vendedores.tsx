import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Copy, RefreshCw, Eye } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type VendedorRow = {
  id: number; name: string; email: string | null; cpfCnpj: string; phone: string | null;
  isActive: boolean; mustChangePassword: boolean; createdAt: string;
  vendedorId: number; valorPorCert: string; valorBonus: string; qtdCertsBonus: number;
  affiliateCode: string; totalContadores: number;
};

type FormData = {
  name: string; email: string; cpfCnpj: string; phone: string;
  valorPorCert: string; valorBonus: string; qtdCertsBonus: string;
  isActive: boolean;
};

const EMPTY: FormData = { name: "", email: "", cpfCnpj: "", phone: "", valorPorCert: "5.00", valorBonus: "1000.00", qtdCertsBonus: "1000", isActive: true };

const apiFetch = (url: string, init?: RequestInit) => fetch(url, { credentials: "include", ...init });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function formatCurrency(v: string | number) {
  return `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;
}

function useVendedores() {
  return useQuery<VendedorRow[]>({
    queryKey: ["admin-vendedores"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/vendedores");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

function useCreateVendedor(opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, Omit<FormData, "isActive">>({
    mutationFn: async (data) => {
      const res = await apiFetch("/api/admin/vendedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vendedores"] }); opts?.onSuccess?.(); },
    onError: opts?.onError,
  });
}

function useUpdateVendedor(opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number; data: Partial<FormData> }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiFetch(`/api/admin/vendedores/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vendedores"] }); opts?.onSuccess?.(); },
    onError: opts?.onError,
  });
}

function useDeleteVendedor(opts?: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/vendedores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(res.statusText);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vendedores"] }); opts?.onSuccess?.(); },
  });
}

function useResetPassword(opts?: { onSuccess?: (data: { tempPassword: string }) => void; onError?: (e: Error) => void }) {
  return useMutation<{ tempPassword: string }, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/vendedores/${id}/reset-password`, { method: "POST" });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });
}

export default function AdminVendedores() {
  const { toast } = useToast();
  const { data: vendedores, isLoading } = useVendedores();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewVendedor, setViewVendedor] = useState<VendedorRow | null>(null);

  const siteUrl = window.location.origin;

  const createVendedor = useCreateVendedor({ onSuccess: () => { toast({ title: "Vendedor criado! E-mail enviado com senha provisória." }); setOpen(false); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });
  const updateVendedor = useUpdateVendedor({ onSuccess: () => { toast({ title: "Vendedor atualizado!" }); setOpen(false); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });
  const deleteVendedor = useDeleteVendedor({ onSuccess: () => { toast({ title: "Vendedor removido." }); setDeleteId(null); } });
  const resetPassword = useResetPassword({ onSuccess: (d) => toast({ title: "Senha redefinida!", description: `Nova senha temporária: ${d.tempPassword}` }), onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(v: VendedorRow) {
    setForm({ name: v.name, email: v.email ?? "", cpfCnpj: v.cpfCnpj, phone: v.phone ?? "", valorPorCert: v.valorPorCert, valorBonus: v.valorBonus, qtdCertsBonus: String(v.qtdCertsBonus), isActive: v.isActive });
    setEditId(v.id);
    setOpen(true);
  }
  function set(k: keyof FormData, v: string | boolean) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editId !== null) {
      updateVendedor.mutate({ id: editId, data: { name: form.name, email: form.email, phone: form.phone, valorPorCert: form.valorPorCert, valorBonus: form.valorBonus, qtdCertsBonus: form.qtdCertsBonus, isActive: form.isActive } });
    } else {
      createVendedor.mutate({ name: form.name, email: form.email, cpfCnpj: form.cpfCnpj, phone: form.phone, valorPorCert: form.valorPorCert, valorBonus: form.valorBonus, qtdCertsBonus: form.qtdCertsBonus });
    }
  }

  function copyLink(code: string) {
    const url = `${siteUrl}/register?ref=${code}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "Link copiado!", description: url }));
  }

  const isPending = createVendedor.isPending || updateVendedor.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vendedores</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os vendedores e suas comissões.</p>
        </div>
        <Button className="shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Vendedor</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : !vendedores?.length ? (
            <div className="text-center py-10 text-muted-foreground">Nenhum vendedor cadastrado.</div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contadores</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Por cert</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Bônus</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map(v => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{v.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{v.totalContadores}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-emerald-600">{formatCurrency(v.valorPorCert)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{formatCurrency(v.valorBonus)} / {v.qtdCertsBonus} certs</td>
                      <td className="px-4 py-3">
                        <Badge variant={v.isActive ? "default" : "destructive"}>{v.isActive ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" title="Ver detalhes" onClick={() => setViewVendedor(v)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Copiar link de afiliado" onClick={() => copyLink(v.affiliateCode)}><Copy className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Reset senha" disabled={resetPassword.isPending} onClick={() => resetPassword.mutate(v.id)}><RefreshCw className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Remover" onClick={() => setDeleteId(v.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal detalhes */}
      {viewVendedor && (
        <Dialog open onOpenChange={() => setViewVendedor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Detalhes do Vendedor</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Nome</p><p className="font-medium">{viewVendedor.name}</p></div>
                <div><p className="text-xs text-muted-foreground">CPF/CNPJ</p><p className="font-mono">{viewVendedor.cpfCnpj}</p></div>
                <div><p className="text-xs text-muted-foreground">E-mail</p><p>{viewVendedor.email ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Telefone</p><p>{viewVendedor.phone ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Cadastro</p><p>{formatDate(viewVendedor.createdAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">Contadores</p><p>{viewVendedor.totalContadores}</p></div>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Comissão</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Por certificado</p><p className="font-semibold text-emerald-600">{formatCurrency(viewVendedor.valorPorCert)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Bônus</p><p className="font-semibold">{formatCurrency(viewVendedor.valorBonus)}</p></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Meta para bônus</p><p>{viewVendedor.qtdCertsBonus} certificados</p></div>
                </div>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Link de Afiliado</p>
                <p className="font-mono text-xs break-all text-blue-600">{window.location.origin}/register?ref={viewVendedor.affiliateCode}</p>
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => copyLink(viewVendedor.affiliateCode)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar Link
                </Button>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setViewVendedor(null)}>Fechar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar Vendedor" : "Novo Vendedor"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome Completo *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} required />
              </div>
              {!editId && (
                <div className="space-y-2">
                  <Label>CPF/CNPJ *</Label>
                  <Input value={form.cpfCnpj} onChange={e => set("cpfCnpj", e.target.value)} required placeholder="00000000000" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>E-mail *</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Valor por certificado (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valorPorCert} onChange={e => set("valorPorCert", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Valor do Bônus (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valorBonus} onChange={e => set("valorBonus", e.target.value)} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Certificados para acionar bônus *</Label>
                <Input type="number" min="1" value={form.qtdCertsBonus} onChange={e => set("qtdCertsBonus", e.target.value)} required />
                <p className="text-xs text-muted-foreground">A cada {form.qtdCertsBonus} certificados emitidos, o vendedor recebe R$ {parseFloat(form.valorBonus || "0").toFixed(2)} de bônus.</p>
              </div>
            </div>
            {!editId && (
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-3">
                💡 Uma senha provisória será gerada automaticamente e enviada por e-mail ao vendedor.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vendedor?</AlertDialogTitle>
            <AlertDialogDescription>Os contadores vinculados perderão o vínculo. O usuário será desativado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteVendedor.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
