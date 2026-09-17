/* eslint-disable @next/next/no-img-element */
'use client';

import { ArrowUpRight } from 'lucide-react';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { OfferingResponse } from '../types/product';
import { useActiveContracts } from '../hooks/useActiveContracts';
import { offeringStatusLabel } from '../constants/contracts';
import { formatMUsd, formatShortDate } from '../lib/format';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';

interface ProductCardMiniProps {
  product: OfferingResponse;
  onClick: (productId: number) => void;
}

const statusTone = (status?: number) => {
  if (status === 1 || status === undefined) return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 2 || status === 4) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-gray-200 bg-white text-gray-600';
};

export function ProductCardMini({ product, onClick }: ProductCardMiniProps) {
  const { addresses } = useActiveContracts();
  const { data: offeringData } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'getOffering',
    args: [BigInt(product.offeringId)],
    query: { enabled: !!product, refetchInterval: 5000 },
  });

  const offering = offeringData as { status?: number; raisedUnits?: bigint; fundingDeadline?: bigint } | undefined;
  const statusLabel = offeringStatusLabel(offering?.status, product.statusLabel);
  const unitPrice = Number(formatUnits(BigInt(product.terms.unitPrice.raw), 6));
  const raisedUnits = offering?.raisedUnits ? Number(offering.raisedUnits) : 0;
  const currentAmount = raisedUnits * unitPrice;
  const targetAmount = Number(product.terms.targetRaise.display);
  const progressPercent = Math.min((currentAmount / targetAmount) * 100, 100) || 0;
  const fundingDeadline = offering?.fundingDeadline
    ? new Date(Number(offering.fundingDeadline) * 1000)
    : new Date(product.terms.fundingDeadline);

  return (
    <article className="group h-full overflow-hidden rounded-2xl border border-gray-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_50px_-24px_rgba(16,42,86,0.38)]">
      <button
        type="button"
        onClick={() => onClick(product.offeringId)}
        className="flex h-full w-full flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset"
        aria-label={`${product.title} 상세 보기`}
      >
        <div className="relative h-44 shrink-0 overflow-hidden bg-slate-900">
          <img src={product.creator.imageUrl} alt="" className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.035]" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/65 to-transparent" />
          <span className={`absolute left-4 top-4 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(offering?.status)}`}>{statusLabel}</span>
          <span className="absolute bottom-4 left-4 text-xs font-semibold text-white/90">{product.creator.platform} · {product.creator.handle}</span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1.5 text-xs font-bold text-blue-700">{product.creator.name}</p>
              <h3 className="line-clamp-2 text-[17px] font-extrabold leading-snug tracking-[-0.025em] text-gray-950">{product.title}</h3>
            </div>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </div>

          <div className="mb-5 border-l-2 border-blue-600 pl-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold text-gray-500">현재 모집액</span>
              <strong className="numeric text-sm font-extrabold text-blue-700">{progressPercent.toFixed(0)}%</strong>
            </div>
            <p className="numeric text-xl font-black tracking-tight text-gray-950">{formatMUsd(currentAmount)}</p>
            <p className="numeric mt-0.5 text-xs text-gray-500">목표 {formatMUsd(targetAmount)}</p>
          </div>

          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="모집 진행률" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700" style={{ width: `${progressPercent}%` }} />
          </div>

          <dl className="mt-auto grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-4">
            <div className="pr-3">
              <dt className="text-[10px] font-semibold text-gray-400">구좌당</dt>
              <dd className="numeric mt-1 text-xs font-bold text-gray-800">{formatMUsd(unitPrice)}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[10px] font-semibold text-gray-400">수익 배분</dt>
              <dd className="numeric mt-1 text-xs font-bold text-gray-800">{product.terms.revenueSharePercent}%</dd>
            </div>
            <div className="pl-3">
              <dt className="text-[10px] font-semibold text-gray-400">모집 마감</dt>
              <dd className="numeric mt-1 whitespace-nowrap text-xs font-bold text-gray-800">{formatShortDate(fundingDeadline)}</dd>
            </div>
          </dl>
        </div>
      </button>
    </article>
  );
}
