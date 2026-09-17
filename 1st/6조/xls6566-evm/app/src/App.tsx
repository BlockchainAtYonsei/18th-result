import { D_CFG, useLending } from "./useLending";
import { FlowDiagram } from "./components/FlowDiagram";
import type { Snapshot } from "./lib/lending";
import { DEFAULT_PARAMS, type Params } from "./types";

const f2 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Vault/broker figures, in as few rows as divide evenly: eight tiles read better as 4 × 2
 *  than as a row of seven and an orphan. */
export function StatGrid({ snap }: { snap: Snapshot }) {
  const tiles: [string, string][] = [
    ["Vault 총자산", f2(snap.vaultTotal)], ["대출중", f2(snap.onLoan)], ["미실현 손실", f2(snap.loss)],
    ["Broker cover", f2(snap.cover)], ["예금자 인출가능", f2(snap.maxWithdraw)],
    ...(snap.harnessOn ? [
      ["유효 CRM (③)", `${snap.effCrmPct.toFixed(0)}%`],
      ["디폴트율", `${snap.defaultRatePct.toFixed(0)}%`],
      ["cover 회수가능 (②)", f2(snap.coverWithdrawable)],
    ] as [string, string][] : []),
  ];
  const cols = tiles.length > 5 ? Math.ceil(tiles.length / 2) : tiles.length;
  return (
    <div className="grid" style={{ "--cols": cols } as React.CSSProperties}>
      {tiles.map(([k, v]) => (
        <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
      ))}
    </div>
  );
}

const FIELD: Record<keyof Params, { label: string; hint: string }> = {
  deposit: { label: "예치 (dUSD)", hint: "예금자가 Vault에" },
  principal: { label: "대출 원금 (dUSD)", hint: "차입자가 빌림" },
  cover: { label: "first-loss cover (dUSD)", hint: "브로커 완충자본" },
  interestPct: { label: "이자율 (연 %)", hint: "0~100" },
  payments: { label: "상환 횟수", hint: "분할상환 횟수" },
  interval: { label: "연체 주기 (초)", hint: "이 시간 지나면 연체" },
  grace: { label: "유예 기간 (초)", hint: "이후 default 가능" },
  covMinPct: { label: "CoverRateMinimum (%)", hint: "부채 대비 최소 cover" },
  covLiqPct: { label: "CoverRateLiquidation (%)", hint: "default 시 흡수 비율" },
};

type Lending = ReturnType<typeof useLending>;
type Rows = [string, string][];
const n = (v: number) => v.toLocaleString();
const P = DEFAULT_PARAMS;

const SCENARIOS: Array<{
  id: "A" | "B" | "C" | "D"; title: string; blurb: React.ReactNode; steps: number; harness: boolean;
  summary: (L: Lending) => Rows; fields: (keyof Params)[]; fixed: (L: Lending) => Rows;
  fixedWhy?: string; coverHint: boolean; harnessOffWarning?: string;
}> = [
  {
    id: "A", title: "정상 렌딩", steps: 6, harness: false, coverHint: true,
    blurb: <>차입자가 원리금을 분할 상환합니다. 예금자는 이자가 붙은 목을 전액 인출합니다.</>,
    summary: () => [["예치", `${n(P.deposit)} dUSD`], ["대출 · 이자", `${n(P.principal)} · 연 ${P.interestPct}%`], ["first-loss cover", n(P.cover)]],
    fields: ["deposit", "principal", "cover", "interestPct", "payments", "covMinPct"],
    fixed: () => [["상환 주기", "30일 (이자 계산 기준)"], ["상환 대기", "없음 — 회차를 연속으로 상환"]],
  },
  {
    id: "B", title: "채무불이행(default)", steps: 6, harness: false, coverHint: true,
    blurb: <>차입자가 빌린 뒤 <b>약정대로 상환하지 않습니다.</b> cover가 먼저 소진되고 나머지 손실은 예금자가 떠안습니다.</>,
    summary: () => [["예치 · cover", `${n(P.deposit)} · ${n(P.cover)}`], ["대출", n(P.principal)], ["연체→default 대기", `약 ${P.interval + P.grace}초`]],
    fields: ["deposit", "principal", "cover", "interestPct", "payments", "interval", "grace", "covMinPct", "covLiqPct"],
    fixed: (L) => [["연체→default 대기", `약 ${L.params.interval + L.params.grace}초`]],
  },
  {
    id: "C", title: "집중도 한도 (하네스 ①)", steps: 4, harness: true, coverHint: true,
    blurb: <>부채 대비 α를 넘는 <b>대형 단일대출</b>을 시도합니다. 하네스가 켜져 있으면 §4.2 ①이 <b>LoanSet 앞단에서 차단</b>하고, 한도 내 대출만 실행합니다.</>,
    summary: (L) => [["대형대출 시도", n(L.bigLoan)], ["한도 내 대출", n(P.principal)], ["유효 CRM", `${L.snap ? L.snap.effCrmPct.toFixed(0) : "—"}%`]],
    fields: ["deposit", "principal", "cover"],
    fixed: (L) => [
      ["대형대출 시도", `${n(L.bigLoan)} (원금 × 1.5, 또는 한도를 넘는 최소액)`],
      ["이자율", "0% (부채 = 원금)"],
      ["CoverRateMinimum", `체인 현재값 ${L.snap ? L.snap.crmSetPct.toFixed(0) : "—"}%`],
    ],
    fixedWhy: "이자를 0으로 두어 한도와 비교되는 부채가 원금과 같아지게 했습니다.",
    harnessOffWarning: "하네스 OFF로 배포되어 있습니다 — 대형대출이 차단되지 않고 그대로 실행됩니다(집중 리스크 노출). 차단 장면을 보려면 「초기화」 후 하네스를 켜고 배포하세요.",
  },
  {
    id: "D", title: "이력 연동 공탁 (하네스 ③)", steps: 4, harness: true, coverHint: false,
    blurb: <>대출 {D_CFG.loans}건 중 1건이 <b>디폴트</b>하면, 그 기관의 <b>요구 cover 비율이 자동 상향</b>됩니다(§4.2 ③). 예금자 투표 없이 온체인 이력만으로.</>,
    summary: (L) => [["현재 유효 CRM", `${L.snap ? L.snap.effCrmPct.toFixed(0) : "—"}%`], ["디폴트율", `${L.snap ? L.snap.defaultRatePct.toFixed(0) : "—"}%`], ["디폴트 대기", `약 ${D_CFG.interval + D_CFG.grace}초`]],
    fields: [],
    fixed: () => [
      ["예치", n(D_CFG.deposit)], ["cover", n(D_CFG.cover)],
      ["대출", `${n(D_CFG.each)} × ${D_CFG.loans}건`], ["이자율", "0%"], ["상환 횟수", `${D_CFG.payments}회`],
      ["연체 주기 · 유예", `${D_CFG.interval}초 · ${D_CFG.grace}초`],
    ],
    fixedWhy: `디폴트율이 정확히 ${Math.round(100 / D_CFG.loans)}%가 되고, 요구 비율이 올라가도 cover가 버티도록 금액을 고정했습니다.`,
    harnessOffWarning: "하네스 OFF로 배포되어 있습니다 — 디폴트가 나도 요구 cover 비율이 오르지 않습니다. 「초기화」 후 하네스를 켜고 배포하세요.",
  },
];
