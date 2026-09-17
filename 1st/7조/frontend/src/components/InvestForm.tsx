'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { formatUnits } from 'viem';
import { ERC20_ABI, IS_LOCAL_CHAIN } from '../constants/contracts';
import { useActiveContracts } from '../hooks/useActiveContracts';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';
import { Loader2 } from 'lucide-react';
import { useProduct } from '../hooks/useProduct';
import { formatNumber } from '../lib/format';
import { notifyChainStateChanged } from '../lib/chain-state';

interface InvestFormProps {
  productId: string;
}

export function InvestForm({ productId }: InvestFormProps) {
  const [units, setUnits] = useState('');
  const [flowStatus, setFlowStatus] = useState<'idle' | 'approving' | 'investing' | 'success'>('idle');
  const [flowError, setFlowError] = useState('');
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();
  const { product } = useProduct(productId);
  const { addresses } = useActiveContracts();

  // Read mUSD Allowance
  const { data: allowance, refetch: refetchAllowance, isFetching: isFetchingAllowance } = useReadContract({
    address: addresses.MUSD,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, addresses.REVENUE_BRIDGE] : undefined,
    query: {
      enabled: !!address,
    }
  });

  // Read whitelist status
  const { data: isAllowed, refetch: refetchAllowed } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'allowedInvestors',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    }
  });

  // Read offering data to calculate remaining units (always at top level)
  const { data: offeringData, refetch: refetchOffering } = useReadContract({
    address: addresses.REVENUE_BRIDGE,
    abi: RevenueBridgeABI,
    functionName: 'getOffering',
    args: [BigInt(productId)],
    query: {
      enabled: !!productId,
      refetchInterval: 5000,
    }
  });

  const { writeContractAsync } = useWriteContract();

  // 외부에서 투자자 등록이나 토큰 지급이 완료된 뒤 상태를 재반영한다.
  useEffect(() => {
    const handleFocus = () => {
      refetchAllowed();
      refetchAllowance();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchAllowed, refetchAllowance]);

  if (!isConnected || !product) {
    return (
      <button disabled className="mt-5 w-full cursor-not-allowed rounded-xl border border-gray-200 bg-white py-4 text-sm font-bold text-gray-400">
        투자하려면 지갑을 연결해주세요
      </button>
    );
  }

  if (isAllowed === false) {
    return (
      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center">
        <p className="mb-2 font-bold text-red-700">투자자 지갑 등록이 필요합니다</p>
        {IS_LOCAL_CHAIN ? (
          <p className="text-xs leading-5 text-red-600">상단 지갑 메뉴에서 <strong>테스트 자산 받기</strong>를 먼저 실행해주세요.</p>
        ) : (
          <p className="text-xs leading-5 text-red-600">현재 지갑은 투자자로 등록되어 있지 않습니다. 서비스 운영자에게 등록을 요청해주세요.</p>
        )}
      </div>
    );
  }

  const offering = offeringData as { status?: number; raisedUnits?: bigint } | undefined;
  const raisedUnits = offering?.raisedUnits ? Number(offering.raisedUnits) : 0;
  const remainingUnits = product.terms.unitsForSale - raisedUnits;
  const isFunding = offering?.status === undefined || Number(offering.status) === 1;

  const unitPriceRaw = BigInt(product.terms.unitPrice.raw); // e.g. 100_000_000 for 100 mUSD
  const hasValidUnits = /^\d+$/.test(units) && BigInt(units) > BigInt(0);
  const parsedUnits = hasValidUnits ? BigInt(units) : BigInt(0);
  const requiredAmount = parsedUnits * unitPriceRaw;
  const currentAllowance = allowance ? (allowance as bigint) : BigInt(0);

  const isExceedingCapacity = Number(parsedUnits) > remainingUnits;
  
  const needsApproval = requiredAmount > BigInt(0) && requiredAmount > currentAllowance;
  const requiredAmountDisplay = formatNumber(Number(formatUnits(requiredAmount, 6)));
  const allowanceDisplay = formatNumber(Number(formatUnits(currentAllowance, 6)));

  const handleInvest = async () => {
    if (!hasValidUnits || isExceedingCapacity || !publicClient) return;

    try {
      setFlowError('');

      if (needsApproval) {
        setFlowStatus('approving');
        const approvalHash = await writeContractAsync({
          address: addresses.MUSD,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [addresses.REVENUE_BRIDGE, requiredAmount],
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== 'success') throw new Error('approval reverted');
      }

      setFlowStatus('investing');
      const investmentHash = await writeContractAsync({
        address: addresses.REVENUE_BRIDGE,
        abi: RevenueBridgeABI,
        functionName: 'invest',
        args: [BigInt(productId), parsedUnits],
      });
      const investmentReceipt = await publicClient.waitForTransactionReceipt({ hash: investmentHash });
      if (investmentReceipt.status !== 'success') throw new Error('investment reverted');

      setUnits('');
      await Promise.all([
        refetchAllowance(),
        refetchOffering(),
        queryClient.invalidateQueries(),
      ]);
      notifyChainStateChanged();
      setFlowStatus('success');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.toLowerCase() : '';
      await Promise.allSettled([refetchAllowance(), refetchOffering()]);
      setFlowStatus('idle');
      setFlowError(
        message.includes('user rejected') || message.includes('user denied')
          ? '지갑에서 트랜잭션 요청이 취소되었습니다.'
          : '투자 처리에 실패했습니다. 지갑과 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
      );
    }
  };

  const isPending = flowStatus === 'approving' || flowStatus === 'investing' || isFetchingAllowance;

  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <label htmlFor={`investment-units-${productId}`} className="text-sm font-extrabold text-gray-900">투자 구좌</label>
        <span className="numeric rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
          잔여 {formatNumber(remainingUnits, 0)} 구좌
        </span>
      </div>
      <div className="relative">
        <input id={`investment-units-${productId}`} type="number" min="1" max={remainingUnits} step="1" placeholder={`최대 ${formatNumber(remainingUnits, 0)}`} value={units} onChange={(e) => { setUnits(e.target.value); setFlowStatus('idle'); setFlowError(''); }} disabled={isPending || remainingUnits === 0 || !isFunding} className={`numeric w-full rounded-xl border bg-gray-50 py-3.5 pl-4 pr-14 text-base font-bold text-gray-950 outline-none transition disabled:opacity-50 ${isExceedingCapacity ? 'border-red-400 focus:ring-4 focus:ring-red-50' : 'border-gray-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'}`} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">구좌</span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-gray-500">예상 결제 금액</p>
          <p className="numeric text-lg font-black text-gray-950">{requiredAmountDisplay} <span className="text-xs font-bold text-gray-500">mUSD</span></p>
          {isExceedingCapacity && (
            <p className="text-xs font-bold text-red-600">잔여 {formatNumber(remainingUnits, 0)}구좌를 초과했습니다.</p>
          )}
          {units && !hasValidUnits && (
            <p className="text-xs text-red-500 font-bold">
              1 이상의 정수 구좌를 입력해주세요.
            </p>
          )}
          {needsApproval && hasValidUnits && !isPending && (
            <p className="text-[11px] leading-4 text-gray-500">mUSD 승인 후 투자 확인 요청이 이어집니다.</p>
          )}
        </div>
        {currentAllowance > BigInt(0) && (
          <p className="numeric whitespace-nowrap text-[10px] font-bold text-emerald-600">승인 한도 {allowanceDisplay}</p>
        )}
      </div>

      <button onClick={handleInvest} disabled={isPending || !isFunding || !hasValidUnits || isExceedingCapacity || remainingUnits === 0} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none">
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> {isFetchingAllowance ? '정보 동기화 중' : flowStatus === 'approving' ? 'mUSD 승인 중' : '투자 처리 중'}</> : !isFunding ? '모집 종료' : remainingUnits === 0 ? '모집 마감' : '투자하기'}
      </button>
      
      {flowStatus === 'success' && (
        <p className="mt-3 text-center text-xs font-bold text-blue-700" role="status">
          투자가 완료되어 모집 현황에 반영되었습니다.
        </p>
      )}
      {flowError && <p className="mt-3 text-center text-xs font-bold text-red-600" role="alert">{flowError}</p>}
    </div>
  );
}
