import { useState } from "react";
import { useListCoupons, useCreateCoupon, useUpdateCoupon, useDeleteCoupon } from "@workspace/api-client-react";
import type { Coupon } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Tag, Percent, DollarSign, Users, User, Building2, CalendarClock, Infinity } from "lucide-react";
import { getApiError } from "@/lib/api-error";

type LimitMode = "none" | "total" | "per_user";

type CouponForm = {
  code: string;
  type: "percent" | "fixed";
  value: string;
  target: "all" | "cliente" | "contador";
  expiresMode: "never" | "date";
  expiresAt: string;
  active: boolean;
  limitMode: LimitMode;
  limitValue: string;
};

const EMPTY: CouponForm = {
  code: "",
  type: "percent",
  value: "",
  target: "all",
  expiresMode: "never",
  expiresAt: "",
  active: true,
  limitMode: "none",
  limitValue: "",
};

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isExpired(d: string | null | undefined) {
  if (!d) return false;
  return new Date(d) < new Date();
}

function getLimitMode(c: Coupon): LimitMode {
  if (c.perUserLimit != null) return "per_user";
  if (c.usageLimit != null) return "total";
  return "none";
}

export default function AdminCoupons() {
  const { toast } = useToast();
  const { data: coupons, isLoading, refetch } = useListCoupons();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const create = useCreateCoupon({ mutation: { onSuccess: () => { toast({ title: "Cupom criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const update = useUpdateCoupon({ mutation: { onSuccess: () => { toast({ title: "Cupom atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const del = useDeleteCoupon({ mutation: { onSuccess: () => { toast({ title: "Cupom removido." }); setDeleteId(null); refetch(); } } });

  function set<K extends keyof CouponForm>(k: K, v: CouponForm[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(c: Coupon) {
    const mode = getLimitMode(c);
    setForm({
      code: c.code,
      type: c.type as "percent" | "fixed",
      value: String(c.value),
      target: c.target as "all" | "cliente" | "contador",
      expiresMode: c.expiresAt ? "date" : "never",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      active: c.active,
      limitMode: mode,
      limitValue: mode === "per_user" ? String(c.perUserLimit ?? "") : mode === "total" ? String(c.usageLimit ?? "") : "",
    });
    setEditId(c.id);
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const limitNum = form.limitValue ? parseInt(form.limitValue, 10) : null;
    const data = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: parseFloat(form.value),
      target: form.target,
      expiresAt: form.expiresMode === "date" && form.expiresAt ? new Date(form.expiresAt + "T23:59:59").toISOString() : null,
      active: form.active,
      usageLimit: form.limitMode === "total" ? limitNum : null,
      perUserLimit: form.limitMode === "per_user" ? limitNum : null,
    };
    if (editId !== null) update.mutate({ id: editId, data: data as Parameters<typeof update.mutate>[0]["data"] });
    else create.mutate({ data: data as Parameters<typeof create.mutate>[0]["data"] });
  }

  const isSaving = create.isPending || update.isPending;

  const targetLabel: Record<string, { label: string; icon: React.ReactNode }> = {
    all: { label: "Todos", icon: <Users className="h-3 w-3" /> },
    cliente: { label: "Clientes", icon: <User className="h-3 w-3" /> },
    contador: { label: "Contadores", icon: <Building2 className="h-3 w-3" /> },
  };

  const limitModeLabel: Record<LimitMode, string> = {
    none: "Ilimitado",
    total: "Limite total",
    per_user: "Por cadastro",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cupons de Desconto</h1>
          <p className="text-muted-foreground mt-1">Crie e gerencie cupons de desconto por valor ou percentual.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Cupom
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !coupons?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Tag className="h-10 w-10 opacity-30" />
            <p>Nenhum cupom cadastrado.</p>
            <Button variant="outline" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Criar primeiro cupom</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => {
            const expired = isExpired(c.expiresAt);
            const exhausted = c.usageLimit !== null && c.usageCount >= c.usageLimit;
            const statusOk = c.active && !expired && !exhausted;
            const mode = getLimitMode(c);

            return (
              <Card key={c.id} className={`transition-all ${!statusOk ? "opacity-70" : ""}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-lg tracking-widest text-primary">{c.code}</span>
                        {!c.active && <Badge variant="secondary">Inativo</Badge>}
                        {expired && <Badge variant="destructive">Expirado</Badge>}
                        {exhausted && <Badge variant="destructive">Esgotado</Badge>}
                        {statusOk && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400">Ativo</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          {c.type === "percent" ? <Percent className="h-3.5 w-3.5 text-primary" /> : <DollarSign className="h-3.5 w-3.5 text-primary" />}
                          {c.type === "percent" ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`}
                        </span>
                        <span className="flex items-center gap-1">
                          {targetLabel[c.target]?.icon} Para: {targetLabel[c.target]?.label ?? c.target}
                        </span>
                        <span className="flex items-center gap-1">
                          {c.expiresAt ? <CalendarClock className="h-3.5 w-3.5" /> : <Infinity className="h-3.5 w-3.5" />}
                          {c.expiresAt ? `Válido até ${formatDate(c.expiresAt)}` : "Sem expiração"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" />
                          {mode === "per_user"
                            ? `${c.usageCount} usos · máx ${c.perUserLimit}×/cadastro`
                            : mode === "total"
                            ? `${c.usageCount}/${c.usageLimit} usos (total)`
                            : `${c.usageCount} usos (ilimitado)`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)} title="Excluir" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Código do cupom *</Label>
              <Input
                value={form.code}
                onChange={e => set("code", e.target.value.toUpperCase())}
                placeholder="Ex: DESCONTO10"
                required
                className="font-mono uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de desconto *</Label>
                <Select value={form.type} onValueChange={v => set("type", v as "percent" | "fixed")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent"><span className="flex items-center gap-2"><Percent className="h-3.5 w-3.5" /> Percentual (%)</span></SelectItem>
                    <SelectItem value="fixed"><span className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Valor fixo (R$)</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{form.type === "percent" ? "Desconto (%) *" : "Valor (R$) *"}</Label>
                <Input
                  type="number"
                  min="0"
                  max={form.type === "percent" ? "100" : undefined}
                  step="0.01"
                  value={form.value}
                  onChange={e => set("value", e.target.value)}
                  placeholder={form.type === "percent" ? "10" : "25.00"}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Válido para *</Label>
              <RadioGroup value={form.target} onValueChange={v => set("target", v as "all" | "cliente" | "contador")} className="flex gap-4">
                <div className="flex items-center gap-2 flex-1 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="all" id="t-all" />
                  <Label htmlFor="t-all" className="cursor-pointer flex items-center gap-1.5 font-normal">
                    <Users className="h-3.5 w-3.5" /> Todos
                  </Label>
                </div>
                <div className="flex items-center gap-2 flex-1 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="cliente" id="t-cliente" />
                  <Label htmlFor="t-cliente" className="cursor-pointer flex items-center gap-1.5 font-normal">
                    <User className="h-3.5 w-3.5" /> Clientes
                  </Label>
                </div>
                <div className="flex items-center gap-2 flex-1 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="contador" id="t-contador" />
                  <Label htmlFor="t-contador" className="cursor-pointer flex items-center gap-1.5 font-normal">
                    <Building2 className="h-3.5 w-3.5" /> Contadores
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>Validade</Label>
              <RadioGroup value={form.expiresMode} onValueChange={v => set("expiresMode", v as "never" | "date")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="never" id="exp-never" />
                  <Label htmlFor="exp-never" className="cursor-pointer font-normal flex items-center gap-1.5">
                    <Infinity className="h-3.5 w-3.5" /> Indeterminado
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="date" id="exp-date" />
                  <Label htmlFor="exp-date" className="cursor-pointer font-normal flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> Data específica
                  </Label>
                </div>
              </RadioGroup>
              {form.expiresMode === "date" && (
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={e => set("expiresAt", e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  required={form.expiresMode === "date"}
                />
              )}
            </div>

            {/* ── Limite de uso ─────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <Label>Limite de uso</Label>
              <RadioGroup
                value={form.limitMode}
                onValueChange={v => { set("limitMode", v as LimitMode); set("limitValue", ""); }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="none" id="lim-none" />
                  <Label htmlFor="lim-none" className="cursor-pointer font-normal flex items-center gap-1.5">
                    <Infinity className="h-3.5 w-3.5" /> Sem limite — qualquer um pode usar à vontade
                  </Label>
                </div>
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="total" id="lim-total" />
                  <Label htmlFor="lim-total" className="cursor-pointer font-normal flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> Limite total — X usos no total (primeiro a usar aproveita)
                  </Label>
                </div>
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-all">
                  <RadioGroupItem value="per_user" id="lim-per-user" />
                  <Label htmlFor="lim-per-user" className="cursor-pointer font-normal flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Por cadastro — cada cliente/contador usa no máximo X vezes
                  </Label>
                </div>
              </RadioGroup>

              {form.limitMode !== "none" && (
                <div className="pl-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.limitValue}
                    onChange={e => set("limitValue", e.target.value)}
                    placeholder={form.limitMode === "total" ? "Ex: 100 usos no total" : "Ex: 2 usos por pessoa"}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.limitMode === "total"
                      ? "Após esse número de pedidos, o cupom é automaticamente bloqueado para todos."
                      : "Cada CPF/CNPJ cadastrado poderá usar este cupom no máximo esse número de vezes."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch id="active-toggle" checked={form.active} onCheckedChange={v => set("active", v)} />
              <Label htmlFor="active-toggle" className="cursor-pointer">Cupom ativo</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editId ? "Salvar alterações" : "Criar cupom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId !== null && del.mutate({ id: deleteId })}>
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
