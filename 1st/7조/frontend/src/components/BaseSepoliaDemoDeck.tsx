'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Clock3, Loader2, RotateCcw } from 'lucide-react';
import { formatUnits, keccak256, parseUnits, stringToHex } from 'viem';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { DEMO_FACTORY_ADDRESS } from '../constants/contracts';
import { useActiveContracts } from '../hooks/useActiveContracts';
import DemoDeploymentFactoryABI from '../generated/contracts/DemoDeploymentFactory.abi.json';
import MockSettlementTokenABI from '../generated/contracts/MockSettlementToken.abi.json';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';
import { CHAIN_STATE_CHANGED_EVENT, notifyChainStateChanged } from '../lib/chain-state';

const OFFERING_ID = BigInt(3);
const GROSS_REVENUE = parseUnits('1000', 6);

type DemoAction = 'fund' | 'activate' | 'settle' | 'close' | 'claim';

type OfferingState = {
  status: number;
  unitsForSale: bigint;
  unitPrice: bigint;
  raisedUnits: bigint;
  investorRevenueTotal: bigint;
  totalClaimed: bigint;
  nextPeriodIndex: bigint;
  revenueShareBps: number;
  advanceWithdrawn: boolean;
};

type DemoState = OfferingState & {
  investorAllowed: boolean;
  targetRaise: bigint;
  claimable: bigint;
  escrowLiability: bigint;
  revenueLiability: bigint;
  periodEnds: bigint[];
  chainTimestamp: bigint;
  observedAt: number;
};

const steps = [
  { key: 'fund', label: '투자 모집 완료', description: '남은 구좌를 데모 지갑으로 구매합니다.' },
  { key: 'activate', label: '모집 확정·선지급', description: '모집을 확정하고 크리에이터 선지급금을 받습니다.' },
  { key: 'settle', label: '기간별 수익 정산', description: '실제 Base Sepolia 시각에 맞춰 세 차례 정산합니다.' },
  { key: 'close', label: '상품 만기 처리', description: '모든 기간의 정산이 끝난 상품을 종료합니다.' },
  { key: 'claim', label: '투자자 수익 청구', description: '누적된 투자자 배분금을 지갑으로 받습니다.' },
] as const;

function nextAction(state: DemoState): DemoAction | null {
  if (state.status === 1 && state.raisedUnits < state.unitsForSale) return 'fund';
  if (state.status === 1) return 'activate';
  if ((state.status === 2 || state.status === 4) && Number(state.nextPeriodIndex) < state.periodEnds.length) return 'settle';
  if (state.status === 4 && Number(state.nextPeriodIndex) === state.periodEnds.length) return 'close';
  if (state.status === 5 && state.claimable > BigInt(0)) return 'claim';
  return null;
}

