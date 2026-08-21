import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, type User } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Eye } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type UserRow = User & { vendedorId?: number | null; vendedorNome?: string | null; contadorId?: number | null; contadorNome?: string | null };

// tipo = "cliente" | "contador" | "admin" — campo unificado para exibição
type UserForm = { name: string; email: string; cpfCnpj: string; phone: string; tipo: string; password: string; isActive: boolean };
const EMPTY: UserForm = { name: "", email: "", cpfCnpj: "", phone: "", tipo: "cliente", password: "", isActive: true };

function tipoFromUser(u: { role: string; userType?: string | null }): string {
  if (u.role === "admin") return "admin";
  if (u.role === "vendedor") return "vendedor";
  if (u.role === "operador") return "operador";
  return u.userType === "contador" ? "contador" : "cliente";
}
function roleFromTipo(tipo: string): "admin" | "contador" { return tipo === "admin" ? "admin" : "contador"; }
function userTypeFromTipo(tipo: string): string { return tipo === "contador" ? "contador" : "cliente"; }

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function Field({ label, value }: { label: string; value: string | null | undefined | boolean }) {
  if (value === null || value === undefined || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Sim" : "Não") : value;
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium break-all">{display}</p>
    </div>
  );
}

function UserDetailsModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const tipo = tipoFromUser(user);
  const tipoLabel = tipo === "admin" ? "Administrador" : tipo === "vendedor" ? "Vendedor" : tipo === "operador" ? "Operador" : tipo === "contador" ? "Contador" : "Cliente";

  const hasAddress = user.zipCode || user.street || user.city;
  const hasPJ = user.companyCnpj || user.companyName;
  const hasResponsible = user.responsibleCpf || user.responsibleName;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados do Usuário</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identificação */}
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome" value={user.name} />
              <Field label="CPF/CNPJ" value={user.cpfCnpj} />
              <Field label="E-mail" value={user.email} />
              <Field label="Telefone" value={user.phone} />
              <Field label="Tipo" value={tipoLabel} />
              <Field label="Tipo de Pessoa" value={user.personType === "pf" ? "Pessoa Física" : user.personType === "pj" ? "Pessoa Jurídica" : user.personType} />
              <Field label="Cadastro em" value={formatDate(user.createdAt)} />
              <Field label="Status" value={user.isActive ? "Ativo" : "Inativo"} />
            </div>
          </div>

          {/* CRC (contador) */}
          {(user.crcNumber) && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Registro Profissional</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CRC" value={user.crcNumber} />
                  <Field label="CRC Verificado" value={user.crcVerified} />
                </div>
              </div>
            </>
          )}

          {/* Dados PJ */}
          {hasPJ && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Empresa</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CNPJ da Empresa" value={user.companyCnpj} />
                  <Field label="Razão Social" value={user.companyName} />
                  <Field label="Nome Fantasia" value={user.companyFantasyName} />
                </div>
              </div>
            </>
          )}

          {/* Responsável técnico */}
          {hasResponsible && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Responsável Técnico</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CPF do Responsável" value={user.responsibleCpf} />
                  <Field label="Nome do Responsável" value={user.responsibleName} />
                </div>
              </div>
            </>
          )}

          {/* Endereço */}
          {hasAddress && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Endereço</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CEP" value={user.zipCode} />
                  <Field label="Logradouro" value={user.street} />
                  <Field label="Número" value={user.addressNumber} />
                  <Field label="Complemento" value={user.complement} />
                  <Field label="Bairro" value={user.neighborhood} />
                  <Field label="Cidade" value={user.city} />
                  <Field label="Estado" value={user.addressState} />
                </div>
              </div>
            </>
          )}

          {/* Vendedor vinculado (contador) */}
          {user.vendedorNome && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Indicação</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vendedor" value={user.vendedorNome} />
                </div>
              </div>
            </>
          )}
          {user.contadorNome && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Vínculo de Operador</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contador responsável" value={user.contadorNome} />
                </div>
              </div>
            </>
          )}

          {!hasAddress && !hasPJ && !hasResponsible && !user.crcNumber && !user.vendedorNome && !user.contadorNome && (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum dado adicional de cadastro registrado.</p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { data: users, isLoading, refetch } = useListUsers();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewUser, setViewUser] = useState<UserRow | null>(null);

  const createUser = useCreateUser({ mutation: { onSuccess: () => { toast({ title: "Usuário criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const updateUser = useUpdateUser({ mutation: { onSuccess: () => { toast({ title: "Usuário atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const deleteUser = useDeleteUser({ mutation: { onSuccess: () => { toast({ title: "Usuário removido." }); setDeleteId(null); refetch(); }, onError: (e) => toast({ title: "Erro ao remover usuário", description: getApiError(e), variant: "destructive" }) } });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(u: UserRow) {
    setForm({ name: u.name, email: u.email ?? "", cpfCnpj: u.cpfCnpj, phone: u.phone ?? "", tipo: tipoFromUser(u), password: "", isActive: u.isActive ?? true });
    setEditId(u.id);
    setOpen(true);
  }
  function set(k: keyof UserForm, v: string | boolean) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editId !== null) {
      const data: Record<string, unknown> = { name: form.name, email: form.email, phone: form.phone, role: roleFromTipo(form.tipo), userType: userTypeFromTipo(form.tipo), isActive: form.isActive };
      if (form.password) data.password = form.password;
      updateUser.mutate({ id: editId, data: data as Parameters<typeof updateUser.mutate>[0]["data"] });
    } else {
      createUser.mutate({ data: { name: form.name, email: form.email, cpfCnpj: form.cpfCnpj, phone: form.phone, role: roleFromTipo(form.tipo), password: form.password } });
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os contadores, clientes e administradores.</p>
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
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">CPF/CNPJ</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users?.filter(u => u.role !== "vendedor").map(u => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{u.cpfCnpj}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {tipoFromUser(u) === "admin" ? "Admin" : tipoFromUser(u) === "vendedor" ? "Vendedor" : tipoFromUser(u) === "operador" ? "Operador" : tipoFromUser(u) === "contador" ? "Contador" : "Cliente"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? "default" : "destructive"}>{u.isActive ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" title="Ver dados completos" onClick={() => setViewUser(u)}><Eye className="h-4 w-4" /></Button>
                          {u.role !== "operador" && <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>}
                          {u.role !== "operador" && <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Remover" onClick={() => setDeleteId(u.id)}><Trash2 className="h-4 w-4" /></Button>}
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

      {/* Modal de detalhes completos */}
      {viewUser && <UserDetailsModal user={viewUser} onClose={() => setViewUser(null)} />}

      {/* Modal criar/editar */}
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
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente">Cliente</SelectItem>
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
