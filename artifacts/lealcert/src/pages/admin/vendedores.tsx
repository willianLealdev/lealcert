import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Copy, RefreshCw, Eye, DollarSign, Wallet, CheckCircle, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type VendedorRow = {
  id: number; name: string; email: string | null; cpfCnpj: string; phone: string | null;
  isActive: boolean; mustChangePassword: boolean; createdAt: string;
  vendedorId: number; valorPorCert: string; valorBonus: string; qtdCertsBonus: number;
  affiliateCode: string; totalContadores: number;
  saldoBruto: number; totalPago: number; saldoDevido: number;
};

type PagamentoRow = {
  id: number; valor: string; dataPagamento: string; observacao: string | null;
  createdAt: string; criadoPorNome: string | null;
};

type FormData = {
  name: string; email: string; cpfCnpj: string; phone: string;
  valorPorCert: string; valorBonus: string; qtdCertsBonus: string;
  isActive: boolean;
};

type PagForm = { valor: string; dataPagamento: string; observacao: string };

const EMPTY: FormData = { name: "", email: "", cpfCnpj: "", phone: "", valorPorCert: "5.00", valorBonus: "1000.00", qtdCertsBonus: "1000", isActive: true };
const EMPTY_PAG: PagForm = { valor: "", dataPagamento: new Date().toISOString().slice(0, 10), observacao: "" };

const apiFetch = (url: string, init?: RequestInit) => fetch(url, { credentials: "include", ...init });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function formatCurrency(v: string | number) {
  return `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;
}

function formatCurrencyNum(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

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

function useResendWelcome(opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  return useMutation<{ tempPassword: string }, Error, number>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/vendedores/${id}/resend-welcome`, { method: "POST" });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });
}

function usePagamentos(vendedorUserId: number | null) {
  return useQuery<PagamentoRow[]>({
    queryKey: ["admin-vendedor-pagamentos", vendedorUserId],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/vendedores/${vendedorUserId}/pagamentos`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: vendedorUserId !== null,
  });
}

function useRegistrarPagamento(vendedorUserId: number | null, opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, PagForm>({
    mutationFn: async (data) => {
      const res = await apiFetch(`/api/admin/vendedores/${vendedorUserId}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: data.valor, dataPagamento: data.dataPagamento, observacao: data.observacao }),
      });
      if (!res.ok) { const t = await res.json().catch(() => ({ error: res.statusText })); throw new Error(t.error ?? "Erro"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vendedor-pagamentos", vendedorUserId] });
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      opts?.onSuccess?.();
    },
    onError: opts?.onError,
  });
}

