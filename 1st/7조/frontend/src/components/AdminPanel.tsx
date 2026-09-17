'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useReadContract } from 'wagmi';
import { Check, ChevronRight, Clock3, Loader2, RotateCcw, Settings, X } from 'lucide-react';
import { DEMO_FACTORY_ADDRESS, IS_LOCAL_CHAIN } from '../constants/contracts';
import { BaseSepoliaDemoDeck } from './BaseSepoliaDemoDeck';
import DemoDeploymentFactoryABI from '../generated/contracts/DemoDeploymentFactory.abi.json';
import { CHAIN_STATE_CHANGED_EVENT, notifyChainStateChanged } from '../lib/chain-state';

type DemoAction = 'fund' | 'activate' | 'settle' | 'close' | 'claim' | 'reset';

type DemoState = {
  offeringId: number;
  status: number;
  statusLabel: string;
  unitsForSale: string;
  raisedUnits: string;
  targetRaise: string;
  investorRevenue: string;
  totalClaimed: string;
  claimable: string;
  escrowLiability: string;
  revenueLiability: string;
  nextPeriodIndex: number;
  periodCount: number;
  advanceWithdrawn: boolean;
  chainTime: string;
};

const steps = [
  { key: 'fund', label: '투자 모집 완료', description: '투자자가 남은 수익권을 모두 구매합니다.' },
  { key: 'activate', label: '모집 확정·선지급', description: '모집을 확정하고 크리에이터가 선지급금을 받습니다.' },
  { key: 'settle', label: '기간별 수익 정산', description: '정산일로 시간을 이동하고 1,000 mUSD 매출을 등록합니다.' },
  { key: 'close', label: '상품 만기 처리', description: '모든 기간이 끝난 상품을 종료합니다.' },
  { key: 'claim', label: '투자자 수익 청구', description: '누적된 투자자 배분금을 지갑으로 지급합니다.' },
] as const;

function currentAction(state: DemoState): Exclude<DemoAction, 'reset'> | null {
  if (state.status === 1 && BigInt(state.raisedUnits) < BigInt(state.unitsForSale)) return 'fund';
  if (state.status === 1) return 'activate';
  if ((state.status === 2 || state.status === 4) && state.nextPeriodIndex < state.periodCount) return 'settle';
  if (state.status === 4 && state.nextPeriodIndex === state.periodCount) return 'close';
  if (state.status === 5 && Number(state.claimable) > 0) return 'claim';
  return null;
}

function isCompleted(state: DemoState, key: typeof steps[number]['key']) {
  if (key === 'fund') return BigInt(state.raisedUnits) === BigInt(state.unitsForSale);
  if (key === 'activate') return state.status >= 2 && state.status !== 3 && state.advanceWithdrawn;
  if (key === 'settle') return state.nextPeriodIndex === state.periodCount;
  if (key === 'close') return state.status === 5;
  return Number(state.totalClaimed) > 0;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC',
  }).format(new Date(value));
}

