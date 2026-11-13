// One lane per wallet over the span of its timed transfers; evidence transfers ringed in accent.
import type { DataProvenance, NormalizedTransfer } from '../api/types'
import { ChartFrame } from '../components/ChartFrame'
import { useT } from '../i18n/hooks'
import { formatAmount, formatUtc, shortAddress } from '../lib/format'
import { TransferRows } from '../pages/case/WhyChain'

export interface Lane {
  label: string
  address: string
  transfers: NormalizedTransfer[]
  evidenceIds: Set<string>
}

const W = 820
const LEFT = 110
const RIGHT = 20

function tick(ms: number, spanMs: number): string {
  const iso = new Date(ms).toISOString()
  return spanMs < 3 * 3600_000 ? iso.slice(11, 19) : iso.slice(5, 16).replace('T', ' ')
}

export function ActivityTimeline({ lanes, provenance }: { lanes: Lane[]; provenance: DataProvenance | null }) {
  const t = useT()
  const timed = lanes.flatMap((l) => l.transfers.filter((x) => x.timestamp).map((x) => Date.parse(x.timestamp!)))
  const untimed = lanes.reduce((n, l) => n + l.transfers.filter((x) => !x.timestamp).length, 0)
  let lo = Math.min(...timed)
  let hi = Math.max(...timed)
  if (timed.length > 0 && hi - lo < 120_000) {
    lo -= 60_000
    hi += 60_000
  }
  const span = hi - lo || 1
  const X = (ms: number) => LEFT + ((ms - lo) / span) * (W - LEFT - RIGHT)
  const H = 46 * lanes.length + 50
  const answer = timed.length === 0 ? t('ui.timeline.answerNone') : t('ui.timeline.answer', { from: formatUtc(new Date(lo).toISOString()).replace(' UTC', ''), to: formatUtc(new Date(hi).toISOString()).replace(' UTC', '') })

  const all = lanes.flatMap((l) => l.transfers)
  const unique = [...new Map(all.map((x) => [`${x.signature}:${x.instructionIndex}:${x.innerInstructionIndex}:${x.transferOrdinal}`, x])).values()]

  return (
    <ChartFrame question={t('ui.timeline.question')} answer={answer} table={<TransferRows transfers={unique} provenance={provenance} />}>
      {timed.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={answer}>
          {lanes.map((l, i) => {
            const y = 30 + i * 46
            return (
              <g key={l.address + i}>
                <text x="0" y={y + 4} className="g-cap">
                  {l.label}
                </text>
                <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke="var(--hairline)" />
                {l.transfers
                  .filter((x) => x.timestamp)
                  .map((x) => {
                    const sent = x.fromAddress === l.address
                    const ev = l.evidenceIds.has(x.id)
                    const cx = X(Date.parse(x.timestamp!))
                    return (
                      <g key={x.id}>
                        <title>{`${formatUtc(x.timestamp)} · ${sent ? t('ui.timeline.sent') : t('ui.timeline.received')} · ${formatAmount(x.amountRaw, x.asset)} · ${shortAddress(sent ? x.toAddress : x.fromAddress)}`}</title>
                        {ev && <circle cx={cx} cy={y} r="9" fill="none" stroke="var(--accent)" strokeWidth="2" />}
                        <circle cx={cx} cy={y} r="5" fill={sent ? 'var(--soft)' : 'var(--surface)'} stroke="var(--soft)" strokeWidth="2" />
                      </g>
                    )
                  })}
              </g>
            )
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={LEFT + f * (W - LEFT - RIGHT)} y={H - 8} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} className="g-cap">
              {tick(lo + f * span, span)}
            </text>
          ))}
        </svg>
      )}
      <div className="legend caption t2">
        <span>
          <i className="lg-dot" /> {t('ui.timeline.sent')}
        </span>
        <span>
          <i className="lg-dot lg-hollow" /> {t('ui.timeline.received')}
        </span>
        <span>
          <i className="lg-dot lg-evidence-ring" /> {t('ui.timeline.evidence')}
        </span>
      </div>
      {untimed > 0 && <p className="caption muted">{t('ui.timeline.noTimestamp', { n: untimed })}</p>}
    </ChartFrame>
  )
}
