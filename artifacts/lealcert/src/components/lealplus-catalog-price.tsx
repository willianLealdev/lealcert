import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateLealPlusPricing, getGetLealPlusPricingQueryKey } from "@workspace/api-client-react";
import { useLealPlusPrice } from "@/hooks/use-lealplus-price";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function LealPlusCatalogPrice() {
  const { price, isLoading, isError } = useLealPlusPrice();
  const [value, setValue] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateLealPlusPricing();
  useEffect(() => {
    if (Number.isFinite(price)) setValue(price.toFixed(2));
  }, [price]);
  const save = async () => {
    try {
      await update.mutateAsync({ data: { price: Number(value.replace(",", ".")) } });
      await queryClient.invalidateQueries({ queryKey: getGetLealPlusPricingQueryKey() });
      toast({ title: "Preço do Leal Plus salvo", description: "Novos pedidos usarão o preço do catálogo. Pedidos anteriores não serão alterados." });
    } catch {
      toast({ title: "Não foi possível salvar o preço", description: "Informe um valor válido com até duas casas decimais.", variant: "destructive" });
    }
  };
  return (
    <Card><CardContent className="pt-6 space-y-3">
      <Label htmlFor="lealplus-catalog-price">Preço do Leal Plus (R$)</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Input id="lealplus-catalog-price" className="max-w-xs" inputMode="decimal" value={value}
          onChange={event => setValue(event.target.value)} disabled={isLoading || isError} />
        <Button onClick={save} disabled={isLoading || isError || update.isPending || !/^\d+([.,]\d{1,2})?$/.test(value)}>
          {update.isPending ? "Salvando..." : "Salvar preço"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {isError ? "Erro ao carregar o preço do backend." : "Preço armazenado no banco e aplicado pelo servidor em todos os novos pedidos."}
      </p>
    </CardContent></Card>
  );
}