function isCompleted(state: DemoState, key: typeof steps[number]['key']) {
  if (key === 'fund') return state.raisedUnits === state.unitsForSale;
  if (key === 'activate') return state.status >= 2 && state.status !== 3 && state.advanceWithdrawn;
  if (key === 'settle') return Number(state.nextPeriodIndex) === state.periodEnds.length;
  if (key === 'close') return state.status === 5;
  return state.totalClaimed > BigInt(0);
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return '실행 가능';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}분 ${remainder.toString().padStart(2, '0')}초 후 실행 가능`;
}

function displayAmount(value: bigint) {
  return Number(formatUnits(value, 6)).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function BaseSepoliaDemoDeck() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { addresses, version, refetch: refetchActiveDeployment } = useActiveContracts();
  const [state, setState] = useState<DemoState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const { data: factoryOwner } = useReadContract({
    address: DEMO_FACTORY_ADDRESS,
    abi: DemoDeploymentFactoryABI,
    functionName: 'owner',
    query: { enabled: !!DEMO_FACTORY_ADDRESS },
  });
  const isFactoryOwner = !!address && typeof factoryOwner === 'string' && address.toLowerCase() === factoryOwner.toLowerCase();

  const readState = useCallback(async () => {
    if (!publicClient || !address) return null;
    const [offeringRaw, periodEndsRaw, targetRaise, claimable, escrowLiability, revenueLiability, investorAllowed, block] = await Promise.all([
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'getOffering', args: [OFFERING_ID] }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'getPeriodEnds', args: [OFFERING_ID] }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'targetRaise', args: [OFFERING_ID] }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'claimable', args: [OFFERING_ID, address] }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'totalEscrowLiability' }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'totalRevenueLiability' }),
      publicClient.readContract({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'allowedInvestors', args: [address] }),
      publicClient.getBlock(),
    ]);
    return {
      ...(offeringRaw as OfferingState),
      periodEnds: periodEndsRaw as bigint[],
      targetRaise: targetRaise as bigint,
      claimable: claimable as bigint,
      escrowLiability: escrowLiability as bigint,
      revenueLiability: revenueLiability as bigint,
      investorAllowed: investorAllowed as boolean,
      chainTimestamp: block.timestamp,
      observedAt: Date.now(),
    };
  }, [address, addresses.REVENUE_BRIDGE, publicClient]);

  const refresh = useCallback(async () => {
    if (!isFactoryOwner) return;
    try {
      setIsLoading(true);
      setError('');
      setState(await readState());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLoading(false);
    }
  }, [isFactoryOwner, readState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, version]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFactoryOwner) return;
    const handleStateChange = () => void refresh();
    const poller = window.setInterval(handleStateChange, 5000);
    window.addEventListener(CHAIN_STATE_CHANGED_EVENT, handleStateChange);
    return () => {
      window.clearInterval(poller);
      window.removeEventListener(CHAIN_STATE_CHANGED_EVENT, handleStateChange);
    };
  }, [isFactoryOwner, refresh]);

  const action = useMemo(() => state?.investorAllowed ? nextAction(state) : null, [state]);
  const nextPeriodEnd = state && Number(state.nextPeriodIndex) < state.periodEnds.length
    ? Number(state.periodEnds[Number(state.nextPeriodIndex)])
    : null;
  const estimatedChainTime = state
    ? Number(state.chainTimestamp) + Math.floor((now - state.observedAt) / 1000)
    : 0;
  const waitSeconds = nextPeriodEnd ? Math.max(nextPeriodEnd - estimatedChainTime, 0) : 0;
  const waitingForPeriod = action === 'settle' && waitSeconds > 0;

  const send = async (request: Parameters<typeof writeContractAsync>[0]) => {
    if (!publicClient) throw new Error('Base Sepolia 연결을 확인할 수 없습니다.');
    const hash = await writeContractAsync(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('트랜잭션이 실행 중 되돌려졌습니다.');
  };

  const runAction = async () => {
    if (!state || !action || waitingForPeriod) return;
    try {
      setIsPending(true);
      setError('');
      if (action === 'fund') {
        const units = state.unitsForSale - state.raisedUnits;
        const amount = units * state.unitPrice;
        await send({ address: addresses.MUSD, abi: MockSettlementTokenABI, functionName: 'approve', args: [addresses.REVENUE_BRIDGE, amount] });
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'invest', args: [OFFERING_ID, units] });
      } else if (action === 'activate') {
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'finalizeFunding', args: [OFFERING_ID] });
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'withdrawAdvance', args: [OFFERING_ID] });
      } else if (action === 'settle') {
        const periodIndex = state.nextPeriodIndex;
        const investorAmount = GROSS_REVENUE * BigInt(state.revenueShareBps) / BigInt(10_000);
        const evidenceHash = keccak256(stringToHex(`base-sepolia-demo-v${version}-period-${periodIndex}-${Date.now()}`));
        await send({ address: addresses.MUSD, abi: MockSettlementTokenABI, functionName: 'approve', args: [addresses.REVENUE_BRIDGE, investorAmount] });
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'settlePeriod', args: [OFFERING_ID, periodIndex, GROSS_REVENUE, evidenceHash] });
      } else if (action === 'close') {
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'closeOffering', args: [OFFERING_ID] });
      } else if (action === 'claim') {
        await send({ address: addresses.REVENUE_BRIDGE, abi: RevenueBridgeABI, functionName: 'claim', args: [OFFERING_ID] });
      }
      await queryClient.invalidateQueries();
      await refresh();
      notifyChainStateChanged();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message.toLowerCase().includes('user rejected') ? '지갑에서 트랜잭션 요청이 취소되었습니다.' : message);
    } finally {
      setIsPending(false);
    }
  };

  const resetDemo = async () => {
    if (!DEMO_FACTORY_ADDRESS || !publicClient) return;
    try {
      setIsPending(true);
      setError('');
      const hash = await writeContractAsync({ address: DEMO_FACTORY_ADDRESS, abi: DemoDeploymentFactoryABI, functionName: 'resetDemo' });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('데모 환경 배포가 실행 중 되돌려졌습니다.');
      setState(null);
      await refetchActiveDeployment();
      await queryClient.invalidateQueries();
      notifyChainStateChanged();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message.toLowerCase().includes('user rejected') ? '지갑에서 트랜잭션 요청이 취소되었습니다.' : message);
    } finally {
      setIsPending(false);
    }
  };

  if (!isConnected || !isFactoryOwner) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        운영 데모 덱은 Factory 소유자 지갑을 Base Sepolia에 연결한 경우에만 사용할 수 있습니다.
      </div>
    );
  }

  if (isLoading && !state) return <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> 데모 상태 확인 중</div>;

  return (
    <>
      {state && (
        <>
          {!state.investorAllowed && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              현재 활성 버전은 운영 데모 덱용 투자자 잔액과 권한이 없습니다. 아래 초기화 버튼으로 새 데모 환경을 먼저 배포해주세요.
            </div>
          )}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-100 p-3"><p className="text-[10px] text-gray-500">버전</p><p className="numeric mt-1 text-sm font-bold">v{version.toString()}</p></div>
            <div className="rounded-xl bg-gray-100 p-3"><p className="text-[10px] text-gray-500">모집</p><p className="numeric mt-1 text-sm font-bold">{state.raisedUnits.toString()}/{state.unitsForSale.toString()}</p></div>
            <div className="rounded-xl bg-gray-100 p-3"><p className="text-[10px] text-gray-500">정산</p><p className="numeric mt-1 text-sm font-bold">{state.nextPeriodIndex.toString()}/{state.periodEnds.length}</p></div>
          </div>

          {action === 'settle' && (
            <div className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${waitingForPeriod ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              <Clock3 className="h-4 w-4 shrink-0" /><strong>{formatCountdown(waitSeconds)}</strong>
            </div>
          )}

          {state.investorAllowed && <ol className="space-y-2">
            {steps.map((step, index) => {
              const done = isCompleted(state, step.key);
              const active = action === step.key;
              const label = step.key === 'settle' ? `${step.label} (${state.nextPeriodIndex.toString()}/${state.periodEnds.length})` : step.label;
              return (
                <li key={step.key} className={`rounded-2xl border p-3 ${active ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
                  <div className="flex gap-3">
                    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-gray-900">{label}</p><p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{step.description}</p></div>
                    {active && <ChevronRight className="mt-1 h-4 w-4 text-blue-600" />}
                  </div>
                </li>
              );
            })}
          </ol>}

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 p-3 text-xs">
            <div><span className="text-gray-400">모집금</span><strong className="numeric ml-2 text-gray-800">{displayAmount(state.targetRaise)} mUSD</strong></div>
            <div><span className="text-gray-400">누적 배분</span><strong className="numeric ml-2 text-gray-800">{displayAmount(state.investorRevenueTotal)} mUSD</strong></div>
            <div><span className="text-gray-400">청구 가능</span><strong className="numeric ml-2 text-gray-800">{displayAmount(state.claimable)} mUSD</strong></div>
            <div><span className="text-gray-400">남은 부채</span><strong className="numeric ml-2 text-gray-800">{displayAmount(state.escrowLiability + state.revenueLiability)} mUSD</strong></div>
          </div>

          {state.investorAllowed && <button type="button" onClick={runAction} disabled={!action || isPending || waitingForPeriod} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none">
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> 지갑 승인·처리 중</> : waitingForPeriod ? formatCountdown(waitSeconds) : action ? '다음 단계 실행' : '데모 시나리오 완료'}
          </button>}
          {state.investorAllowed && <p className="mt-2 text-center text-[10px] leading-4 text-gray-400">단계에 따라 MetaMask 서명이 두 번 요청될 수 있습니다.</p>}
        </>
      )}

      <button type="button" onClick={resetDemo} disabled={isPending} className={`${state?.investorAllowed ? 'mt-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800' : 'mt-4 bg-blue-600 text-white hover:bg-blue-700'} flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition disabled:opacity-40`}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} 새 컨트랙트로 초기화
      </button>
      {error && <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>}
    </>
  );
}
