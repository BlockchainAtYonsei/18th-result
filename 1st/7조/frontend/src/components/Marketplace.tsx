'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useReadContracts } from 'wagmi';
import type { Abi } from 'viem';
import { useProducts } from '../hooks/useProduct';
import { useActiveContracts } from '../hooks/useActiveContracts';
import { ProductCardMini } from './ProductCardMini';
import { ProductCard } from './ProductCard';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';
import { CHAIN_STATE_CHANGED_EVENT } from '../lib/chain-state';

const statuses = [
  { id: 'all', label: '전체' },
  { id: 'funding', label: '모집 중' },
  { id: 'active', label: '운영 중' },
  { id: 'closed', label: '정산 완료' },
  { id: 'failed', label: '모집 실패' },
];

function statusCategory(status: number | undefined, fallback: string) {
  if (status === 1) return 'funding';
  if (status === 2 || status === 4) return 'active';
  if (status === 3) return 'failed';
  if (status === 5) return 'closed';
  const normalized = fallback.toLowerCase();
  if (normalized === 'settling') return 'active';
  return normalized;
}

export function Marketplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { products, isLoading, isError } = useProducts();
  const { addresses } = useActiveContracts();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const offeringParam = searchParams.get('offering');
  const selectedProductId = offeringParam && /^\d+$/.test(offeringParam) ? offeringParam : null;
  const { data: offeringResults, refetch: refetchOfferings } = useReadContracts({
    contracts: products.map((product) => ({
      address: addresses.REVENUE_BRIDGE,
      abi: RevenueBridgeABI as Abi,
      functionName: 'getOffering',
      args: [BigInt(product.offeringId)],
    })),
    query: {
      enabled: products.length > 0,
      refetchInterval: products.length > 0 ? 5000 : false,
    },
  });

  useEffect(() => {
    if (!selectedProductId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') router.replace(pathname, { scroll: false });
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, router, selectedProductId]);

  useEffect(() => {
    const refreshOfferings = () => void refetchOfferings();
    window.addEventListener(CHAIN_STATE_CHANGED_EVENT, refreshOfferings);
    return () => window.removeEventListener(CHAIN_STATE_CHANGED_EVENT, refreshOfferings);
  }, [refetchOfferings]);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-sm font-semibold text-gray-400 animate-pulse">상품 정보를 불러오는 중입니다.</div>;

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-16 text-center">
        <p className="font-bold text-red-700">상품 정보를 불러오지 못했습니다.</p>
        <p className="mt-2 text-sm text-red-600">잠시 후 페이지를 새로고침해주세요.</p>
      </div>
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter((product, index) => {
    const matchesSearch = !normalizedQuery || product.title.toLowerCase().includes(normalizedQuery) || product.creator.name.toLowerCase().includes(normalizedQuery);
    const onchainOffering = offeringResults?.[index]?.result as { status?: number } | undefined;
    const matchesStatus = selectedStatus === 'all' || statusCategory(onchainOffering?.status, product.status) === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <section>
      <h1 className="sr-only">수익권 마켓플레이스</h1>

      <div className="mb-7 flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" className="block w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" placeholder="상품명 또는 크리에이터 검색" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <SlidersHorizontal className="mr-1 hidden h-4 w-4 text-gray-400 sm:block" />
          {statuses.map((status) => (
            <button key={status.id} type="button" onClick={() => setSelectedStatus(status.id)} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedStatus === status.id ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-950'}`}>
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">상품 <span className="numeric text-blue-700">{filteredProducts.length}</span>건</p>
        <p className="hidden text-xs text-gray-400 sm:block">모집 진행률 기준 실시간 온체인 정보</p>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <p className="font-semibold text-gray-600">조건에 맞는 상품이 없습니다.</p>
          <button type="button" onClick={() => { setSearchQuery(''); setSelectedStatus('all'); }} className="mt-4 text-sm font-bold text-blue-700 hover:underline">검색 조건 초기화</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => <ProductCardMini key={product.offeringId} product={product} onClick={(id) => router.push(`${pathname}?offering=${id}`, { scroll: false })} />)}
        </div>
      )}

      {selectedProductId && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/55 px-3 py-5 backdrop-blur-sm sm:px-6 sm:py-10" role="dialog" aria-modal="true" aria-label="상품 상세 정보" onMouseDown={(event) => { if (event.currentTarget === event.target) router.replace(pathname, { scroll: false }); }}>
          <div className="relative mx-auto w-full max-w-5xl">
            <button type="button" onClick={() => router.replace(pathname, { scroll: false })} className="absolute right-3 top-3 z-20 rounded-full border border-white/30 bg-slate-950/70 p-2.5 text-white shadow-lg backdrop-blur transition hover:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:top-4" aria-label="상품 상세 닫기">
              <X className="h-5 w-5" />
            </button>
            <ProductCard productId={selectedProductId} />
          </div>
        </div>
      )}
    </section>
  );
}
