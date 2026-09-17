// The 4 "role card" nodes (Depositor / Vault / Broker cover / Borrower) that
// are rendered as absolutely-positioned boxes inside the fund-flow stage.
// Markup mirrors gen.mjs's `hd()` / `kv()` / `depNode` / `vaultNode` /
// `brokerNode` / `borNode` / `ghostVault` / `ghostBroker` helpers.
import type { NodeVM, PillVM, RichText } from './viewModel';
import type { NodeBox } from './stage/flowPaths';
import { KVGrid } from './KVGrid';
import { deltaClass, valueClass } from './kvRow';

/** Renders a plain string, or a sequence of `TextSegment`s joined by spaces. */
export function renderRichText(text: RichText, keyPrefix: string) {
  if (typeof text === 'string') return text;
  const nodes: React.ReactNode[] = [];
  text.forEach((seg, i) => {
    if (i > 0) nodes.push(' ');
    const cls = [seg.mono ? 'mono' : '', valueClass(seg.tone)].filter(Boolean).join(' ');
    nodes.push(
      <span key={`${keyPrefix}-${i}`} className={cls || undefined}>
        {seg.text}
      </span>,
    );
  });
  return nodes;
}

function Pill({ pill }: { pill: PillVM }) {
  return <span className={`pill p-${pill.tone}`}>{pill.text}</span>;
}

export function RoleCard({ node, box }: { node: NodeVM; box: NodeBox }) {
  const pulseClass = node.pulse === 'crit' ? 'pulse' : node.pulse === 'blue' ? 'pulse-blue' : '';
  const accentClass = node.accent && node.accent !== 'none' ? node.accent : '';
  const className = ['node', accentClass, pulseClass].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      style={{ left: box.x, top: box.y, width: box.width }}
      data-testid="role-card"
      data-node-id={node.id}
    >
      <div className="hd">
        <span className="nm">{node.name}</span>
        <Pill pill={node.pill} />
      </div>
      {node.kind === 'stat' && (
        <>
          {node.bigPrev !== undefined && node.bigDelta !== undefined ? (
            // Same "이전 → 현재" treatment the kv rows get, sized for the headline stat.
            <div className="big big-diff" data-testid="node-big" data-delta={node.bigDelta}>
              <span className="big-prev">{node.bigPrev}</span>
              <span className="big-arrow" aria-hidden="true">
                →
              </span>
              <span className={deltaClass(node.bigDelta)}>{node.big}</span>
            </div>
          ) : (
            <div className={`big ${valueClass(node.bigTone)}`.trim()} data-testid="node-big">
              {node.big}
            </div>
          )}
          <div className="sub">{renderRichText(node.subA, 'a')}</div>
          <div className="sub" style={{ marginTop: 6 }}>
            {node.subBPill ? <Pill pill={node.subBPill} /> : renderRichText(node.subB, 'b')}
          </div>
        </>
      )}
      {node.kind === 'kv' && <KVGrid rows={node.rows} />}
      {node.kind === 'ghost' && (
        <div className="sub" style={{ color: 'var(--muted)' }}>
          {node.note}
        </div>
      )}
    </div>
  );
}
