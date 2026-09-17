// The center "fund flow stage": a 700x440 box with the 6 role-card nodes laid
// out 3 columns x 2 rows, SVG fund-flow paths, optional travelling XRP chips,
// and a small set of per-screen overlay panels.
//
// The wide overlays (loss split, balance summary, wallet popup) used to sit
// absolutely inside the box; row 2 now occupies that space, so they render in a
// slim strip directly below the box instead. The `note` overlay is a small
// x/y-placed caption and stays inside.
import { Fragment } from 'react';
import type { FlowStageVM, PathTone, StageExtraVM } from '../viewModel';
import { renderRichText, RoleCard } from '../RoleCards';
import { Chip } from './Chip';
import { FLOW_PATHS, NODE_POSITIONS, STAGE_HEIGHT, STAGE_WIDTH } from './flowPaths';

const PATH_CLASS: Record<PathTone, string> = {
  idle: 'idle',
  none: 'none',
  blocked: 'blocked',
  flow: 'flow',
  'flow-crit': 'flow crit',
  'flow-good': 'flow good',
  'flow-wallet': 'flow wallet',
};

function StageExtra({ extra }: { extra: StageExtraVM }) {
  switch (extra.kind) {
    case 'note':
      return (
        <div className="stage-note-box" style={{ left: extra.x, top: extra.y }}>
          {extra.pill && <span className={`pill p-${extra.pill.tone}`}>{extra.pill.text}</span>}
          <span>{extra.text}</span>
        </div>
      );
    case 'walletPopup':
      return (
        <div className="wallet-popup">
          <div className="wallet-popup-head">
            <span className="wallet-popup-title">{extra.walletName} · 서명 요청</span>
            <span className="pill p-wallet">{extra.network}</span>
          </div>
          <div className="kv">
            {extra.fields.map(([k, v], i) => (
              <Fragment key={i}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </Fragment>
            ))}
          </div>
          <div className="wallet-popup-actions">
            <span className="btn ghost" style={{ flexGrow: 1, justifyContent: 'center' }}>
              거절
            </span>
            <span className="btn wallet-sign" style={{ flexGrow: 1 }}>
              서명
            </span>
          </div>
        </div>
      );
    case 'lossSplit':
      return (
        <div className="loss-split">
          <div className="loss-split-head">
            <span className="lab">손실 분배 · {extra.totalLabel}</span>
            <span className="mono loss-split-sub">
              {extra.coverAmountLabel} · {extra.vaultAmountLabel}
            </span>
          </div>
          <div className="loss-split-bar">
            <div className="loss-split-cover" style={{ width: `${extra.coverPct}%` }} />
            <div className="loss-split-vault" />
          </div>
          <div className="loss-split-note">
            <span>{extra.coverNote}</span>
            <span>{extra.vaultNote}</span>
          </div>
        </div>
      );
    case 'balanceSummary':
      return (
        <div className="balance-summary">
          {extra.columns.map((c, i) => (
            <div key={i}>
              <div className="lab">{c.label}</div>
              <div className={`mono balance-value ${c.tone ?? ''}`.trim()}>{c.value}</div>
            </div>
          ))}
        </div>
      );
  }
}

/** Only the small x/y caption still belongs inside the 440px box. */
function isInsideStage(extra: StageExtraVM): boolean {
  return extra.kind === 'note';
}

export function FlowStage({ vm }: { vm: FlowStageVM }) {
  const extra = vm.extra;
  return (
    <div className="stage-col">
      <div className="stage-head">
        <div>
          <div className="lab">자금 흐름</div>
          <div className="stage-title cond">{vm.title}</div>
        </div>
        <div className="stage-note">{renderRichText(vm.note, 'note')}</div>
      </div>
      <div className="stage-box" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}>
        <svg viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`} width={STAGE_WIDTH} height={STAGE_HEIGHT} className="stage-svg">
          {vm.paths.map((p) => (
            <path key={p.id} className={PATH_CLASS[p.tone]} d={FLOW_PATHS[p.id]} />
          ))}
          {vm.blockedMarkers?.map((m, i) => (
            <g key={i} transform={`translate(${m.x} ${m.y})`}>
              <circle r={8} fill="#F6DCDA" stroke="#B3261E" strokeWidth={1.5} />
              <path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7" stroke="#B3261E" strokeWidth={1.6} strokeLinecap="round" />
            </g>
          ))}
        </svg>
        <RoleCard node={vm.nodes.depositor} box={NODE_POSITIONS.depositor} />
        <RoleCard node={vm.nodes.vault} box={NODE_POSITIONS.vault} />
        <RoleCard node={vm.nodes.borrower} box={NODE_POSITIONS.borrower} />
        <RoleCard node={vm.nodes.brokerAccount} box={NODE_POSITIONS.brokerAccount} />
        <RoleCard node={vm.nodes.broker} box={NODE_POSITIONS.broker} />
        <RoleCard node={vm.nodes.loan} box={NODE_POSITIONS.loan} />
        {vm.labels?.map((l, i) => (
          <div key={i} className="lbl" style={{ left: l.x, top: l.y, color: l.color }}>
            {l.text}
          </div>
        ))}
        {vm.chips?.map((c, i) => (
          <Chip key={i} chip={c} />
        ))}
        {extra && isInsideStage(extra) && <StageExtra extra={extra} />}
      </div>
      {extra && !isInsideStage(extra) && (
        <div className="stage-strip" data-testid="stage-strip">
          <StageExtra extra={extra} />
        </div>
      )}
    </div>
  );
}
