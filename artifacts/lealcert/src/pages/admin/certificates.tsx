import { useState } from "react";
import { useListCertificates, useCreateCertificate, useUpdateCertificate, useDeleteCertificate, useGetGarProdutos, useImportSafewebCertificates, useImportGarCertificates, useBatchToggleCertificates, useBatchDeleteCertificates } from "@workspace/api-client-react";
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
import { Plus, Pencil, Trash2, Loader2, Link2, AlertCircle, Users, User, Download, Video, MapPin, RefreshCw, ShieldCheck, Filter, CheckSquare, Square } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiError } from "@/lib/api-error";

const PRODUCT_OPTIONS = ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"];
const ISSUANCE_OPTIONS = ["Presencial", "Videoconferência", "Fast", "Renovação"];
const MODEL_OPTIONS = ["A1", "A3"];

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
  model: string;
};

const EMPTY: CertForm = { name: "", description: "", price: "", priceContador: "", active: true, garHashProduto: "", safewebIdProduto: "", product: "", issuanceType: "", model: "" };

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const NO_GAR = "__none__";

function issuanceBadge(type: string | null | undefined) {
  if (!type) return null;
  if (type === "Videoconferência") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
      <Video className="h-3 w-3" />Vídeo
    </span>
  );
  if (type === "Presencial") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
      <MapPin className="h-3 w-3" />Presencial
    </span>
  );
  if (type === "Renovação") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <RefreshCw className="h-3 w-3" />Renovação
    </span>
  );
  if (type === "Fast") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <ShieldCheck className="h-3 w-3" />Fast
    </span>
  );
  return <span className="text-xs text-muted-foreground">{type}</span>;
}

