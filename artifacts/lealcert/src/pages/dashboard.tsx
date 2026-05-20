import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetAdminStats, useGetMeStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── helpers ─────────────────────────────────────────────────────────────────
function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDay(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

const STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  pending_payment: "Ag. Pagamento",
  paid: "Pago",
  protocol_assigned: "Protocolo",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const CHART_COLORS = [
  "#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7",
];

const TIER_STYLE: Record<string, string> = {
  gold: "bg-yellow-500 text-black",
  vip:  "bg-blue-600 text-white",
  top:  "bg-emerald-600 text-white",
};

// ─── range selector ───────────────────────────────────────────────────────────
type Range = "today" | "7d" | "15d" | "30d" | "90d" | "custom";

interface RangeState { range: Range; from: string; to: string }

function RangeBar({ value, onChange }: { value: RangeState; onChange: (v: RangeState) => void }) {
  const isCustom = value.range === "custom";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.range}
        onChange={e => onChange({ ...value, range: e.target.value as Range })}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="today">Hoje</option>
        <option value="7d">7 dias</option>
        <option value="15d">15 dias</option>
        <option value="30d">30 dias</option>
        <option value="90d">3 meses</option>
        <option value="custom">Personalizado</option>
      </select>
      {isCustom && (
        <>
          <Input
            type="date"
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="h-9 w-32 sm:w-36 text-sm"
            placeholder="De"
          />
          <Input
            type="date"
            value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="h-9 w-32 sm:w-36 text-sm"
            placeholder="Até"
          />
        </>
      )}
    </div>
  );
}

