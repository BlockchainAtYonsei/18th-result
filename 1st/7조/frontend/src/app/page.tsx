import Link from 'next/link';
import { ArrowRight, ChartNoAxesCombined, CircleDollarSign, ShieldCheck } from 'lucide-react';

const flow = [
  { number: '01', label: '수익권 선택', detail: '모집 조건과 진행률 확인' },
  { number: '02', label: '온체인 투자', detail: '지갑에서 mUSD로 투자' },
  { number: '03', label: '수익금 수령', detail: '정산된 수익을 직접 청구' },
];

export default function Home() {
  return (
    <main className="flex min-h-[calc(100svh-80px)] items-center overflow-hidden bg-white">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:py-24">
        <div>
          <h1 className="max-w-3xl text-[42px] font-black leading-[1.12] tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-[68px]">
            크리에이터의<br />내일 수익을<br /><span className="text-blue-700">오늘의 자산으로</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-gray-600 sm:text-lg sm:leading-8">
            미래 플랫폼 수익을 기반으로 발행된 수익권을 살펴보고, 모집부터 정산까지 온체인 기록으로 확인하세요.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/marketplace" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              수익권 둘러보기 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/portfolio" className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-extrabold text-gray-700 transition hover:border-gray-400 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              내 포트폴리오 확인
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-gray-200 pt-6 text-xs font-bold text-gray-500">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" />온체인 발행·정산</span>
            <span className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-blue-600" />mUSD 기반 투자</span>
            <span className="flex items-center gap-2"><ChartNoAxesCombined className="h-4 w-4 text-blue-600" />실시간 모집 현황</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="absolute -bottom-14 -right-16 h-52 w-52 rounded-full bg-slate-200/70 blur-3xl" />
          <div className="relative overflow-hidden rounded-[30px] bg-slate-950 p-6 text-white shadow-[0_40px_100px_-35px_rgba(15,23,42,0.75)] sm:p-8">
            <div className="flex items-start justify-between border-b border-white/10 pb-7">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-300">Revenue flow</p>
                <h2 className="mt-2 text-xl font-black tracking-tight">투자부터 수익 청구까지</h2>
              </div>
              <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">On-chain</div>
            </div>

            <ol className="py-3">
              {flow.map((step, index) => (
                <li key={step.number} className="relative flex gap-5 py-5">
                  {index < flow.length - 1 && <span className="absolute left-[15px] top-12 h-[calc(100%-24px)] w-px bg-white/15" />}
                  <span className="numeric relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/40 bg-blue-400/10 text-[10px] font-black text-blue-200">{step.number}</span>
                  <div>
                    <p className="text-sm font-extrabold">{step.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
              <div className="bg-white/[0.06] p-4">
                <p className="text-[10px] font-semibold text-slate-400">결제 자산</p>
                <p className="mt-1.5 text-sm font-extrabold">mUSD</p>
              </div>
              <div className="bg-white/[0.06] p-4">
                <p className="text-[10px] font-semibold text-slate-400">테스트 네트워크</p>
                <p className="mt-1.5 text-sm font-extrabold">Base Sepolia</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
