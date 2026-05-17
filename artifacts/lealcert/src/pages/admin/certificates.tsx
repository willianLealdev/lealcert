import { useState } from "react";
import { useListCertificates, useCreateCertificate, useUpdateCertificate, useDeleteCertificate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type CertForm = { name: string; description: string; price: string; active: boolean };
const EMPTY: CertForm = { name: "", description: "", price: "", active: true };

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function apiErr(e: unknown) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Erro inesperado.";
}

export default function AdminCertificates() {
  const { toast } = useToast();
  const { data: certs, isLoading, refetch } = useListCertificates();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CertForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const create = useCreateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: apiErr(e), variant: "destructive" }) } });
  const update = useUpdateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: apiErr(e), variant: "destructive" }) } });
  const del = useDeleteCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo removido." }); setDeleteId(null); refetch(); } } });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(c: NonNullable<typeof certs>[number]) {
    setForm({ name: c.name, description: c.description ?? "", price: String(c.price), active: c.active });
    setEditId(c.id);
    setOpen(true);
  }
  function set(k: keyof CertForm, v: string | boolean) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const data = { name: form.name, description: form.description, price: parseFloat(form.price), active: form.active };
    if (editId !== null) update.mutate({ id: editId, data });
    else create.mutate({ data });
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de Certificados</h1>
          <p className="text-muted-foreground">Defina os modelos e preços dos certificados disponíveis.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo Modelo</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-10 text-muted-foreground">Carregando...</div>
        ) : !certs?.length ? (
          <div className="col-span-full text-center py-10 text-muted-foreground">Nenhum modelo cadastrado.</div>
        ) : certs.map(c => (
          <Card key={c.id} className={!c.active ? "opacity-60" : ""}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                </div>
                <Badge variant={c.active ? "default" : "secondary"} className="shrink-0">
                  {c.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xl font-bold text-primary">{formatBRL(c.price)}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Editar Modelo" : "Novo Modelo"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} required placeholder="Ex: e-CPF A1 (1 ano)" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Descrição do certificado..." />
            </div>
            <div className="space-y-2">
              <Label>Preço (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.price} onChange={e => set("price", e.target.value)} required placeholder="0,00" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => set("active", v)} id="active" />
              <Label htmlFor="active">Disponível para venda</Label>
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
            <AlertDialogTitle>Remover modelo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && del.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
