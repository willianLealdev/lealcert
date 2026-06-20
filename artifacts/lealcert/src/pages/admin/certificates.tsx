import { useState } from "react";
import { useListCertificates, useCreateCertificate, useUpdateCertificate, useDeleteCertificate, useGetGarProdutos, useImportSafewebCertificates } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Link2, AlertCircle, Users, User, Download } from "lucide-react";
import { getApiError } from "@/lib/api-error";

const PRODUCT_OPTIONS = ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"];
const ISSUANCE_OPTIONS = ["Presencial", "Videoconferência", "Fast", "Renovação"];

type CertForm = {
  name: string;
  description: string;
  price: string;
  priceContador: string;
  active: boolean;
  garHashProduto: string;
  safewebIdProduto: string;
  product: string;
  issuanceType: string;
};

const EMPTY: CertForm = { name: "", description: "", price: "", priceContador: "", active: true, garHashProduto: "", safewebIdProduto: "", product: "", issuanceType: "" };

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const NO_GAR = "__none__";

export default function AdminCertificates() {
  const { toast } = useToast();
  const { data: certs, isLoading, refetch } = useListCertificates();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CertForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: garTabela, isLoading: garLoading, isError: garError } = useGetGarProdutos();
  const garProdutos = garTabela?.Produtos ?? [];

  const create = useCreateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const update = useUpdateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const del = useDeleteCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo removido." }); setDeleteId(null); refetch(); } } });
  const importSafeweb = useImportSafewebCertificates({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: `Importação concluída`,
          description: `${data.imported} novos produtos importados, ${data.skipped} já existentes (total Safeweb: ${data.total}).`,
        });
        refetch();
      },
      onError: e => toast({ title: "Erro ao importar", description: getApiError(e), variant: "destructive" }),
    },
  });

  function openCreate() { setForm(EMPTY); setEditId(null); setOpen(true); }
  function openEdit(c: NonNullable<typeof certs>[number]) {
    setForm({
      name: c.name,
      description: c.description ?? "",
      price: String(c.price),
      priceContador: c.priceContador != null ? String(c.priceContador) : "",
      active: c.active,
      garHashProduto: c.garHashProduto ?? "",
      safewebIdProduto: c.safewebIdProduto ?? "",
      product: c.product ?? "",
      issuanceType: c.issuanceType ?? "",
    });
    setEditId(c.id);
    setOpen(true);
  }
  function set(k: keyof CertForm, v: string | boolean) { setForm(p => ({ ...p, [k]: v })); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      priceContador: form.priceContador ? parseFloat(form.priceContador) : undefined,
      active: form.active,
      garHashProduto: form.garHashProduto || undefined,
      safewebIdProduto: form.safewebIdProduto || undefined,
      product: form.product || undefined,
      issuanceType: form.issuanceType || undefined,
    };
    if (editId !== null) update.mutate({ id: editId, data });
    else create.mutate({ data });
  }

  const isPending = create.isPending || update.isPending;
  const selectedGarProduto = garProdutos.find(p => p.HashProduto === form.garHashProduto);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Modelos e preços dos certificados.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => importSafeweb.mutate()}
            disabled={importSafeweb.isPending}
            title="Importar produtos do catálogo Safeweb"
          >
            {importSafeweb.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            <span className="hidden sm:inline">Importar Safeweb</span>
            <span className="sm:hidden">Safeweb</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Novo Modelo</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
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
                  {c.validityMonths ? (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">{c.validityMonths} meses de validade</p>
                  ) : null}
                </div>
                <Badge variant={c.active ? "default" : "secondary"} className="shrink-0">
                  {c.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.garHashProduto ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <Link2 className="h-3 w-3" />GAR
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertCircle className="h-3 w-3" />Sem GAR
                  </span>
                )}
                {c.safewebIdProduto ? (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                    <Link2 className="h-3 w-3" />Safeweb #{c.safewebIdProduto}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                    <AlertCircle className="h-3 w-3" />Sem Safeweb
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />Cliente
                  </span>
                  <span className="text-lg font-bold text-primary">{formatBRL(c.price)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />Contador
                  </span>
                  <span className={`text-lg font-bold ${c.priceContador != null ? "text-emerald-600" : "text-muted-foreground/50"}`}>
                    {c.priceContador != null ? formatBRL(c.priceContador) : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground mb-1">Preços por tipo de cliente</p>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Preço Cliente (R$) *
                </Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={e => set("price", e.target.value)} required placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Users className="h-3.5 w-3.5 text-emerald-600" />
                  Preço Contador (R$)
                  <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input type="number" step="0.01" min="0" value={form.priceContador} onChange={e => set("priceContador", e.target.value)} placeholder="Deixe vazio para usar preço cliente" />
                <p className="text-xs text-muted-foreground">Se preenchido, contadores verão este valor. Clientes sempre veem o Preço Cliente.</p>
              </div>
            </div>

            {/* Produto e Emissão */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={form.product || "__none__"} onValueChange={v => set("product", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Não classificado —</SelectItem>
                    {PRODUCT_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Emissão</Label>
                <Select value={form.issuanceType || "__none__"} onValueChange={v => set("issuanceType", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Não classificado —</SelectItem>
                    {ISSUANCE_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => set("active", v)} id="active" />
              <Label htmlFor="active">Disponível para venda</Label>
            </div>

            {/* Vínculo Gestão AR */}
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Produto na Gestão AR
              </Label>
              {garError ? (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Não foi possível carregar os produtos da GAR. Configure as credenciais em <strong>Configurações</strong> primeiro.
                </div>
              ) : garLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando produtos da Gestão AR...
                </div>
              ) : !garProdutos.length ? (
                <div className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
                  Nenhum produto encontrado na GAR. Verifique as credenciais em Configurações.
                </div>
              ) : (
                <Select value={form.garHashProduto || NO_GAR} onValueChange={v => set("garHashProduto", v === NO_GAR ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto correspondente na GAR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GAR}>— Sem vínculo GAR —</SelectItem>
                    {garProdutos.map(p => (
                      <SelectItem key={p.HashProduto} value={p.HashProduto}>
                        {p.Nome} — {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.ValorVenda)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedGarProduto && (
                <div className="text-xs text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2 space-y-0.5">
                  <p><span className="font-medium">Tipo:</span> {selectedGarProduto.TipoProdutoDescricao ?? selectedGarProduto.TipoProduto}</p>
                  <p><span className="font-medium">Emissão:</span> {selectedGarProduto.TipoEmissaoDescricao ?? selectedGarProduto.TipoEmissao}</p>
                  <p><span className="font-medium">Validade:</span> {selectedGarProduto.Validade} meses</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Quando vinculado, o registro na Gestão AR é feito <strong>automaticamente</strong> após o pagamento.
              </p>
            </div>

            {/* Vínculo Safeweb */}
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-600" />
                ID do Produto na Safeweb
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                value={form.safewebIdProduto}
                onChange={e => set("safewebIdProduto", e.target.value.replace(/\D/g, ""))}
                placeholder="Ex: 42 (ID numérico na Safeweb)"
              />
              <p className="text-xs text-muted-foreground">
                O ID do produto na Safeweb pode ser consultado pelo endpoint <strong>GET /safeweb/produtos</strong> ou no painel Safeweb.
                Quando preenchido, a solicitação é criada <strong>automaticamente</strong> após o pagamento (provedor ativo: Safeweb).
              </p>
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