export default function AdminCertificates() {
  const { toast } = useToast();
  const { data: certs, isLoading, refetch } = useListCertificates();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CertForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  // Filtros
  const [filterProduct, setFilterProduct] = useState("__all__");
  const [filterIssuance, setFilterIssuance] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterProvider, setFilterProvider] = useState("__all__");

  const { data: garTabela, isLoading: garLoading, isError: garError } = useGetGarProdutos();
  const garProdutos = garTabela?.Produtos ?? [];

  const create = useCreateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo criado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const update = useUpdateCertificate({ mutation: { onSuccess: () => { toast({ title: "Modelo atualizado!" }); setOpen(false); refetch(); }, onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const toggleActive = useUpdateCertificate({ mutation: { onSuccess: () => refetch(), onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const batchToggle = useBatchToggleCertificates({ mutation: { onSuccess: () => refetch(), onError: e => toast({ title: "Erro", description: getApiError(e), variant: "destructive" }) } });
  const batchDelete = useBatchDeleteCertificates({
    mutation: {
      onSuccess: (data) => {
        setShowBatchDelete(false);
        setSelectedIds(new Set());
        refetch();
        if (data.skipped > 0) {
          toast({ title: `${data.deleted} excluído(s)`, description: `${data.skipped} não pôde(ram) ser excluído(s) pois possui(em) pedido(s) pago(s).` });
        } else {
          toast({ title: `${data.deleted} modelo(s) excluído(s).` });
        }
      },
      onError: e => toast({ title: "Erro ao excluir", description: getApiError(e), variant: "destructive" }),
    },
  });
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
  const importGar = useImportGarCertificates({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: `Importação GAR concluída`,
          description: `${data.imported} novos, ${data.updated} atualizados (total GAR: ${data.total}).`,
        });
        refetch();
      },
      onError: e => toast({ title: "Erro ao importar GAR", description: getApiError(e), variant: "destructive" }),
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
      model: (c as any).model ?? "",
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
      model: form.model || undefined,
    };
    if (editId !== null) update.mutate({ id: editId, data });
    else create.mutate({ data });
  }

  const isPending = create.isPending || update.isPending;
  const selectedGarProduto = garProdutos.find(p => p.HashProduto === form.garHashProduto);

  // Filtragem
  const filtered = (certs ?? []).filter(c => {
    if (filterProduct !== "__all__" && c.product !== filterProduct) return false;
    if (filterIssuance !== "__all__" && c.issuanceType !== filterIssuance) return false;
    if (filterStatus === "ativo" && !c.active) return false;
    if (filterStatus === "inativo" && c.active) return false;
    if (filterProvider === "gar" && !c.garHashProduto) return false;
    if (filterProvider === "safeweb" && !c.safewebIdProduto) return false;
    if (filterProvider === "sem_gar" && c.garHashProduto) return false;
    if (filterProvider === "sem_safeweb" && c.safewebIdProduto) return false;
    return true;
  });

  const hasFilters = filterProduct !== "__all__" || filterIssuance !== "__all__" || filterStatus !== "__all__" || filterProvider !== "__all__";

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
            onClick={() => importGar.mutate()}
            disabled={importGar.isPending}
            title="Importar produtos do catálogo Gestão AR"
          >
            {importGar.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            <span className="hidden sm:inline">Importar GAR</span>
            <span className="sm:hidden">GAR</span>
          </Button>
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

      {/* Disponibilidade por Produto */}
      {!isLoading && (certs?.length ?? 0) > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b">
            <p className="text-sm font-semibold">Disponibilidade para Clientes</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ative ou desative cada tipo de emissão por produto. Afeta diretamente o formulário de pedidos.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Produto</th>
                  {ISSUANCE_OPTIONS.map(iso => (
                    <th key={iso} className="text-center px-4 py-2 font-medium text-muted-foreground">
                      <div className="flex flex-col items-center gap-1">
                        {iso === "Videoconferência" && <Video className="h-3.5 w-3.5 text-violet-500" />}
                        {iso === "Presencial" && <MapPin className="h-3.5 w-3.5 text-sky-500" />}
                        {iso === "Renovação" && <RefreshCw className="h-3.5 w-3.5 text-amber-500" />}
                        {iso === "Fast" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
                        <span className="text-xs">{iso}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRODUCT_OPTIONS.map(prod => {
                  const hasProd = (certs ?? []).some(c => c.product === prod);
                  if (!hasProd) return null;
                  return (
                    <tr key={prod} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-3 font-semibold text-primary">{prod}</td>
                      {ISSUANCE_OPTIONS.map(iso => {
                        const matching = (certs ?? []).filter(c => c.product === prod && c.issuanceType === iso);
                        const hasAny = matching.length > 0;
                        const allActive = hasAny && matching.every(c => c.active);
                        const someActive = hasAny && matching.some(c => c.active) && !allActive;
                        return (
                          <td key={iso} className="px-4 py-3 text-center">
                            {hasAny ? (
                              <div className="flex flex-col items-center gap-1">
                                <Switch
                                  checked={allActive || someActive}
                                  onCheckedChange={v => batchToggle.mutate({ data: { product: prod, issuanceType: iso, active: v } })}
                                  className={someActive ? "opacity-60" : ""}
                                />
                                <span className="text-[10px] text-muted-foreground">
                                  {allActive ? "Ativo" : someActive ? "Parcial" : "Inativo"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/30 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border rounded-xl">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

        <Select value={filterProduct} onValueChange={setFilterProduct}>
          <SelectTrigger className="h-8 w-36 text-xs bg-background">
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os produtos</SelectItem>
            {PRODUCT_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterIssuance} onValueChange={setFilterIssuance}>
          <SelectTrigger className="h-8 w-44 text-xs bg-background">
            <SelectValue placeholder="Tipo de emissão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as emissões</SelectItem>
            {ISSUANCE_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-32 text-xs bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Ativo e inativo</SelectItem>
            <SelectItem value="ativo">Somente ativos</SelectItem>
            <SelectItem value="inativo">Somente inativos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="h-8 w-40 text-xs bg-background">
            <SelectValue placeholder="Provedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os provedores</SelectItem>
            <SelectItem value="gar">Com GAR</SelectItem>
            <SelectItem value="safeweb">Com Safeweb</SelectItem>
            <SelectItem value="sem_gar">Sem GAR</SelectItem>
            <SelectItem value="sem_safeweb">Sem Safeweb</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
            onClick={() => { setFilterProduct("__all__"); setFilterIssuance("__all__"); setFilterStatus("__all__"); setFilterProvider("__all__"); }}>
            Limpar filtros
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {certs?.length ?? 0} modelos
        </span>
      </div>

      {/* Barra de seleção em lote */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border rounded-lg">
          <Checkbox
            id="select-all"
            checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
            onCheckedChange={v => {
              if (v) setSelectedIds(new Set(filtered.map(c => c.id)));
              else setSelectedIds(new Set());
            }}
          />
          <label htmlFor="select-all" className="text-sm cursor-pointer select-none">
            {selectedIds.size > 0
              ? `${selectedIds.size} selecionado(s)`
              : "Selecionar todos"}
          </label>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => setShowBatchDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Excluir {selectedIds.size} selecionado(s)
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-10 text-muted-foreground">Carregando...</div>
        ) : !filtered.length ? (
          <div className="col-span-full text-center py-10 text-muted-foreground">
            {hasFilters ? "Nenhum modelo encontrado com esses filtros." : "Nenhum modelo cadastrado."}
          </div>
        ) : filtered.map(c => (
          <Card key={c.id} className={`transition-opacity relative ${!c.active ? "opacity-55" : ""} ${selectedIds.has(c.id) ? "ring-2 ring-primary" : ""}`}>
            {/* Checkbox de seleção */}
            <div className="absolute top-3 left-3 z-10">
              <Checkbox
                checked={selectedIds.has(c.id)}
                onCheckedChange={v => {
                  setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (v) next.add(c.id); else next.delete(c.id);
                    return next;
                  });
                }}
              />
            </div>
            <CardContent className="pt-5 pb-4 pl-9">
              {/* Header: nome + toggle ativo */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                  {c.validityMonths ? (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">{c.validityMonths} meses de validade</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Switch
                    checked={c.active}
                    onCheckedChange={v => toggleActive.mutate({ id: c.id, data: { active: v } })}
                    title={c.active ? "Clique para inativar" : "Clique para ativar"}
                  />
                  <span className="text-[10px] text-muted-foreground">{c.active ? "Ativo" : "Inativo"}</span>
                </div>
              </div>

              {/* Badges de modalidade */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.product && (
                  <span className="inline-flex items-center text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                    {c.product}
                  </span>
                )}
                {(c as any).model && (
                  <span className={`inline-flex items-center text-xs font-semibold rounded-full px-2 py-0.5 border ${(c as any).model === "A3" ? "text-purple-700 bg-purple-50 border-purple-200" : "text-orange-700 bg-orange-50 border-orange-200"}`}>
                    {(c as any).model}
                  </span>
                )}
                {issuanceBadge(c.issuanceType)}
                {c.safewebIdProduto && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                    <ShieldCheck className="h-3 w-3" />SafeID #{c.safewebIdProduto}
                  </span>
                )}
                {c.garHashProduto && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <Link2 className="h-3 w-3" />GAR
                  </span>
                )}
                {!c.garHashProduto && !c.safewebIdProduto && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertCircle className="h-3 w-3" />Sem provedor
                  </span>
                )}
              </div>

              {/* Preços */}
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

              {/* Ações */}
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

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select value={form.model || "__none__"} onValueChange={v => set("model", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Não classificado —</SelectItem>
                  {MODEL_OPTIONS.map(m => (
                    <SelectItem key={m} value={m}>
                      {m === "A1" ? "A1 — Arquivo digital (software)" : "A3 — Token / Cartão físico"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A1 geralmente tem validade de 1 ano. A3 pode ter 1, 2 ou 3 anos. O chat filtra as opções com base neste campo.</p>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => set("active", v)} id="active" />
              <Label htmlFor="active">Disponível para venda</Label>
            </div>

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

      {/* Diálogo de exclusão em lote */}
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} modelo(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Modelos com pedidos pagos <strong>não serão excluídos</strong> e você será informado quantos foram pulados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDelete.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchDelete.isPending}
              onClick={() => batchDelete.mutate({ data: { ids: Array.from(selectedIds) } })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchDelete.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
