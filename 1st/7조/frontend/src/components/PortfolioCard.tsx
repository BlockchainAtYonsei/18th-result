'use client';

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useActiveContracts } from '../hooks/useActiveContracts';
import { offeringStatusLabel } from '../constants/contracts';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';
import { OfferingResponse } from '../types/product';
import { formatUnits } from 'viem';
import { Loader2, TrendingUp } from 'lucide-react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatNumber } from '../lib/format';
import { notifyChainStateChanged } from '../lib/chain-state';

interface PortfolioCardProps {
  product: OfferingResponse;
  investedUnits: bigint;
}

export function PortfolioCard({ product, investedUnits }: PortfolioCardProps) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { addresses } = useActiveContracts();

  // Read claimable amount
  const { data: claimableData, refetch: refetchClaimable } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'claimable',
    args: address ? [BigInt(product.offeringId), address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    }
  });
  const { data: offeringData } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'getOffering',
    args: [BigInt(product.offeringId)],
    query: { refetchInterval: 5000 },
  });

  // Write claim transaction
  const { data: hash, isPending: isWritePending, writeContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      void Promise.all([refetchClaimable(), queryClient.invalidateQueries()]).then(() => {
        notifyChainStateChanged();
      });
    }
  }, [isConfirmed, queryClient, refetchClaimable]);

  const unitPriceRaw = BigInt(product.terms.unitPrice.raw);
  const investedAmount = investedUnits * unitPriceRaw;
  const claimableAmount = claimableData ? (claimableData as bigint) : BigInt(0);
  const investedAmountDisplay = formatNumber(Number(formatUnits(investedAmount, 6)));
  const claimableAmountDisplay = formatNumber(Number(formatUnits(claimableAmount, 6)));
  const offering = offeringData as { status?: number } | undefined;
  const statusLabel = offeringStatusLabel(offering?.status, product.statusLabel || '운영 중');

  const handleClaim = () => {
    if (claimableAmount <= BigInt(0)) return;
    writeContract({
      address: addresses.REVENUE_BRIDGE,
      abi: RevenueBridgeABI,
      functionName: 'claim',
      args: [BigInt(product.offeringId)],
    });
  };

  const isPending = isWritePending || isConfirming;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="p-5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">
            {product.title}
          </h3>
          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-md shrink-0">
            {statusLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500 font-medium">{product.creator.name}</p>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-1">보유 구좌</p>
            <p className="numeric font-bold text-gray-900">{formatNumber(investedUnits, 0)} 구좌</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">투자 원금</p>
            <p className="numeric font-bold text-gray-900">{investedAmountDisplay} mUSD</p>
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-end">
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-sm text-gray-500 font-medium mb-1">수령 가능한 수익금</p>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="numeric text-2xl font-black text-gray-900 tracking-tight">
                  {claimableAmountDisplay} <span className="text-sm text-gray-500 font-bold">mUSD</span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={isPending || claimableAmount <= BigInt(0)}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
              claimableAmount > BigInt(0)
                ? 'bg-gray-900 text-white hover:bg-black shadow-md hover:shadow-lg'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> 처리 중...</>
            ) : claimableAmount > BigInt(0) ? (
              '수익금 수령하기'
            ) : (
              '수령 가능한 수익금이 없습니다'
            )}
          </button>
          
          {isConfirmed && (
            <p className="text-xs text-blue-600 mt-2 font-medium text-center flex items-center justify-center gap-1">
              ✓ 수익금 수령이 완료되었습니다!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
