// 1-hop fund flow around the two wallets. Fixed layout, evidence in accent, requested transfer dashed.
import type { DataProvenance, NormalizedTransfer, RiskLevel } from '../api/types'
import { ChartFrame } from '../components/ChartFrame'
import { useT } from '../i18n/hooks'
import { formatAmount, formatUtc, shortAddress } from '../lib/format'
import { identiconCells } from '../lib/identicon'
import { TransferRows } from '../pages/case/WhyChain'
import type { Flow, FlowEdge, FlowNode } from './buildFlow'
import { flowSummary } from './flowSummary'

const W = 820
const RING: Record<RiskLevel, string> = { LOW: 'var(--allow)', MEDIUM: 'var(--warn)', HIGH: 'var(--block)' }

function NodeMark({ node, x, y, r, ring, role, listed }: { node: FlowNode; x: number; y: number; r: number; ring: string | null; role: string; listed: boolean }) {
  const s = r * 1.15
  return (
    <g>
      <title>{`${role}: ${node.address}`}</title>
      {ring && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={ring} strokeWidth="3" />}
      <circle cx={x} cy={y} r={r} fill="var(--surface-2)" stroke={node.ownerUnknown ? 'var(--muted)' : 'none'} strokeDasharray="3 3" />
      <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox="0 0 5 5" shapeRendering="crispEdges">
        {identiconCells(node.address).map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width="1" height="1" fill={c.color} />
        ))}
      </svg>
      <text x={x} y={y + r + 18} textAnchor="middle" className="g-mono">
        {shortAddress(node.address)}
      </text>
      <text x={x} y={y + r + 33} textAnchor="middle" className="g-cap" style={listed ? { fill: '#ff8a8a' } : undefined}>
        {role}
      </text>
    </g>
  )
}

