// Status colour always comes with an icon and a word (colour is never the only signal).
import type { Action, RiskLevel } from '../api/types'
import { useCopy, useT } from '../i18n/hooks'

const ACTION_ICON: Record<Action, string> = { ALLOW: '✓', WARN: '!', REVIEW: '⏸', BLOCK: '✕' }
const LEVEL_TONE: Record<RiskLevel, Action> = { LOW: 'ALLOW', MEDIUM: 'WARN', HIGH: 'BLOCK' }

export function StatusIcon({ tone }: { tone: Action | 'NONE' }) {
  return (
    <span className={`status-ic status-${tone.toLowerCase()}`} aria-hidden="true">
      {tone === 'NONE' ? '–' : ACTION_ICON[tone]}
    </span>
  )
}

export function DecisionTag({ action, size = 'md' }: { action: Action; size?: 'md' | 'lg' }) {
  const copy = useCopy()
  return (
    <span className={`tag tag-${size}`}>
      <StatusIcon tone={action} />
      {copy.decision(action).label}
    </span>
  )
}

export function RiskTag({ level }: { level: RiskLevel | null }) {
  const copy = useCopy()
  const t = useT()
  return (
    <span className="tag">
      <StatusIcon tone={level ? LEVEL_TONE[level] : 'NONE'} />
      {level ? copy.level(level) : t('ui.risk.notScored')}
    </span>
  )
}
