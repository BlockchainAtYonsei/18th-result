// The server's score on a 0–100 bar with the ruleset's high-risk line. Null is "Not scored", never 0.
import type { RiskLevel } from '../api/types'
import { useCopy, useT } from '../i18n/hooks'
import { RiskTag } from './StatusTag'

const FILL: Record<RiskLevel, string> = { LOW: 'var(--allow)', MEDIUM: 'var(--warn)', HIGH: 'var(--block)' }

export function RiskGauge({ score, level, highThreshold }: { score: number | null; level: RiskLevel | null; highThreshold: number | null }) {
  const t = useT()
  const copy = useCopy()
  const label =
    score === null ? t('ui.risk.gaugeLabelNone') : t('ui.risk.gaugeLabel', { score, level: level ? copy.level(level) : '' })

  return (
    <div className="gauge">
      <div className="gauge-head">
        {score === null ? (
          <span className="gauge-value gauge-none">{t('ui.risk.notScored')}</span>
        ) : (
          <>
            <span className="gauge-value">{score}</span>
            <span className="muted">{t('ui.risk.outOf')}</span>
          </>
        )}
        {level !== null && <RiskTag level={level} />}
      </div>
      <svg className="gauge-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={label}>
        {score === null ? (
          <rect x="0" y="2" width="100" height="6" rx="3" fill="url(#gauge-hatch)" />
        ) : (
          <>
            <rect x="0" y="2" width="100" height="6" rx="3" fill="var(--fill-2)" />
            <rect x="0" y="2" width={Math.max(score, 1.5)} height="6" rx="3" fill={level ? FILL[level] : 'var(--accent)'} />
          </>
        )}
        {highThreshold !== null && <line x1={highThreshold} x2={highThreshold} y1="0" y2="10" stroke="var(--text-2)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />}
        <defs>
          <pattern id="gauge-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="var(--fill-1)" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="var(--na)" strokeWidth="1.2" />
          </pattern>
        </defs>
      </svg>
      {score !== null && (
        <div className="gauge-scale caption muted">
          <span>0</span>
          {highThreshold !== null && (
            <span className="gauge-mark" style={{ left: `${highThreshold}%` }}>
              {t('ui.risk.threshold', { n: highThreshold })}
            </span>
          )}
          <span>100</span>
        </div>
      )}
      {score === null && <p className="caption t2">{t('ui.risk.notScoredDetail')}</p>}
      {level === 'LOW' && <p className="caption t2">{t('ui.risk.lowCaveat')}</p>}
    </div>
  )
}
