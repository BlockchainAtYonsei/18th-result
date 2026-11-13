import type { CaseRun } from '../../cases/model'
import { useT } from '../../i18n/hooks'
import { formatUtc } from '../../lib/format'

export function RunSwitcher({ runs, selected, onSelect }: { runs: CaseRun[]; selected: string; onSelect: (runId: string) => void }) {
  const t = useT()
  if (runs.length < 2) return null
  const ordered = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
  return (
    <label className="run-switch">
      <span className="caption muted">{t('ui.case.runLabel')}</span>
      <select className="input" value={selected} onChange={(e) => onSelect(e.target.value)}>
        {ordered.map((r, i) => (
          <option key={r.runId} value={r.runId}>
            {t('ui.case.runOption', { n: i + 1, when: formatUtc(r.startedAt) })}
            {i === ordered.length - 1 ? ` (${t('ui.case.runLatest')})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
