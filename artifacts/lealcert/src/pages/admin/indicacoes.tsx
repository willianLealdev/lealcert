import { useEffect, useState } from "react";
import { BarChart3, CreditCard, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AdminData = {
  ranking: Array<{ userId: number; name: string; email: string | null; totalEarned: number; totalUsed: number; balance: number; referralCount: number }>;
  referrals: Array<{ referrerName: string; referredName: string; referredEmail: string | null; registeredAt: string }>;
  commissions: Array<{ id: number; amount: number; createdAt: string; orderId: number; orderNumber: string; orderStatus: string; paidValue: number; clientType: string; referrerName: string; referredName: string }>;
  usages: Array<{ amount: number; createdAt: string; ownerName: string; orderId: number; orderNumber: string; productValue: number; certificateName: string | null }>;
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminIndicacoesPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const load = () => {
    setLoading(true);
    fetch("/api/admin/referrals", { credentials: "include" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Erro ao carregar relatório.");
      setData(body);
    }).catch((error: Error) => toast({ title: error.message, variant: "destructive" })).finally(() => setLoading(false));
  };
  useEffect(load, []);
  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!data) return null;
  return <div className="space-y-6">
    <div className="flex justify-between gap-3 items-start"><div><h1 className="text-2xl font-bold">Indicações — Administração</h1><p className="text-sm text-muted-foreground mt-1">Rastreabilidade de cadastros, créditos concedidos e créditos usados.</p></div><Button variant="outline" onClick={load}>Atualizar</Button></div>
    <div className="grid sm:grid-cols-3 gap-4">
      <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">Indicadores ativos</p><p className="text-3xl font-black">{data.ranking.length}</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">Créditos concedidos</p><p className="text-3xl font-black text-emerald-700">{money(data.commissions.reduce((sum, item) => sum + item.amount, 0))}</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">Créditos usados</p><p className="text-3xl font-black">{money(data.usages.reduce((sum, item) => sum + item.amount, 0))}</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base flex gap-2 items-center"><BarChart3 className="h-4 w-4" />Ranking por saldo de créditos</CardTitle></CardHeader><CardContent><div className="space-y-2">{data.ranking.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Ainda não há créditos de indicação.</p> : data.ranking.map((item, index) => <div key={item.userId} className="grid grid-cols-[2rem_1fr_auto] gap-3 items-center rounded-lg border px-3 py-3"><span className="font-black text-muted-foreground">#{index + 1}</span><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.email ?? "Sem e-mail"} · {item.referralCount} indicado(s) · usado {money(item.totalUsed)}</p></div><p className="font-black text-emerald-700">{money(item.balance)}</p></div>)}</div></CardContent></Card>
    <div className="grid xl:grid-cols-2 gap-6">
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><Users className="h-4 w-4" />Cadastros por indicação</CardTitle></CardHeader><CardContent className="max-h-[28rem] overflow-auto space-y-2">{data.referrals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cadastro indicado.</p> : data.referrals.map((row, index) => <div key={`${row.referredName}-${index}`} className="rounded-lg border px-3 py-2"><p className="text-sm"><strong>{row.referrerName}</strong> indicou <strong>{row.referredName}</strong></p><p className="text-xs text-muted-foreground">{row.referredEmail ?? "Sem e-mail"} · {new Date(row.registeredAt).toLocaleDateString("pt-BR")}</p></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><CreditCard className="h-4 w-4" />Créditos usados em certificados</CardTitle></CardHeader><CardContent className="max-h-[28rem] overflow-auto space-y-2">{data.usages.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum crédito usado.</p> : data.usages.map((row, index) => <div key={`${row.orderId}-${index}`} className="rounded-lg border px-3 py-2"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{row.ownerName}</p><Badge className="bg-emerald-600">{money(row.amount)}</Badge></div><p className="text-xs text-muted-foreground mt-1">Pedido {row.orderNumber} · {row.certificateName ?? "Certificado"} · Produto {money(row.productValue)}</p></div>)}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base">Vendas concluídas que concederam crédito</CardTitle></CardHeader><CardContent><div className="overflow-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground border-b"><tr><th className="p-2">Indicador</th><th className="p-2">Indicado</th><th className="p-2">Pedido</th><th className="p-2">Pago</th><th className="p-2">Crédito</th></tr></thead><tbody>{data.commissions.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.referrerName}</td><td className="p-2">{row.referredName}</td><td className="p-2">{row.orderNumber} · {row.clientType.toUpperCase()}</td><td className="p-2">{money(row.paidValue)}</td><td className="p-2 font-semibold text-emerald-700">{money(row.amount)}</td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}