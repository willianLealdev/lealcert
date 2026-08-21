import { useEffect, useMemo, useState } from "react";
import { Copy, CheckCircle2, CreditCard, Gift, Loader2, Share2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SalesBucket = { total: number; completed: number; paid: number; pending: number };
type IndicationsData = {
  officeName: string | null;
  referralCode: string;
  creditPerCertificate: number;
  redemptionValue: number;
  balance: number;
  totalEarned: number;
  totalUsed: number;
  referred: Array<{ name: string; createdAt: string }>;
  sales: { allTime: { cpf: SalesBucket; cnpj: SalesBucket }; today: { cpf: SalesBucket; cnpj: SalesBucket }; creditsToday: number };
  usedCredits: Array<{ id: number; amount: number; usedAt: string; orderId: number; orderNumber: string; certificateName: string | null; productValue: number }>;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SaleCard({ title, data }: { title: string; data: SalesBucket }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{title}</p>
        <Badge variant="secondary">{data.total} vendas</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div><p className="text-lg font-black text-emerald-600">{data.completed}</p><p className="text-[10px] text-muted-foreground">concluídas</p></div>
        <div><p className="text-lg font-black text-blue-600">{data.paid}</p><p className="text-[10px] text-muted-foreground">pagas / processo</p></div>
        <div><p className="text-lg font-black text-amber-600">{data.pending}</p><p className="text-[10px] text-muted-foreground">aguardando</p></div>
      </div>
    </div>
  );
}

export default function IndicacoesPage() {
  const [data, setData] = useState<IndicationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/referrals/me", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Erro ao carregar indicações.");
        setData(body);
      })
      .catch((error: Error) => toast({ title: error.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const referralLink = useMemo(() => data
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/register?indicacao=${encodeURIComponent(data.referralCode)}`
    : "", [data]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({ title: "Link copiado!", description: "Envie para outro contador se cadastrar." });
    } catch {
      toast({ title: "Não foi possível copiar o link", variant: "destructive" });
    }
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Indicações</h1>
        <p className="text-sm text-muted-foreground mt-1">Ganhe créditos quando contadores indicados concluírem certificados.</p>
      </div>

      <Card className="overflow-hidden border-emerald-200">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6 text-white">
            <div className="flex gap-3 items-center"><Gift className="h-6 w-6" /><div><p className="font-bold text-lg">Seu link exclusivo de indicação</p><p className="text-sm text-white/80">Cada certificado concluído rende {money(data.creditPerCertificate)} em créditos.</p></div></div>
          </div>
          <div className="p-5 flex flex-col md:flex-row gap-3">
            <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-mono break-all">{referralLink}</div>
            <Button className="gap-2" onClick={copyLink}><Copy className="h-4 w-4" />Copiar link</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="border-emerald-200"><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-emerald-700">Saldo disponível</p><p className="text-3xl font-black text-emerald-700 mt-1">{money(data.balance)}</p><p className="text-xs text-muted-foreground mt-1">liberado a partir de {money(data.redemptionValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Créditos recebidos</p><p className="text-3xl font-black mt-1">{money(data.totalEarned)}</p><p className="text-xs text-muted-foreground mt-1">{money(data.sales.creditsToday)} conquistados hoje</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Créditos usados</p><p className="text-3xl font-black mt-1">{money(data.totalUsed)}</p><p className="text-xs text-muted-foreground mt-1">em certificados do escritório</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex gap-2 items-center"><Share2 className="h-4 w-4 text-primary" />Vendas indicadas hoje</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4"><SaleCard title="Vendas CPF" data={data.sales.today.cpf} /><SaleCard title="Vendas CNPJ" data={data.sales.today.cnpj} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumo de todas as vendas indicadas</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4"><SaleCard title="Vendas CPF" data={data.sales.allTime.cpf} /><SaleCard title="Vendas CNPJ" data={data.sales.allTime.cnpj} /></CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex gap-2 items-center"><Users className="h-4 w-4 text-primary" />Contadores que se cadastraram pelo seu link</CardTitle></CardHeader>
          <CardContent>
            {data.referred.length === 0 ? <p className="text-sm text-muted-foreground py-5 text-center">Envie seu link para começar a indicar.</p> : (
              <div className="space-y-2">{data.referred.map((person) => <div key={`${person.name}-${person.createdAt}`} className="flex justify-between rounded-lg border px-3 py-2.5"><span className="text-sm font-medium">{person.name}</span><span className="text-xs text-muted-foreground">{new Date(person.createdAt).toLocaleDateString("pt-BR")}</span></div>)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex gap-2 items-center"><CreditCard className="h-4 w-4 text-emerald-600" />Créditos já utilizados</CardTitle></CardHeader>
          <CardContent>
            {data.usedCredits.length === 0 ? <p className="text-sm text-muted-foreground py-5 text-center">Nenhum crédito utilizado até agora.</p> : (
              <div className="space-y-2">{data.usedCredits.map((usage) => <div key={usage.id} className="rounded-lg border px-3 py-2.5"><div className="flex justify-between gap-3"><span className="font-medium text-sm">{usage.certificateName ?? "Certificado"}</span><span className="font-semibold text-emerald-700">-{money(usage.amount)}</span></div><p className="text-xs text-muted-foreground mt-1">Pedido {usage.orderNumber} · Produto: {money(usage.productValue)} · {new Date(usage.usedAt).toLocaleDateString("pt-BR")}</p></div>)}</div>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground text-center">Por privacidade, o relatório mostra somente os totais de vendas; não exibe compras por contador indicado.</p>
    </div>
  );
}