export function AdminPanel() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { data: factoryOwner } = useReadContract({
    address: DEMO_FACTORY_ADDRESS,
    abi: DemoDeploymentFactoryABI,
    functionName: 'owner',
    query: { enabled: !IS_LOCAL_CHAIN && !!DEMO_FACTORY_ADDRESS },
  });
  const canAccess = IS_LOCAL_CHAIN || (
    isConnected && !!address && typeof factoryOwner === 'string' && address.toLowerCase() === factoryOwner.toLowerCase()
  );
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<DemoState | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !IS_LOCAL_CHAIN) return;
    fetch('/api/demo-deck', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? '데모 상태를 불러오지 못했습니다.');
        setState(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !IS_LOCAL_CHAIN) return;
    const refreshState = () => {
      fetch('/api/demo-deck', { cache: 'no-store' })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? '데모 상태를 불러오지 못했습니다.');
          setState(body);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    };
    const poller = window.setInterval(refreshState, 5000);
    window.addEventListener(CHAIN_STATE_CHANGED_EVENT, refreshState);
    return () => {
      window.clearInterval(poller);
      window.removeEventListener(CHAIN_STATE_CHANGED_EVENT, refreshState);
    };
  }, [isOpen]);

  const nextAction = useMemo(() => state ? currentAction(state) : null, [state]);

  const runAction = async (action: DemoAction) => {
    try {
      setIsPending(true);
      setError('');
      const response = await fetch('/api/demo-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '데모 단계를 실행하지 못했습니다.');
      setState(body);
      await queryClient.invalidateQueries();
      notifyChainStateChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsPending(false);
    }
  };

  const redeployDemo = async () => {
    await runAction('reset');
  };

  if (!canAccess) return null;

  if (!isOpen) {
    return (
      <button onClick={() => { setError(''); setIsOpen(true); }} className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-blue-500/30 bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-2xl transition hover:-translate-y-0.5 hover:bg-black" title="데모 덱 열기">
        <Settings className="h-5 w-5 text-cyan-300" /> 데모 덱
      </button>
    );
  }

  return (
    <aside className="fixed bottom-5 right-5 z-50 flex max-h-[calc(100vh-2.5rem)] w-[390px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
      <div className="bg-gray-950 px-5 pb-5 pt-4 text-white">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">{IS_LOCAL_CHAIN ? 'Anvil scenario control' : 'Base Sepolia deployment'}</p>
            <h2 className="mt-1 text-lg font-black">{IS_LOCAL_CHAIN ? '로컬 데모 덱' : '운영 데모 덱'}</h2>
          </div>
          <button onClick={() => setIsOpen(false)} className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white" aria-label="데모 덱 닫기"><X className="h-5 w-5" /></button>
        </div>
        {IS_LOCAL_CHAIN && state && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] text-gray-400">상태</p><p className="mt-1 text-sm font-bold text-cyan-200">{state.statusLabel}</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] text-gray-400">모집</p><p className="mt-1 text-sm font-bold">{state.raisedUnits}/{state.unitsForSale}</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] text-gray-400">정산</p><p className="mt-1 text-sm font-bold">{state.nextPeriodIndex}/{state.periodCount}</p></div>
          </div>
        )}
      </div>

      <div className="overflow-y-auto p-5">
        {!IS_LOCAL_CHAIN && (
          <BaseSepoliaDemoDeck />
        )}
        {IS_LOCAL_CHAIN && !state && !error && <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> 상태 확인 중</div>}
        {IS_LOCAL_CHAIN && state && (
          <>
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800"><Clock3 className="h-4 w-4 shrink-0" /><span>체인 시각 <strong>{formatTime(state.chainTime)} UTC</strong></span></div>
            <ol className="space-y-2">
              {steps.map((step, index) => {
                const done = isCompleted(state, step.key);
                const active = nextAction === step.key;
                const label = step.key === 'settle' ? `${step.label} (${state.nextPeriodIndex}/${state.periodCount})` : step.label;
                return (
                  <li key={step.key} className={`rounded-2xl border p-3 transition ${active ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
                    <div className="flex gap-3">
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-gray-900">{label}</p><p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{step.description}</p></div>
                      {active && <ChevronRight className="mt-1 h-4 w-4 text-blue-600" />}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 p-3 text-xs">
              <div><span className="text-gray-400">모집금</span><strong className="ml-2 text-gray-800">{state.targetRaise} mUSD</strong></div>
              <div><span className="text-gray-400">누적 배분</span><strong className="ml-2 text-gray-800">{state.investorRevenue} mUSD</strong></div>
              <div><span className="text-gray-400">청구 가능</span><strong className="ml-2 text-gray-800">{state.claimable} mUSD</strong></div>
              <div><span className="text-gray-400">남은 부채</span><strong className="ml-2 text-gray-800">{Number(state.escrowLiability) + Number(state.revenueLiability)} mUSD</strong></div>
            </div>
            <button onClick={() => nextAction && runAction(nextAction)} disabled={!nextAction || isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none">
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> 처리 중</> : nextAction ? '다음 단계 실행' : '데모 시나리오 완료'}
            </button>
            <button onClick={redeployDemo} disabled={isPending} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> 새 컨트랙트로 초기화</button>
          </>
        )}
        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>}
      </div>
    </aside>
  );
}
