import { Suspense } from 'react';
import { Marketplace } from '../../components/Marketplace';

export default function MarketplacePage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm font-semibold text-gray-400">마켓플레이스를 불러오는 중입니다.</div>}>
        <Marketplace />
      </Suspense>
    </main>
  );
}
