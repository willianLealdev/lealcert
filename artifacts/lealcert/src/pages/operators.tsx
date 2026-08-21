import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiError } from "@/lib/api-error";
import { Loader2, Plus, RefreshCw, Trash2, UserCheck, UserX, Users } from "lucide-react";

type Operator = {
  id: number;
  name: string;
  email: string | null;
  cpfCnpj: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

const apiFetch = (url: string, init?: RequestInit) => fetch(url, { credentials: "include", ...init });

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
    [a, b, c].filter(Boolean).join(".") + (d ? `-${d}` : ""),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export default function Operators() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", cpfCnpj: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);

  const operators = useQuery<Operator[]>({
    queryKey: ["operators"],
    queryFn: async () => {
      const res = await apiFetch("/api/operators");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const createOperator = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cpfCnpj: form.cpfCnpj.replace(/\D/g, "") }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "Não foi possível cadastrar o operador.");
      }
      return res.json() as Promise<Operator>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      setDialogOpen(false);
      setForm({ name: "", email: "", cpfCnpj: "" });
      toast({ title: "Operador cadastrado!", description: "A senha provisória foi enviada para o e-mail informado." });
    },
    onError: error => toast({ title: "Erro", description: getApiError(error), variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiFetch(`/api/operators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "Não foi possível atualizar o operador.");
      }
      return res.json() as Promise<Operator>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: variables.isActive ? "Operador desbloqueado." : "Operador bloqueado." });
    },
    onError: error => toast({ title: "Erro", description: getApiError(error), variant: "destructive" }),
  });

  const resetPassword = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/operators/${id}/reset-password`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "Não foi possível resetar a senha.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      setResetId(null);
      toast({ title: "Senha resetada!", description: "Uma nova senha provisória foi enviada ao operador." });
    },
    onError: error => toast({ title: "Erro", description: getApiError(error), variant: "destructive" }),
  });

  const deleteOperator = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/operators/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "Não foi possível excluir o operador.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      setDeleteId(null);
      toast({ title: "Operador excluído." });
    },
    onError: error => toast({ title: "Erro", description: getApiError(error), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meus Operadores</h1>
          </div>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            Cadastre quem pode comprar certificados em nome da sua conta.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Novo operador
        </Button>
      </div>

      <Card className="border-primary/15 bg-primary/[0.025]">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Operadores usam o <strong className="text-foreground">preço de contador</strong> em todas as compras. Cada pedido registra o operador responsável e permanece vinculado à sua conta.
        </CardContent>
      </Card>

      {operators.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : operators.isError ? (
        <Card><CardContent className="py-12 text-center text-destructive">Não foi possível carregar os operadores.</CardContent></Card>
      ) : !operators.data?.length ? (
        <Card><CardContent className="py-14 text-center"><Users className="h-9 w-9 text-muted-foreground mx-auto mb-3" /><p className="font-medium">Nenhum operador cadastrado</p><p className="text-sm text-muted-foreground mt-1">Cadastre o primeiro operador para delegar compras com o seu preço de contador.</p></CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Operador</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">CPF</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Cadastro</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {operators.data.map(operator => (
                <tr key={operator.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{operator.name}</div>
                    <div className="text-xs text-muted-foreground">{operator.email ?? "Sem e-mail"}</div>
                    {operator.mustChangePassword && <div className="text-xs text-amber-600 mt-0.5">Aguardando primeiro acesso</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatCpf(operator.cpfCnpj)}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(operator.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={operator.isActive ? "outline" : "destructive"} className={operator.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
                      {operator.isActive ? "Ativo" : "Bloqueado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={operator.isActive ? "Bloquear operador" : "Desbloquear operador"} disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: operator.id, isActive: !operator.isActive })}>
                        {operator.isActive ? <UserX className="h-4 w-4 text-amber-600" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Resetar senha" disabled={resetPassword.isPending} onClick={() => setResetId(operator.id)}>
                        <RefreshCw className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir operador" disabled={deleteOperator.isPending} onClick={() => setDeleteId(operator.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo operador</DialogTitle>
            <DialogDescription>Informe os dados de acesso do operador vinculado à sua conta.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); createOperator.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="operator-name">Nome completo *</Label><Input id="operator-name" value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} required /></div>
            <div className="space-y-1.5"><Label htmlFor="operator-cpf">CPF *</Label><Input id="operator-cpf" value={formatCpf(form.cpfCnpj)} onChange={e => setForm(current => ({ ...current, cpfCnpj: e.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="000.000.000-00" required /></div>
            <div className="space-y-1.5"><Label htmlFor="operator-email">E-mail *</Label><Input id="operator-email" type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} placeholder="Para receber a senha provisória" required /></div>
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Uma senha provisória será enviada por e-mail. No primeiro acesso, o operador deverá definir uma senha permanente.</p>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={createOperator.isPending}>{createOperator.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Cadastrar operador</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetId !== null} onOpenChange={open => !open && setResetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar senha do operador?</AlertDialogTitle><AlertDialogDescription>Uma nova senha provisória será enviada ao e-mail cadastrado. O operador deverá alterá-la no próximo acesso.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => resetId !== null && resetPassword.mutate(resetId)}>Resetar senha</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir operador?</AlertDialogTitle><AlertDialogDescription>O operador perderá o acesso imediatamente. Os pedidos já realizados continuarão vinculados à sua conta de contador.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId !== null && deleteOperator.mutate(deleteId)}>Excluir operador</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}