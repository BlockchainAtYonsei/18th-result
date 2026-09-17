import { D_CFG, useLending } from "./useLending";
import { FlowDiagram } from "./components/FlowDiagram";
import type { Snapshot } from "./lib/lending";
import { DEFAULT_PARAMS, type Params } from "./types";

const f2 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Vault/broker figures, in as few rows as divide evenly: eight tiles read better as 4 × 2
 *  than as a row of seven and an orphan. */
export function StatGrid({ snap }: { snap: Snapshot }) {
  const tiles: [string, string][] = [
    ["Vault \ucd1d\uc790\uc0b0", f2(snap.vaultTotal)], ["\ub300\ucd9c\uc911", f2(snap.onLoan)], ["\ubbf8\uc2e4\ud604 \uc190\uc2e4", f2(snap.loss)],
    ["Broker cover", f2(snap.cover)], ["\uc608\uae08\uc790 \uc778\ucd9c\uac00\ub2a5", f2(snap.maxWithdraw)],
    ...(snap.harnessOn ? [
      ["\uc720\ud6a8 CRM (\u2462)", `${snap.effCrmPct.toFixed(0)}%`],
      ["\ub514\ud3f4\ud2b8\uc728", `${snap.defaultRatePct.toFixed(0)}%`],
      ["cover \ud68c\uc218\uac00\ub2a5 (\u2461)", f2(snap.coverWithdrawable)],
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
