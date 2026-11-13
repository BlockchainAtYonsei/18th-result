// Cases dashboard: how the transfers screened so far were decided (design doc §6.2).
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { currentApiMode } from '../app/apiMode'
import type { Action } from '../api/types'
import { useCases } from '../cases/useCases'
import { useCopy, useT } from '../i18n/hooks'
import { CaseRow } from './dashboard/CaseRow'
import { DecisionMix } from './dashboard/DecisionMix'
import { caseStatus, filterCases, type CaseFilter } from './dashboard/filter'

const ACTIONS: Action[] = ['BLOCK', 'REVIEW', 'WARN', 'ALLOW']

export function DashboardPage() {
  const t = useT()
  const copy = useCopy()
  const { cases, unreadable, ready } = useCases()
  const [filter, setFilter] = useState<CaseFilter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const c: Record<Action, number> & { failed: number; running: number } = { ALLOW: 0, WARN: 0, REVIEW: 0, BLOCK: 0, failed: 0, running: 0 }
    for (const x of cases) {
      const s = caseStatus(x)
      if (s.kind === 'done') c[s.action] += 1
      else if (s.kind === 'failed') c.failed += 1
      else if (s.kind === 'running') c.running += 1
    }
    return c
  }, [cases])
  const shown = filterCases(cases, filter, query)

  const chips: { id: CaseFilter; label: string; n: number }[] = [
    { id: 'all', label: t('ui.dashboard.filterAll'), n: cases.length },
    ...ACTIONS.map((a) => ({ id: a as CaseFilter, label: copy.decision(a).label, n: counts[a] })),
    { id: 'failed', label: t('ui.dashboard.filterFailed'), n: counts.failed },
  ]

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t('ui.dashboard.title')}</h1>
          <p className="answer">
            {cases.length === 0
              ? t('ui.dashboard.empty')
              : cases.length === 1
                ? t('ui.dashboard.answerOne')
                : t('ui.dashboard.answerMany', { n: cases.length })}
          </p>
        </div>
        <div className="actions">
          <Link to="/cases/new" className="btn btn-primary">
            {t('ui.newCase')}
          </Link>
        </div>
      </div>

      <p className="caption muted">{t(currentApiMode() === 'backend' ? 'ui.storage.server' : 'ui.storage.local')}</p>
      {unreadable.length > 0 && <p className="notice notice-warn">{t('ui.dashboard.unreadable', { n: unreadable.length })}</p>}

      {ready && cases.length === 0 ? (
        <div className="empty">
          <p className="t2">{t('ui.dashboard.emptyHint')}</p>
          <Link to="/cases/new" className="btn">
            {t('ui.newCase')}
          </Link>
        </div>
      ) : (
        <>
          <DecisionMix counts={counts} />
          <div className="filters">
            <div className="chips" role="group">
              {chips.map((c) => (
                <button key={c.id} type="button" className={`chip-btn ${filter === c.id ? 'on' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                  {c.label} <span className="muted">{c.n}</span>
                </button>
              ))}
            </div>
            <input className="input search" type="search" placeholder={t('ui.dashboard.search')} aria-label={t('ui.dashboard.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table className="data cases">
              <thead>
                <tr>
                  <th>{t('ui.dashboard.colCase')}</th>
                  <th>{t('ui.dashboard.colTransfer')}</th>
                  <th>{t('ui.dashboard.colDecision')}</th>
                  <th>{t('ui.dashboard.colWhy')}</th>
                  <th>{t('ui.dashboard.colRisk')}</th>
                  <th>{t('ui.dashboard.colData')}</th>
                  <th>{t('ui.dashboard.colWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <CaseRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="t2 pad">{t('ui.dashboard.noMatch')}</p>}
        </>
      )}
    </main>
  )
}
