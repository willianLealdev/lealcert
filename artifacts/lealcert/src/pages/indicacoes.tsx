import { useEffect, useMemo, useState } from "react";
import { Copy, CreditCard, Gift, Info, Loader2, Share2, Users } from "lucide-react";
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

      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-950">
            <Info className="h-5 w-5 text-blue-600" />
            Termos da Indicação
          </CardTitle>
          <p className="text-sm text-blue-900/70">
            Leia como o programa funciona antes de compartilhar seu link.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="font-semibold text-slate-900">1. Quem pode participar</p>
              <p className="mt-1 leading-relaxed">
                O programa é destinado a contas de contador. Operadores vinculados a um escritório usam o link e o saldo do contador responsável.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">2. Como a indicação é registrada</p>
              <p className="mt-1 leading-relaxed">
                O contador indicado precisa se cadastrar pelo seu link, que contém o parâmetro <strong>indicacao</strong>. Esse parâmetro é separado do código de vendedor e fica vinculado ao cadastro.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">3. Quando você recebe crédito</p>
              <p className="mt-1 leading-relaxed">
                Você recebe <strong>{money(data.creditPerCertificate)}</strong> por certificado do contador indicado somente quando o pedido for concluído. Cadastro, pagamento ou protocolo ainda em andamento não geram crédito. Compras de clientes finais também não pontuam.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">4. Saldo e resgate</p>
              <p className="mt-1 leading-relaxed">
                Os créditos ficam acumulados no seu saldo. O uso é liberado a partir de <strong>{money(data.redemptionValue)}</strong> e cada resgate é fixo nesse valor. Se você tiver saldo acima disso, o excedente permanece disponível.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">5. Como usar no checkout</p>
              <p className="mt-1 leading-relaxed">
                O crédito pode pagar um certificado cujo valor total seja exatamente <strong>{money(data.redemptionValue)}</strong>. Não é possível fazer resgate parcial, transformar o saldo em dinheiro ou usar o crédito em um pedido de outro valor.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">6. Registro financeiro</p>
              <p className="mt-1 leading-relaxed">
                O valor original do certificado continua visível no pedido para auditoria, enquanto o uso do crédito fica registrado separadamente. Um pedido pago com créditos não é entrada de dinheiro, faturamento, ganho de vendedor ou comissão.
              </p>
            </div>
          </div>
          <div className="border-t border-blue-200 pt-3 space-y-2">
            <p className="font-semibold text-slate-900">7. Relatórios e segurança</p>
            <p className="leading-relaxed">
              Os relatórios mostram totais agregados por CPF/CNPJ e não expõem as compras individuais dos contadores indicados. Cada pedido concluído pode gerar apenas um crédito e cada pedido pode consumir créditos apenas uma vez; as validações são feitas pelo sistema.
            </p>
            <p className="text-xs text-blue-900/70">
              Os valores e condições vigentes são os exibidos nesta tela e podem ser atualizados pela LealCert.
            </p>
          </div>
        </CardContent>
      </Card>

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