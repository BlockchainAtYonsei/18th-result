import { useQuery } from '@tanstack/react-query';
import { OfferingResponse } from '../types/product';

const getBackendUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://backend:8080/api';
  }
  return '/backend-api';
};

const fetchProducts = async (): Promise<OfferingResponse[]> => {
  const url = getBackendUrl();
  const res = await fetch(`${url}/offerings`, {
    signal: AbortSignal.timeout(3000),
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(`상품 목록을 불러오지 못했습니다: ${res.status}`);
  }
  return res.json();
};

const fetchProduct = async (productId: string): Promise<OfferingResponse | null> => {
  const url = getBackendUrl();
  const res = await fetch(`${url}/offerings/${productId}`, {
    signal: AbortSignal.timeout(3000),
    cache: 'no-store'
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`상품 정보를 불러오지 못했습니다: ${res.status}`);
  }
  return res.json();
};

export function useProducts() {
  const { data: products, isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 10000,
  });

  return { products: products ?? [], isLoading, isError };
}

export function useProduct(productId: string | null) {
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId!),
    enabled: !!productId,
  });

  return { product: product ?? null, isLoading, isError };
}