export function FundFlowGraph({
  flow,
  levels,
  listed = new Set<string>(),
  provenance,
}: {
  flow: Flow
  levels: { sender: RiskLevel | null; recipient: RiskLevel | null }
  /** Addresses the evidence names as listed; drawn with a red ring and labelled. */
  listed?: Set<string>
  provenance: DataProvenance | null
}) {
  const t = useT()
  const sender = flow.nodes.find((n) => n.kind === 'sender')!
  const recipient = flow.nodes.find((n) => n.kind === 'recipient') ?? sender
  const recorded = flow.edges.filter((e) => e.kind === 'recorded')
  const requested = flow.edges.find((e) => e.kind === 'requested')

  // counterparties on the right if they touch the recipient, otherwise on the left of the sender
  const touches = (n: FlowNode, id: string) => recorded.some((e) => (e.from === n.id && e.to === id) || (e.to === n.id && e.from === id))
  const others = flow.nodes.filter((n) => n.kind === 'counterparty' || n.kind === 'account')
  const right = others.filter((n) => touches(n, recipient.id) || !touches(n, sender.id))
  const left = others.filter((n) => !right.includes(n))
  const rows = Math.max(left.length, right.length, 1)
  const H = Math.max(260, rows * 72 + 70)
  const mid = H / 2 - 10
  const pos = new Map<string, { x: number; y: number; r: number }>()
  pos.set(sender.id, { x: left.length ? 260 : 150, y: mid, r: 24 })
  if (recipient !== sender) pos.set(recipient.id, { x: left.length ? 500 : 430, y: mid, r: 24 })
  const column = (list: FlowNode[], x: number) =>
    list.forEach((n, i) => pos.set(n.id, { x, y: list.length === 1 ? mid : 40 + (i * (H - 110)) / Math.max(list.length - 1, 1), r: 17 }))
  column(left, 70)
  column(right, 730)

  const centre = (pos.get(sender.id)!.x + (pos.get(recipient.id)?.x ?? pos.get(sender.id)!.x)) / 2

  // one path per direction between a pair; count transfers on it
  const pairs = new Map<string, FlowEdge[]>()
  for (const e of recorded) pairs.set(`${e.from}>${e.to}`, [...(pairs.get(`${e.from}>${e.to}`) ?? []), e])

  const answer = flowSummary(t, flow)

  const role = (n: FlowNode) =>
    n.kind === 'sender' ? t('ui.flow.sender') : n.kind === 'recipient' ? t('ui.flow.recipient') : n.kind === 'account' ? t('ui.flow.account') : t('ui.flow.counterparty')

  const table = <TransferRows transfers={recorded.map((e) => e.transfer).filter((x): x is NormalizedTransfer => x !== null)} provenance={provenance} />

  return (
    <div data-testid="fund-flow">
      <ChartFrame question={t('ui.flow.question')} answer={answer} table={table}>
        <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" role="img" aria-label={answer}>
          <defs>
            {(['accent', 'soft', 'text'] as const).map((c) => (
              <marker key={c} id={`ah-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10z" fill={`var(--${c})`} />
              </marker>
            ))}
          </defs>
          {[...pairs.entries()].map(([key, list]) => {
            const a = pos.get(list[0].from)
            const b = pos.get(list[0].to)
            if (!a || !b) return null
            const evidence = list.some((e) => e.evidence)
            const dx = b.x - a.x
            const dy = b.y - a.y
            const len = Math.hypot(dx, dy) || 1
            const x1 = a.x + (dx / len) * (a.r + 4)
            const y1 = a.y + (dy / len) * (a.r + 4)
            const x2 = b.x - (dx / len) * (b.r + 8)
            const y2 = b.y - (dy / len) * (b.r + 8)
            const mx = (x1 + x2) / 2
            // the end that is not one of the two case wallets
            const outer = list[0].from === sender.id || list[0].from === recipient.id ? b : a
            const tip = list
              .map((e) => `${e.timestamp ? formatUtc(e.timestamp) : t('ui.case.why.noTimestamp')} · ${formatAmount(e.amountRaw, e.asset)}${e.evidence ? ` · ${t('ui.flow.legendEvidence')}` : ''}`)
              .join('\n')
            return (
              <g key={key} className="flow-edge">
                <title>{tip}</title>
                <path
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={evidence ? 'var(--accent)' : 'var(--soft)'}
                  strokeWidth={evidence ? 2.5 : 1.6}
                  markerEnd={`url(#ah-${evidence ? 'accent' : 'soft'})`}
                />
                {/* label sits by the outer wallet, where the paths have fanned apart; the return path's label goes below the line */}
                <text x={outer.x + (outer.x > centre ? -64 : 64)} y={outer.y + (outer === b ? -7 : 15)} textAnchor="middle" className="g-cap">
                  {list.length > 1 ? t('ui.flow.transfers', { n: list.length }) : formatAmount(list[0].amountRaw, list[0].asset)}
                </text>
              </g>
            )
          })}
          {requested && recipient !== sender && (() => {
            const a = pos.get(sender.id)!
            const b = pos.get(recipient.id)!
            const label = t('ui.flow.requested', { amount: formatAmount(requested.amountRaw, requested.asset) })
            return (
              <g className="flow-edge">
                <title>{label}</title>
                <path
                  d={`M${a.x},${a.y - a.r - 4} C${a.x + 40},${a.y - 80} ${b.x - 40},${b.y - 80} ${b.x},${b.y - b.r - 8}`}
                  fill="none"
                  stroke="var(--text)"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  markerEnd="url(#ah-text)"
                />
                <text x={(a.x + b.x) / 2} y={a.y - 72} textAnchor="middle" className="g-cap g-strong">
                  {label}
                </text>
              </g>
            )
          })()}
          {flow.nodes.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const ring = n.kind === 'sender' ? levels.sender : n.kind === 'recipient' ? levels.recipient : null
            const isListed = listed.has(n.address) && n.kind !== 'sender' && n.kind !== 'recipient'
            return <NodeMark key={n.id} node={n} x={p.x} y={p.y} r={p.r} ring={isListed ? 'var(--block)' : ring ? RING[ring] : null} role={isListed ? t('ui.flow.listed') : role(n)} listed={isListed} />
          })}
        </svg>
        <div className="legend caption t2">
          <span>
            <i className="lg-line" /> {t('ui.flow.legendRecorded')}
          </span>
          <span>
            <i className="lg-line lg-evidence" /> {t('ui.flow.legendEvidence')}
          </span>
          <span>
            <i className="lg-line lg-requested" /> {t('ui.flow.legendRequested')}
          </span>
          <span>
            <i className="lg-ring" /> {t('ui.flow.legendRing')}
          </span>
          {flow.nodes.some((n) => listed.has(n.address) && n.kind !== 'sender' && n.kind !== 'recipient') && (
            <span>
              <i className="lg-ring lg-listed" /> {t('ui.flow.legendListed')}
            </span>
          )}
        </div>
        <p className="caption muted">
          {t('ui.flow.oneHop')}
          {flow.hiddenCount > 0 && ` ${t('ui.flow.hidden', { n: flow.hiddenCount })}`}
        </p>
      </ChartFrame>
    </div>
  )
}
