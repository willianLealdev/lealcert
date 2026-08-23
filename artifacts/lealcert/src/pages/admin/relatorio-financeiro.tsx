import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  CreditCard,
  Building2,
  Calculator,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CertTier {
  id: number;
  minQty: number;
  maxQty: number | null;
  pricePerCert: string;
}

interface PaymentFee {
  id: number;
  method: string;
  fixedFee: string;
  percentFee: string;
}

interface ExtraCost {
  id: number;
  name: string;
  amount: string;
  period: "daily" | "monthly" | "annual";
  active: boolean;
}

interface ReportData {
  period: { from: string; to: string; days: number };
  totalOrders: number;
  grossRevenue: number;
  certTierUsed: { id: number; minQty: number; maxQty: number | null; pricePerCert: number } | null;
  certCost: number;
  totalPaymentFees: number;
  extraCostsPeriod: number;
  extraCostsDetail: { id: number; name: string; amount: number; period: string; periodCost: number }[];
  netProfit: number;
  byPaymentMethod: { method: string; count: number; revenue: number; fees: number; net: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const methodLabel: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  cortesia: "Cortesia",
  sem_metodo: "Sem método",
};

const periodLabel: Record<string, string> = {
  daily: "Diário",
  monthly: "Mensal",
  annual: "Anual",
};

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon: Icon,
  color = "default",
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color?: "default" | "green" | "red" | "amber" | "blue";
  subtitle?: string;
}) {
  const colorMap = {
    default: "text-muted-foreground",
    green: "text-emerald-600",
    red: "text-red-500",
    amber: "text-amber-600",
    blue: "text-blue-600",
  };
  const bgMap = {
    default: "bg-muted/50",
    green: "bg-emerald-50",
    red: "bg-red-50",
    amber: "bg-amber-50",
    blue: "bg-blue-50",
  };
  return (
    <Card className={color !== "default" ? `border-${color === "green" ? "emerald" : color}-200` : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`rounded-full p-2 ${bgMap[color]}`}>
            <Icon className={`h-5 w-5 ${colorMap[color]}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminRelatorioFinanceiro() {
  const { toast } = useToast();

  // Date range
  const def = getDefaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  // Data
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [certTiers, setCertTiers] = useState<CertTier[]>([]);
  const [paymentFees, setPaymentFees] = useState<PaymentFee[]>([]);
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Dialog — Cert Tier
  const [tierDialog, setTierDialog] = useState<{ open: boolean; editing: CertTier | null }>({ open: false, editing: null });
  const [tierForm, setTierForm] = useState({ minQty: "", maxQty: "", pricePerCert: "" });

  // Dialog — Extra Cost
  const [costDialog, setCostDialog] = useState<{ open: boolean; editing: ExtraCost | null }>({ open: false, editing: null });
  const [costForm, setCostForm] = useState({ name: "", amount: "", period: "monthly" as "daily" | "monthly" | "annual", active: true });

  // Payment fees inline editing
  const [feeSaving, setFeeSaving] = useState<Record<string, boolean>>({});

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/admin/relatorio/resumo?from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setReport(await res.json());
    } catch {
      toast({ title: "Erro ao carregar relatório", variant: "destructive" });
    } finally {
      setReportLoading(false);
    }
  }, [from, to, toast]);

  const fetchConfig = useCallback(async () => {
    const [t, f, e] = await Promise.all([
      fetch("/api/admin/relatorio/cert-tiers", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/relatorio/payment-fees", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/relatorio/extra-costs", { credentials: "include" }).then((r) => r.json()),
    ]);
    setCertTiers(t);
    setPaymentFees(f);
    setExtraCosts(e);
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Date presets ───────────────────────────────────────────────────────────

  function applyPreset(preset: "thisMonth" | "lastMonth" | "last3" | "thisYear") {
    const now = new Date();
    if (preset === "thisMonth") {
      setFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setTo(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else if (preset === "lastMonth") {
      setFrom(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10));
      setTo(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10));
    } else if (preset === "last3") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      setFrom(d.toISOString().slice(0, 10));
      setTo(now.toISOString().slice(0, 10));
    } else if (preset === "thisYear") {
      setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setTo(new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10));
    }
  }

  // ── Cert Tier CRUD ─────────────────────────────────────────────────────────

  function openTierDialog(tier?: CertTier) {
    if (tier) {
      setTierForm({ minQty: String(tier.minQty), maxQty: tier.maxQty != null ? String(tier.maxQty) : "", pricePerCert: tier.pricePerCert });
      setTierDialog({ open: true, editing: tier });
    } else {
      setTierForm({ minQty: "", maxQty: "", pricePerCert: "" });
      setTierDialog({ open: true, editing: null });
    }
  }

  async function saveTier() {
    const body = {
      minQty: Number(tierForm.minQty),
      maxQty: tierForm.maxQty.trim() !== "" ? Number(tierForm.maxQty) : null,
      pricePerCert: tierForm.pricePerCert,
    };
    const url = tierDialog.editing ? `/api/admin/relatorio/cert-tiers/${tierDialog.editing.id}` : "/api/admin/relatorio/cert-tiers";
    const method = tierDialog.editing ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { toast({ title: "Erro ao salvar faixa", variant: "destructive" }); return; }
    setTierDialog({ open: false, editing: null });
    fetchConfig();
    fetchReport();
  }

  async function deleteTier(id: number) {
    if (!confirm("Remover esta faixa?")) return;
    await fetch(`/api/admin/relatorio/cert-tiers/${id}`, { method: "DELETE", credentials: "include" });
    fetchConfig();
    fetchReport();
  }

  // ── Payment Fees ───────────────────────────────────────────────────────────

  function updateFeeLocal(method: string, field: "fixedFee" | "percentFee", value: string) {
    setPaymentFees((prev) => prev.map((f) => f.method === method ? { ...f, [field]: value } : f));
  }

  async function saveFee(method: string) {
    setFeeSaving((p) => ({ ...p, [method]: true }));
    const fee = paymentFees.find((f) => f.method === method);
    if (!fee) return;
    await fetch(`/api/admin/relatorio/payment-fees/${method}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixedFee: fee.fixedFee, percentFee: fee.percentFee }),
    });
    setFeeSaving((p) => ({ ...p, [method]: false }));
    toast({ title: "Taxa salva!" });
    fetchReport();
  }

  // ── Extra Costs CRUD ───────────────────────────────────────────────────────

  function openCostDialog(cost?: ExtraCost) {
    if (cost) {
      setCostForm({ name: cost.name, amount: cost.amount, period: cost.period, active: cost.active });
      setCostDialog({ open: true, editing: cost });
    } else {
      setCostForm({ name: "", amount: "", period: "monthly", active: true });
      setCostDialog({ open: true, editing: null });
    }
  }

  async function saveCost() {
    const body = { ...costForm, amount: costForm.amount };
    const url = costDialog.editing ? `/api/admin/relatorio/extra-costs/${costDialog.editing.id}` : "/api/admin/relatorio/extra-costs";
    const method = costDialog.editing ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { toast({ title: "Erro ao salvar custo", variant: "destructive" }); return; }
    setCostDialog({ open: false, editing: null });
    fetchConfig();
    fetchReport();
  }

  async function deleteCost(id: number) {
    if (!confirm("Remover este custo?")) return;
    await fetch(`/api/admin/relatorio/extra-costs/${id}`, { method: "DELETE", credentials: "include" });
    fetchConfig();
    fetchReport();
  }

  async function toggleCostActive(cost: ExtraCost) {
    await fetch(`/api/admin/relatorio/extra-costs/${cost.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cost, amount: cost.amount, active: !cost.active }),
    });
    fetchConfig();
    fetchReport();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const profit = report?.netProfit ?? 0;
  const profitColor = profit >= 0 ? "green" : "red";

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" />
          Relatório Financeiro
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Balanço completo de vendas, custos e lucro. Acesso exclusivo ao administrador.</p>
      </div>

      <Tabs defaultValue="relatorio">
        <TabsList className="mb-2">
          <TabsTrigger value="relatorio">📊 Relatório</TabsTrigger>
          <TabsTrigger value="config">⚙️ Configurações</TabsTrigger>
        </TabsList>

        {/* ══════════════════ ABA RELATÓRIO ══════════════════ */}
        <TabsContent value="relatorio" className="space-y-5">

          {/* Filtro de data */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex gap-1.5">
                  {[
                    { label: "Este mês", preset: "thisMonth" as const },
                    { label: "Mês passado", preset: "lastMonth" as const },
                    { label: "Últimos 3 meses", preset: "last3" as const },
                    { label: "Este ano", preset: "thisYear" as const },
                  ].map(({ label, preset }) => (
                    <Button key={preset} variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-end gap-2 ml-auto">
                  <div>
                    <Label className="text-xs text-muted-foreground">De</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Até</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
                  </div>
                  <Button size="sm" onClick={fetchReport} disabled={reportLoading}>
                    {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-1">Atualizar</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {reportLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando relatório...
            </div>
          )}

          {report && !reportLoading && (
            <>
              {/* Cards de resumo */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <SummaryCard
                  title="Receita Bruta"
                  value={brl(report.grossRevenue)}
                  icon={DollarSign}
                  color="blue"
                  subtitle={`${report.totalOrders} pedido${report.totalOrders !== 1 ? "s" : ""}`}
                />
                <SummaryCard
                  title="Custo Certificados"
                  value={brl(report.certCost)}
                  icon={Package}
                  color="amber"
                  subtitle={
                    report.certTierUsed
                      ? `${brl(report.certTierUsed.pricePerCert)}/cert (faixa ${report.certTierUsed.minQty}${report.certTierUsed.maxQty ? `–${report.certTierUsed.maxQty}` : "+"})`
                      : "Sem faixa configurada"
                  }
                />
                <SummaryCard
                  title="Taxas de Pagamento"
                  value={brl(report.totalPaymentFees)}
                  icon={CreditCard}
                  color="amber"
                  subtitle="Pix + Boleto + Cartão"
                />
                <SummaryCard
                  title="Custos Adicionais"
                  value={brl(report.extraCostsPeriod)}
                  icon={Building2}
                  color="amber"
                  subtitle={`${report.period.days} dias rateados`}
                />
                <SummaryCard
                  title="Lucro Líquido"
                  value={brl(profit)}
                  icon={profit >= 0 ? TrendingUp : TrendingDown}
                  color={profitColor}
                  subtitle={
                    report.grossRevenue > 0
                      ? `Margem: ${((profit / report.grossRevenue) * 100).toFixed(1)}%`
                      : undefined
                  }
                />
              </div>

              {/* Sem dados */}
              {report.totalOrders === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Nenhum pedido pago encontrado neste período.</p>
                </div>
              )}

              {report.totalOrders > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                  {/* Breakdown por método de pagamento */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Vendas por Método de Pagamento</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Método</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Receita</TableHead>
                            <TableHead className="text-right">Taxas</TableHead>
                            <TableHead className="text-right">Líquido</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.byPaymentMethod.map((row) => (
                            <TableRow key={row.method}>
                              <TableCell>
                                <Badge variant="outline">{methodLabel[row.method] ?? row.method}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{row.count}</TableCell>
                              <TableCell className="text-right">{brl(row.revenue)}</TableCell>
                              <TableCell className="text-right text-amber-700">−{brl(row.fees)}</TableCell>
                              <TableCell className="text-right font-semibold">{brl(row.net)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold bg-muted/30">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{report.totalOrders}</TableCell>
                            <TableCell className="text-right">{brl(report.grossRevenue)}</TableCell>
                            <TableCell className="text-right text-amber-700">−{brl(report.totalPaymentFees)}</TableCell>
                            <TableCell className="text-right">{brl(report.grossRevenue - report.totalPaymentFees)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Custos adicionais no período */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Custos Adicionais no Período</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {/* Custo certificados */}
                      <div className="flex justify-between text-sm py-1.5 border-b">
                        <span className="text-muted-foreground">
                          Certificados ({report.totalOrders} × {report.certTierUsed ? brl(report.certTierUsed.pricePerCert) : "—"})
                        </span>
                        <span className="font-medium text-amber-700">−{brl(report.certCost)}</span>
                      </div>
                      {/* Extra costs */}
                      {report.extraCostsDetail.map((ec) => (
                        <div key={ec.id} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                          <span className="text-muted-foreground">
                            {ec.name}
                            <span className="text-xs ml-1 opacity-60">({periodLabel[ec.period] ?? ec.period})</span>
                          </span>
                          <span className="font-medium text-amber-700">−{brl(ec.periodCost)}</span>
                        </div>
                      ))}
                      {report.extraCostsDetail.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Nenhum custo adicional configurado.</p>
                      )}
                      <div className="flex justify-between text-sm pt-2 font-bold">
                        <span>Total custos</span>
                        <span className="text-amber-700">−{brl(report.certCost + report.extraCostsPeriod)}</span>
                      </div>
                      <div className={`flex justify-between text-sm pt-1 font-bold border-t ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        <span>Lucro líquido</span>
                        <span>{brl(profit)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ══════════════════ ABA CONFIGURAÇÕES ══════════════════ */}
        <TabsContent value="config" className="space-y-6">

          {/* ── Tabela de Faixas de Certificado ── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    Custo por Certificado — Faixas Progressivas
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Preço flat por faixa: o custo total é quantidade × preço da faixa atingida no período.
                  </p>
                </div>
                <Button size="sm" onClick={() => openTierDialog()}>
                  <Plus className="h-4 w-4 mr-1" /> Nova faixa
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {certTiers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma faixa configurada.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>De (qtd)</TableHead>
                      <TableHead>Até (qtd)</TableHead>
                      <TableHead>Preço por certificado</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certTiers.map((tier) => (
                      <TableRow key={tier.id}>
                        <TableCell>{tier.minQty}</TableCell>
                        <TableCell>{tier.maxQty != null ? tier.maxQty : <span className="text-muted-foreground italic">ilimitado</span>}</TableCell>
                        <TableCell className="font-semibold">{brl(parseFloat(tier.pricePerCert))}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTierDialog(tier)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteTier(tier.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Taxas de Pagamento ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" />
                Taxas por Método de Pagamento
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Abatidas de cada venda. Valor fixo (R$) + percentual (%) aplicados sobre o total da venda.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["pix", "boleto", "cartao", "cortesia"].map((method) => {
                  const fee = paymentFees.find((f) => f.method === method) ?? { method, fixedFee: "0", percentFee: "0", id: 0 };
                  return (
                    <div key={method} className="grid grid-cols-[120px_1fr_1fr_auto] gap-3 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">Método</Label>
                        <div className="h-9 flex items-center">
                          <Badge variant="outline" className="text-sm">{methodLabel[method]}</Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Valor fixo (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-9"
                          value={fee.fixedFee}
                          onChange={(e) => updateFeeLocal(method, "fixedFee", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Percentual (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="h-9"
                          value={fee.percentFee}
                          onChange={(e) => updateFeeLocal(method, "percentFee", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => saveFee(method)} disabled={feeSaving[method]}>
                        {feeSaving[method] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        <span className="ml-1">Salvar</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Custos Adicionais ── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-purple-600" />
                    Custos Adicionais
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sistema, servidor, banco de dados, etc. Rateados pelo período selecionado no relatório.
                  </p>
                </div>
                <Button size="sm" onClick={() => openCostDialog()}>
                  <Plus className="h-4 w-4 mr-1" /> Novo custo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {extraCosts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum custo adicional cadastrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Recorrência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extraCosts.map((cost) => (
                      <TableRow key={cost.id} className={!cost.active ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{cost.name}</TableCell>
                        <TableCell>{brl(parseFloat(cost.amount))}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{periodLabel[cost.period] ?? cost.period}</Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleCostActive(cost)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                              cost.active
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {cost.active ? "Ativo" : "Inativo"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCostDialog(cost)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteCost(cost.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Faixa de Certificado ── */}
      <Dialog open={tierDialog.open} onOpenChange={(o) => setTierDialog((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tierDialog.editing ? "Editar Faixa" : "Nova Faixa de Certificado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Quantidade mínima</Label>
              <Input type="number" min="0" value={tierForm.minQty} onChange={(e) => setTierForm((p) => ({ ...p, minQty: e.target.value }))} placeholder="ex: 1" />
            </div>
            <div>
              <Label>Quantidade máxima <span className="text-muted-foreground text-xs">(deixe vazio = ilimitado)</span></Label>
              <Input type="number" min="0" value={tierForm.maxQty} onChange={(e) => setTierForm((p) => ({ ...p, maxQty: e.target.value }))} placeholder="ex: 100" />
            </div>
            <div>
              <Label>Preço por certificado (R$)</Label>
              <Input type="number" step="0.01" min="0" value={tierForm.pricePerCert} onChange={(e) => setTierForm((p) => ({ ...p, pricePerCert: e.target.value }))} placeholder="ex: 55.00" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTierDialog({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={saveTier}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Custo Adicional ── */}
      <Dialog open={costDialog.open} onOpenChange={(o) => setCostDialog((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{costDialog.editing ? "Editar Custo" : "Novo Custo Adicional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição</Label>
              <Input value={costForm.name} onChange={(e) => setCostForm((p) => ({ ...p, name: e.target.value }))} placeholder="ex: Servidor VPS" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={costForm.amount} onChange={(e) => setCostForm((p) => ({ ...p, amount: e.target.value }))} placeholder="ex: 150.00" />
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={costForm.period} onValueChange={(v) => setCostForm((p) => ({ ...p, period: v as "daily" | "monthly" | "annual" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cost-active"
                checked={costForm.active}
                onChange={(e) => setCostForm((p) => ({ ...p, active: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="cost-active">Ativo (incluir no cálculo)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCostDialog({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={saveCost}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
