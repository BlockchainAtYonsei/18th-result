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
