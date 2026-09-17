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