// ─── stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── chart card ───────────────────────────────────────────────────────────────
function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`shadow-sm ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard() {
  const [rng, setRng] = useState<RangeState>({ range: "30d", from: "", to: "" });
  const [applied, setApplied] = useState<RangeState>({ range: "30d", from: "", to: "" });

  const { data: stats, isLoading } = useGetAdminStats({
    range: applied.range,
    ...(applied.range === "custom" ? { from: applied.from, to: applied.to } : {}),
  });

  function apply() { setApplied({ ...rng }); }

  if (isLoading || !stats) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground">Carregando...</div>;
  }

  const { cards, revenue, users_per_day, orders_per_day, models_breakdown,
          status_breakdown, geo_states, top_buyers_period, revenue12, tiers_all_time, meta } = stats;

  // chart data transformations
  const ordersChartData = orders_per_day.map(x => ({ d: fmtDay(x.d), c: x.c }));
  const usersChartData  = users_per_day.map(x => ({ d: fmtDay(x.d), c: x.c }));
  const statusChartData = status_breakdown.map(x => ({ name: STATUS_LABEL[x.label] ?? x.label, c: x.c }));
  const rev12Data = revenue12.labels.map((l, i) => ({ l, v: revenue12.values[i], c: revenue12.counts[i] }));

  return (
    <div className="space-y-6">
      {/* Header + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard — Admin</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeBar value={rng} onChange={setRng} />
          <Button size="sm" onClick={apply}>Aplicar</Button>
        </div>
      </div>

      {/* Row 1 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Contadores (total)"        value={cards.total_users} />
        <StatCard label="Novos cadastros (período)" value={cards.new_users} />
        <StatCard label="Pedidos (período)"         value={cards.orders_period} />
        <StatCard label="Contadores que compraram"  value={cards.buyers_period} />
      </div>

      {/* Row 2 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Aguardando pagamento" value={cards.pending_period} />
        <StatCard label="Pagos"                value={cards.paid_period} />
        <StatCard label="Com protocolo"        value={cards.protocol_period} />
      </div>

      {/* Row 3 cards — revenue */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Vendas Hoje"   value={brl(revenue.today)} />
        <StatCard label="Vendas no Mês" value={brl(revenue.month)} />
        <StatCard label="Vendas Totais" value={brl(revenue.all)} />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Cadastros por dia">
          {usersChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={usersChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "Cadastros"]} />
                <Line type="monotone" dataKey="c" stroke="#2563eb" strokeWidth={2} dot={false} name="Cadastros" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Pedidos por dia">
          {ordersChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ordersChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "Pedidos"]} />
                <Line type="monotone" dataKey="c" stroke="#f59e0b" strokeWidth={2} dot={false} name="Pedidos" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Tipos de Certificado (pagos/protocolo)">
          {models_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={models_breakdown} dataKey="c" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {models_breakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [v, name]} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Pedidos por Status (período)">
          {statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="c" name="Qtd" radius={[4, 4, 0, 0]}>
                  {statusChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Revenue 12 months */}
      <ChartCard title="Faturamento — últimos 12 meses">
        {rev12Data.some(d => d.v > 0 || d.c > 0) ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={rev12Data} margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="l" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v, name) => name === "Faturamento (R$)" ? [brl(Number(v)), name] : [v, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="v" name="Faturamento (R$)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="c" name="Certificados" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">Barras: R$ faturado | Linha: quantidade de certificados</p>
          </>
        ) : <EmptyChart />}
      </ChartCard>

      {/* Charts row 3 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Distribuição por Estado (Top 12)">
          {geo_states.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={geo_states} dataKey="c" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {geo_states.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Top compradores no período (Top 10)">
          {top_buyers_period.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={top_buyers_period} layout="vertical" margin={{ top: 0, right: 10, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                <Tooltip formatter={(v) => [v, "Pedidos"]} />
                <Bar dataKey="c" name="Pedidos" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Tiers table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Ranking por fidelidade (lifetime) — Top / VIP / Gold</CardTitle>
        </CardHeader>
        <CardContent>
          {tiers_all_time.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Contador</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium hidden md:table-cell">CPF/CNPJ</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Pedidos</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium hidden sm:table-cell">Última compra</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers_all_time.map((r, i) => (
                    <tr key={r.uid} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3 font-medium">{r.name}</td>
                      <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{r.doc}</td>
                      <td className="py-2 px-3">{r.c}</td>
                      <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">{r.last || "—"}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${TIER_STYLE[r.tier] ?? "bg-muted"}`}>
                          {r.tier}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">
                Regras: TOP ≥ {meta.tiers.top}, VIP ≥ {meta.tiers.vip}, GOLD ≥ {meta.tiers.gold} compras (lifetime).
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Nenhum comprador ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CONTADOR DASHBOARD ───────────────────────────────────────────────────────
function ContadorDashboard() {
  const [rng, setRng] = useState<RangeState>({ range: "30d", from: "", to: "" });
  const [applied, setApplied] = useState<RangeState>({ range: "30d", from: "", to: "" });

  const { data: stats, isLoading } = useGetMeStats({
    range: applied.range,
    ...(applied.range === "custom" ? { from: applied.from, to: applied.to } : {}),
  });

  function apply() { setApplied({ ...rng }); }

  if (isLoading || !stats) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground">Carregando...</div>;
  }

  const { cards, orders_per_day, models_breakdown, status_breakdown, next_appointments } = stats;

  const ordersChartData = orders_per_day.map(x => ({ d: fmtDay(x.d), c: x.c }));
  const statusChartData = status_breakdown.map(x => ({ name: STATUS_LABEL[x.label] ?? x.label, c: x.c }));

  return (
    <div className="space-y-6">
      {/* Header + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Meu Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <RangeBar value={rng} onChange={setRng} />
          <Button size="sm" onClick={apply}>Aplicar</Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total de Pedidos"     value={cards.total} />
        <StatCard label="Aguardando Pagamento" value={cards.pending} />
        <StatCard label="Pagos"                value={cards.paid} />
        <StatCard label="Com Protocolo"        value={cards.protocol} />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard title="Pedidos por dia" className="lg:col-span-2">
          {ordersChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ordersChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "Pedidos"]} />
                <Line type="monotone" dataKey="c" stroke="#2563eb" strokeWidth={2} dot={false} name="Pedidos" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Tipos de Certificado">
          {models_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={models_breakdown} dataKey="c" nameKey="label" cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2}>
                  {models_breakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard title="Pedidos por Status" className="lg:col-span-2">
          {statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="c" name="Qtd" radius={[4, 4, 0, 0]}>
                  {statusChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Próximos Agendamentos">
          {next_appointments.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {next_appointments.map((a, i) => (
                <li key={i} className="flex flex-col border-b last:border-0 pb-2 last:pb-0">
                  <span className="font-medium">{a.dt}</span>
                  <span className="text-xs text-muted-foreground">Pedido {a.orderNo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum agendamento próximo</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      Nenhum dado disponível no período
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "admin" ? <AdminDashboard /> : <ContadorDashboard />;
}
