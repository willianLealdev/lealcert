import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type UserForm = { name: string; email: string; cpfCnpj: string; phone: string; role: string; password: string; isActive: boolean };
const EMPTY: UserForm = { name: "", email: "", cpfCnpj: "", phone: "", role: "contador", password: "", isActive: true };

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { data: users, isLoading, refetch } = useListUsers();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createUser = useCreateUser({ mutation: { onSuccess: () => { toast({ title: "Usuário criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const updateUser = useUpdateUser({ mutation: { onSuccess: () => { toast({ title: "Usuário atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const deleteUser = useDeleteUser({ mutation: { onSuccess: () => { toast({ title: "Usuário removido." }); setDeleteId(null); refetch(); } } });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(u: NonNullable<typeof users>[number]) {
    setForm({ name: u.name, email: u.email ?? "", cpfCnpj: u.cpfCnpj, phone: u.phone ?? "", role: u.role, password: "", isActive: u.isActive ?? true });
    setEditId(u.id);
    setOpen(true);
  }
  function set(k: keyof UserForm, v: string | boolean) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editId !== null) {
      const data: Record<string, unknown> = { name: form.name, email: form.email, phone: form.phone, role: form.role, isActive: form.isActive };
      if (form.password) data.password = form.password;
      updateUser.mutate({ id: editId, data: data as Parameters<typeof updateUser.mutate>[0]["data"] });
    } else {
      createUser.mutate({ data: { name: form.name, email: form.email, cpfCnpj: form.cpfCnpj, phone: form.phone, role: form.role as "admin" | "contador", password: form.password } });
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os contadores e administradores.</p>
        </div>
        <Button className="shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Usuário</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">CPF/CNPJ</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Perfil</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users?.map(u => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{u.cpfCnpj}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "Admin" : "Contador"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? "default" : "destructive"}>{u.isActive ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)}><Trash2 className="h-4 w-4" /></Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar Usuário" : "Novo Usuário"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome Completo *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>CPF/CNPJ *</Label>
                <Input value={form.cpfCnpj} onChange={e => set("cpfCnpj", e.target.value)} disabled={!!editId} required={!editId} placeholder="00000000000" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Perfil *</Label>
                <Select value={form.role} onValueChange={v => set("role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contador">Contador</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editId && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.isActive ? "active" : "inactive"} onValueChange={v => set("isActive", v === "active")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>{editId ? "Nova Senha (deixe em branco para manter)" : "Senha *"}</Label>
                <Input type="password" value={form.password} onChange={e => set("password", e.target.value)} required={!editId} />
              </div>
            </div>
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
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && deleteUser.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