function useExcluirPagamento(vendedorUserId: number | null, opts?: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, number>({
    mutationFn: async (pagId) => {
      const res = await apiFetch(`/api/admin/vendedores/${vendedorUserId}/pagamentos/${pagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(res.statusText);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vendedor-pagamentos", vendedorUserId] });
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      opts?.onSuccess?.();
    },
  });
}

// ── Painel de Pagamentos ──────────────────────────────────────────────────────

function PagamentosPanel({ vendedor, onClose }: { vendedor: VendedorRow; onClose: () => void }) {
  const { toast } = useToast();
  const { data: pagamentos, isLoading } = usePagamentos(vendedor.id);
  const [pagForm, setPagForm] = useState<PagForm>(EMPTY_PAG);
  const [deletePagId, setDeletePagId] = useState<number | null>(null);

  const registrar = useRegistrarPagamento(vendedor.id, {
    onSuccess: () => { toast({ title: "Pagamento registrado!" }); setPagForm(EMPTY_PAG); },
    onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }),
  });
  const excluir = useExcluirPagamento(vendedor.id, {
    onSuccess: () => { toast({ title: "Pagamento removido." }); setDeletePagId(null); },
  });

  const totalPago = pagamentos?.reduce((s, p) => s + parseFloat(p.valor), 0) ?? 0;

  function setPag(k: keyof PagForm, v: string) { setPagForm(p => ({ ...p, [k]: v })); }

  function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!pagForm.valor || parseFloat(pagForm.valor) <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    registrar.mutate(pagForm);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pagamentos — {vendedor.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Saldo Bruto</p>
              <p className="font-bold text-sm">{formatCurrencyNum(vendedor.saldoBruto)}</p>
            </div>
            <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-center">
              <p className="text-xs text-emerald-700 mb-1 flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" /> Já Pago
              </p>
              <p className="font-bold text-sm text-emerald-700">{formatCurrencyNum(totalPago)}</p>
            </div>
            <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-center">
              <p className="text-xs text-amber-700 mb-1 flex items-center justify-center gap-1">
                <Wallet className="h-3 w-3" /> A Receber
              </p>
              <p className="font-bold text-sm text-amber-700">{formatCurrencyNum(Math.max(0, vendedor.saldoBruto - totalPago))}</p>
            </div>
          </div>

          {/* Formulário de novo pagamento */}
          <div className="rounded-lg border p-4 bg-blue-50/50 border-blue-100">
            <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Registrar Pagamento
            </p>
            <form onSubmit={handleRegistrar} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input
                    type="number" step="0.01" min="0.01"
                    placeholder="0,00"
                    value={pagForm.valor}
                    onChange={e => setPag("valor", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data do Pagamento *</Label>
                  <Input
                    type="date"
                    value={pagForm.dataPagamento}
                    onChange={e => setPag("dataPagamento", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observação</Label>
                <Input
                  placeholder="Ex: Pix, transferência, período..."
                  value={pagForm.observacao}
                  onChange={e => setPag("observacao", e.target.value)}
                  maxLength={200}
                />
              </div>
              <Button type="submit" size="sm" disabled={registrar.isPending} className="w-full sm:w-auto">
                {registrar.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Registrando...</> : <><Plus className="h-3.5 w-3.5 mr-1.5" />Registrar</>}
              </Button>
            </form>
          </div>

          {/* Histórico de pagamentos */}
          <div>
            <p className="text-sm font-semibold mb-2">Histórico de Pagamentos</p>
            {isLoading ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Carregando...</div>
            ) : !pagamentos?.length ? (
              <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">Nenhum pagamento registrado ainda.</div>
            ) : (
              <div className="rounded-md border overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Data</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Valor</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Observação</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Registrado por</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.dataPagamento)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(p.valor)}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{p.observacao ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell text-xs">{p.criadoPorNome ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletePagId(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20 font-bold border-t-2">
                      <td className="px-3 py-2 text-xs">Total pago</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{formatCurrencyNum(totalPago)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deletePagId !== null} onOpenChange={() => setDeletePagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pagamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePagId !== null && excluir.mutate(deletePagId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminVendedores() {
  const { toast } = useToast();
  const { data: vendedores, isLoading } = useVendedores();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewVendedor, setViewVendedor] = useState<VendedorRow | null>(null);
  const [pagVendedor, setPagVendedor] = useState<VendedorRow | null>(null);

  const siteUrl = window.location.origin;

  const createVendedor = useCreateVendedor({ onSuccess: () => { toast({ title: "Vendedor criado! E-mail enviado com senha provisória." }); setOpen(false); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });
  const updateVendedor = useUpdateVendedor({ onSuccess: () => { toast({ title: "Vendedor atualizado!" }); setOpen(false); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });
  const deleteVendedor = useDeleteVendedor({ onSuccess: () => { toast({ title: "Vendedor removido." }); setDeleteId(null); } });
  const resetPassword = useResetPassword({ onSuccess: (d) => toast({ title: "Senha redefinida!", description: `Nova senha temporária: ${d.tempPassword}` }), onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) });
  const resendWelcome = useResendWelcome({ onSuccess: () => toast({ title: "E-mail reenviado!", description: "E-mail de boas-vindas enviado com nova senha provisória." }), onError: e => toast({ title: "Erro ao reenviar e-mail", description: getApiError(e), variant: "destructive" }) });

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

  // Totais consolidados
  const totalDevidoGeral = vendedores?.reduce((s, v) => s + (v.saldoDevido ?? 0), 0) ?? 0;
  const totalPagoGeral   = vendedores?.reduce((s, v) => s + (v.totalPago ?? 0), 0) ?? 0;

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

      {/* Resumo consolidado de comissões */}
      {vendedores && vendedores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-4 pb-4 flex items-center gap-4">
              <Wallet className="h-8 w-8 text-amber-500 shrink-0" />
              <div>
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Total a pagar (todos)</p>
                <p className="text-2xl font-black text-amber-800">{formatCurrencyNum(totalDevidoGeral)}</p>
                <p className="text-xs text-amber-600">Soma do saldo a receber de todos os vendedores</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="pt-4 pb-4 flex items-center gap-4">
              <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Total já pago (todos)</p>
                <p className="text-2xl font-black text-emerald-800">{formatCurrencyNum(totalPagoGeral)}</p>
                <p className="text-xs text-emerald-600">Soma de todos os pagamentos registrados</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Carregando...</div>
          ) : !vendedores?.length ? (
            <div className="text-center py-10 text-muted-foreground">Nenhum vendedor cadastrado.</div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contadores</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Bruto</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Já Pago</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">A Receber</th>
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
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">{formatCurrencyNum(v.saldoBruto ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-600">{formatCurrencyNum(v.totalPago ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-amber-600">{formatCurrencyNum(v.saldoDevido ?? 0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={v.isActive ? "default" : "destructive"}>{v.isActive ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" title="Pagamentos" onClick={() => setPagVendedor(v)}>
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Ver detalhes" onClick={() => setViewVendedor(v)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Copiar link de afiliado" onClick={() => copyLink(v.affiliateCode)}><Copy className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Reenviar e-mail de boas-vindas" disabled={resendWelcome.isPending} onClick={() => resendWelcome.mutate(v.id)}><Mail className="h-4 w-4 text-blue-500" /></Button>
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

      {/* Modal de pagamentos */}
      {pagVendedor && (
        <PagamentosPanel vendedor={pagVendedor} onClose={() => setPagVendedor(null)} />
      )}

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
              <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Saldo Financeiro</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-xs text-muted-foreground">Bruto</p><p className="font-bold text-xs">{formatCurrencyNum(viewVendedor.saldoBruto ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pago</p><p className="font-bold text-xs text-emerald-600">{formatCurrencyNum(viewVendedor.totalPago ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">A Receber</p><p className="font-bold text-xs text-amber-600">{formatCurrencyNum(viewVendedor.saldoDevido ?? 0)}</p></div>
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
