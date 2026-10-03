import { useGetLealPlusPricing, getGetLealPlusPricingQueryKey } from "@workspace/api-client-react";

// A ausência de configuração não concede preço zero nem usa um preço local.
export function useLealPlusPrice() {
  const query = useGetLealPlusPricing({
    query: { queryKey: getGetLealPlusPricingQueryKey(), staleTime: 0, refetchOnWindowFocus: true },
  });
  return {
    ...query,
    price: query.isError ? Number.NaN : query.data?.price ?? Number.NaN,
  };
}