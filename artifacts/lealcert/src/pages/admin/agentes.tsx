import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, RefreshCw, UserCheck, UserX } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
type Agent = { id: number; name: string; email: string | null; cpfCnpj: string; phone: string | null; isActive: boolean; mustChangePassword: boolean; createdAt: string };
type AgentInput = { name: string; email: string; cpfCnpj: string; phone?: string };
type AgentUpdate = { name?: string; phone?: string; isActive?: boolean };
import { getApiError } from "@/lib/api-error";

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function useListAgents() {
  return useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/agentes");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

function useCreateAgent(options?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<Agent, Error, AgentInput>({
    mutationFn: async (data) => {
      const res = await apiFetch("/api/admin/agentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro ao criar agente"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agents"] }); options?.onSuccess?.(); },
    onError: options?.onError,
  });
}

function useUpdateAgent(options?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<Agent, Error, { id: number; data: AgentUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiFetch(`/api/admin/agentes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro ao atualizar agente"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agents"] }); options?.onSuccess?.(); },
    onError: options?.onError,
  });
}

function useDeleteAgent(options?: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/agentes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao remover agente");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agents"] }); options?.onSuccess?.(); },
  });
}

function useResetPassword(options?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/agentes/${id}/reset-password`, { method: "POST" });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro ao resetar senha"); }
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

type AgentForm = { name: string; email: string; cpfCnpj: string; phone: string };
const EMPTY: AgentForm = { name: "", email: "", cpfCnpj: "", phone: "" };

export default function AdminAgentes() {
  const { toast } = useToast();
  const { data: agents, isLoading } = useListAgents();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AgentForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);

  const createAgent = useCreateAgent({
    onSuccess: () => { toast({ title: "Agente criado! Senha temporária enviada por e-mail." }); setOpen(false); },
    onError: (e) => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });
  const updateAgent = useUpdateAgent({
    onSuccess: () => { toast({ title: "Agente atualizado!" }); setOpen(false); },
    onError: (e) => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });
  const deleteAgent = useDeleteAgent({
    onSuccess: () => { toast({ title: "Agente removido." }); setDeleteId(null); },
  });
  const resetPassword = useResetPassword({
    onSuccess: () => { toast({ title: "Senha resetada! Nova senha temporária enviada por e-mail." }); setResetId(null); },
    onError: (e) => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(a: Agent) {
    setForm({ name: a.name, email: a.email ?? "", cpfCnpj: a.cpfCnpj, phone: a.phone ?? "" });
    setEditId(a.id);
    setOpen(true);
  }
  function set(k: keyof AgentForm, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editId !== null) {
      updateAgent.mutate({ id: editId, data: { name: form.name, phone: form.phone || undefined } });
    } else {
      createAgent.mutate({ name: form.name, email: form.email, cpfCnpj: form.cpfCnpj, phone: form.phone || undefined });
    }
  }

  function toggleActive(a: Agent) {
    updateAgent.mutate({ id: a.id, data: { isActive: !a.isActive } });
  }

  const isPending = createAgent.isPending || updateAgent.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Agentes de Registro</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie os agentes autorizados a consultar documentos.</p>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" /> Novo Agente
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !agents?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Nenhum agente cadastrado.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">E-mail</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">CPF</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Cadastro</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    {a.mustChangePassword && (
                      <span className="text-xs text-amber-600">Aguardando 1º acesso</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{a.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {a.cpfCnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    {a.isActive ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Inativo</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={a.isActive ? "Desativar" : "Ativar"}
                        onClick={() => toggleActive(a)}
                      >
                        {a.isActive ? <UserX className="h-3.5 w-3.5 text-amber-500" /> : <UserCheck className="h-3.5 w-3.5 text-emerald-500" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Resetar senha" onClick={() => setResetId(a.id)}>
                        <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remover" onClick={() => setDeleteId(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId !== null ? "Editar Agente" : "Novo Agente de Registro"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo *</Label>
              <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} required />
            </div>
            {editId === null && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} required placeholder="Para receber a senha temporária" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cpfCnpj">CPF *</Label>
                  <Input id="cpfCnpj" value={form.cpfCnpj} onChange={e => set("cpfCnpj", e.target.value)} required placeholder="000.000.000-00" maxLength={14} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            {editId === null && (
              <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                Uma senha temporária será gerada e enviada automaticamente para o e-mail informado. O agente deverá alterá-la no primeiro acesso.
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editId !== null ? "Salvar" : "Criar Agente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover agente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O agente perderá acesso ao sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId !== null && deleteAgent.mutate(deleteId)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password confirmation */}
      <AlertDialog open={resetId !== null} onOpenChange={(o) => !o && setResetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha do agente?</AlertDialogTitle>
            <AlertDialogDescription>Uma nova senha temporária será gerada e enviada para o e-mail do agente. Ele deverá alterá-la no próximo acesso.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetId !== null && resetPassword.mutate(resetId)}>
              {resetPassword.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Resetar senha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
