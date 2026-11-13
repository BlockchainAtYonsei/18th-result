import type { Action } from '../../api/types'
import { DecisionTag } from '../../components/StatusTag'
import { useT } from '../../i18n/hooks'

const ORDER: Action[] = ['ALLOW', 'WARN', 'REVIEW', 'BLOCK']
const FILL: Record<Action, string> = { ALLOW: 'var(--allow)', WARN: 'var(--warn)', REVIEW: 'var(--review)', BLOCK: 'var(--block)' }

/** Counts are printed next to each segment, so the bar is its own table. */
export function DecisionMix({ counts }: { counts: Record<Action, number> }) {
  const t = useT()
  const total = ORDER.reduce((n, a) => n + counts[a], 0)
  if (total === 0) return null
  return (
    <figure className="mix" aria-label={t('ui.dashboard.mixLabel')}>
      <div className="mix-bar">
        {ORDER.filter((a) => counts[a] > 0).map((a) => (
          <span key={a} style={{ flexGrow: counts[a], background: FILL[a] }} title={`${a}: ${counts[a]}`} />
        ))}
      </div>
      <figcaption className="mix-legend">
        {ORDER.map((a) => (
          <span key={a} className={counts[a] === 0 ? 'muted' : ''}>
            <DecisionTag action={a} /> <span className="mix-n">{counts[a]}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
