/* eslint-disable @next/next/no-img-element */
'use client';

import { AlertTriangle, CalendarDays, CircleDollarSign, PieChart } from 'lucide-react';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useProduct } from '../hooks/useProduct';
import { useActiveContracts } from '../hooks/useActiveContracts';
import { offeringStatusLabel } from '../constants/contracts';
import { formatKoreanDate, formatMUsd, formatNumber } from '../lib/format';
import { InvestForm } from './InvestForm';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';

export function ProductCard({ productId }: { productId: string }) {
  const { product, isLoading } = useProduct(productId);
  const { addresses } = useActiveContracts();
  const { data: offeringData } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'getOffering',
    args: [BigInt(productId)],
    query: { enabled: !!productId && !isLoading && !!product, refetchInterval: 5000 },
  });

  if (isLoading) {
    return <div className="flex min-h-[600px] w-full items-center justify-center rounded-3xl bg-white text-sm font-semibold text-gray-400 animate-pulse">상품 정보를 불러오는 중입니다.</div>;
  }

  if (!product) {
    return <div className="flex min-h-[500px] w-full items-center justify-center rounded-3xl bg-white text-sm font-semibold text-gray-500">상품 정보를 찾을 수 없습니다.</div>;
  }

  const offering = offeringData as { status?: number; raisedUnits?: bigint; fundingDeadline?: bigint; revenueStart?: bigint; revenueEnd?: bigint } | undefined;
  const statusLabel = offeringStatusLabel(offering?.status, product.statusLabel);
  const unitPrice = Number(formatUnits(BigInt(product.terms.unitPrice.raw), 6));
  const raisedUnits = offering?.raisedUnits ? Number(offering.raisedUnits) : 0;
  const currentAmount = raisedUnits * unitPrice;
  const targetAmount = Number(product.terms.targetRaise.display);
  const progressPercent = Math.min((currentAmount / targetAmount) * 100, 100) || 0;
  const fundingDeadline = offering?.fundingDeadline ? new Date(Number(offering.fundingDeadline) * 1000) : new Date(product.terms.fundingDeadline);
  const revenueStart = offering?.revenueStart ? new Date(Number(offering.revenueStart) * 1000) : new Date(product.terms.revenueStart);
  const revenueEnd = offering?.revenueEnd ? new Date(Number(offering.revenueEnd) * 1000) : new Date(product.terms.revenueEnd);

  return (
    <article className="w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_30px_90px_-30px_rgba(15,23,42,0.45)]">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-72 overflow-hidden bg-slate-950 lg:min-h-[500px]">
          <img src={product.creator.imageUrl} alt={product.title} className="absolute inset-0 h-full w-full object-cover opacity-85" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/10" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="text-xs font-bold text-white/65">발행 크리에이터</p>
            <p className="mt-1 text-xl font-extrabold">{product.creator.name}</p>
            <p className="mt-1 text-sm text-white/75">{product.creator.platform} · {product.creator.handle}</p>
          </div>
        </div>

        <div className="flex flex-col p-6 sm:p-9 lg:p-10">
          <div className="mb-6 flex items-center justify-between gap-4">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700">{statusLabel}</span>
            <span className="numeric text-xs font-semibold text-gray-400">상품 #{product.offeringId}</span>
          </div>

          <h2 className="text-2xl font-black leading-tight tracking-[-0.04em] text-gray-950 sm:text-3xl">{product.title}</h2>
          <p className="mt-4 text-sm leading-6 text-gray-600">{product.description}</p>

          <div className="mt-8 border-l-[3px] border-blue-600 pl-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500">현재 모집액</p>
                <p className="numeric mt-1 text-3xl font-black tracking-tight text-gray-950">{formatMUsd(currentAmount)}</p>
              </div>
              <p className="numeric text-2xl font-black text-blue-700">{progressPercent.toFixed(1)}%</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="모집 진행률" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span className="numeric">{formatNumber(raisedUnits, 0)} / {formatNumber(product.terms.unitsForSale, 0)} 구좌</span>
              <span className="numeric">목표 {formatMUsd(targetAmount)}</span>
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-3 divide-x divide-gray-100 rounded-2xl border border-gray-200 bg-gray-50/70 py-4">
            <div className="px-4">
              <dt className="text-[11px] font-semibold text-gray-500">구좌당 금액</dt>
              <dd className="numeric mt-1.5 text-sm font-extrabold text-gray-950 sm:text-base">{formatMUsd(unitPrice)}</dd>
            </div>
            <div className="px-4">
              <dt className="text-[11px] font-semibold text-gray-500">수익 배분</dt>
              <dd className="numeric mt-1.5 text-sm font-extrabold text-gray-950 sm:text-base">{product.terms.revenueSharePercent}%</dd>
            </div>
            <div className="px-4">
              <dt className="text-[11px] font-semibold text-gray-500">남은 구좌</dt>
              <dd className="numeric mt-1.5 text-sm font-extrabold text-gray-950 sm:text-base">{formatNumber(Math.max(product.terms.unitsForSale - raisedUnits, 0), 0)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid border-t border-gray-200 lg:grid-cols-[1fr_0.9fr]">
        <section className="p-6 sm:p-9 lg:border-r lg:border-gray-200 lg:p-10">
          <div className="mb-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Schedule & terms</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-gray-950">상품 일정과 조건</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 p-4">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              <p className="mt-4 text-[11px] font-semibold text-gray-500">모집 마감</p>
              <p className="numeric mt-1 text-sm font-extrabold text-gray-900">{formatKoreanDate(fundingDeadline)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-4">
              <CircleDollarSign className="h-4 w-4 text-blue-600" />
              <p className="mt-4 text-[11px] font-semibold text-gray-500">수익 발생 시작</p>
              <p className="numeric mt-1 text-sm font-extrabold text-gray-900">{formatKoreanDate(revenueStart)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-4">
              <PieChart className="h-4 w-4 text-blue-600" />
              <p className="mt-4 text-[11px] font-semibold text-gray-500">정산 만기</p>
              <p className="numeric mt-1 text-sm font-extrabold text-gray-900">{formatKoreanDate(revenueEnd)}</p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-5">크리에이터의 실제 수익에 따라 분배 금액이 달라지며 원금 손실이 발생할 수 있습니다. 투자 전에 모집 조건과 정산 일정을 확인하세요.</p>
          </div>
        </section>

        <section className="bg-slate-50/70 p-6 sm:p-9 lg:p-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Invest</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-gray-950">투자 구좌 선택</h3>
          <p className="mt-2 text-xs leading-5 text-gray-500">입력한 구좌 수에 따라 필요한 mUSD를 계산합니다.</p>
          <InvestForm productId={productId} />
        </section>
      </div>
    </article>
  );
}
