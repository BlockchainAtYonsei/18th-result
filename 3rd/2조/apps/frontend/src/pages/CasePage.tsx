// Case page: the outcome and its reason, the evidence, then everything else folded away (design doc §6.4).
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { currentApiMode } from '../app/apiMode'
import { useApi } from '../app/useApi'
import { DitherLoader } from '../components/DitherLoader'
import { ErrorNotice } from '../components/ErrorNotice'
import { latestRun, type CaseRecord, type CaseRun } from '../cases/model'
import { useCases } from '../cases/useCases'
import { runCase, type RunCaseOptions } from '../flow/runCase'
import { useT } from '../i18n/hooks'
import { RunSwitcher } from './case/RunSwitcher'
import { VerdictHeader } from './case/VerdictHeader'
import { WhyChain } from './case/WhyChain'
import { CaseDetails } from './case/CaseDetails'
import { SimulationDialog } from './case/simulation/SimulationDialog'

export function CasePage({ runOptions }: { runOptions?: Partial<RunCaseOptions> }) {
  const t = useT()
  const api = useApi()
  const { caseId } = useParams()
  const { cases, ready, update } = useCases()
  const record = cases.find((c) => c.id === caseId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [simOpen, setSimOpen] = useState(false)

  if (!ready) return <main className="page" />
  if (!record) {
    return (
      <main className="page">
        <p className="t2">{t('ui.case.notFound')}</p>
        <Link to="/">{t('ui.case.back')}</Link>
      </main>
    )
  }

  const run = record.runs.find((r) => r.runId === selectedId) ?? latestRun(record)
  const provenance = run?.recipient?.result.dataProvenance ?? run?.sender?.result.dataProvenance ?? null

  async function rerun(base: CaseRecord) {
    setRerunning(true)
    // each write starts from the stored case, not from the copy this click saw (a simulation may save meanwhile)
    const upsert = (r: CaseRun) => update(base.id, (c) => ({ ...c, runs: [...c.runs.filter((x) => x.runId !== r.runId), r] }))
    try {
      const final = await runCase(api, base.input, (_p, r) => void upsert(r).catch(() => {}), { apiMode: currentApiMode(), ...runOptions })
      await upsert(final)
      setSelectedId(final.runId)
    } catch { /* The shared storage notice offers retry without losing the snapshot. */ } finally {
      setRerunning(false)
    }
  }

  return (
    <main className="page case-page">
      <nav className="crumb caption" aria-label={t('ui.breadcrumb')}>
        <Link to="/">{t('ui.case.crumb')}</Link> / <span className="mono">{record.id}</span>
      </nav>
      {run && <RunSwitcher runs={record.runs} selected={run.runId} onSelect={setSelectedId} />}

      {run && (
        <VerdictHeader input={record.input} run={run} provenance={provenance} onSimulate={run.status === 'DONE' ? () => setSimOpen(true) : undefined} />
      )}

      {run?.status === 'FAILED' && run.error && (
        <section className="section">
          <p className="t2">{t('ui.case.failed')}</p>
          <ErrorNotice error={run.error} step={run.failedStep ?? undefined} />
          <div>
            <button type="button" className="btn" disabled={rerunning} onClick={() => void rerun(record)}>
              {rerunning ? t('ui.case.rerunning') : t('ui.case.rerun')}
            </button>
          </div>
        </section>
      )}
      {run?.status === 'RUNNING' && !rerunning && <section className="notice notice-warn">
        <p>{t('ui.storage.incomplete')}</p>
        <button type="button" className="btn" onClick={() => void rerun(record)}>{t('ui.case.rerun')}</button>
      </section>}
      {rerunning && <DitherLoader label={t('ui.case.running')} />}

      {run?.compliance && <WhyChain input={record.input} run={run} />}
      {run && <CaseDetails record={record} input={record.input} run={run} />}
      {run?.status === 'DONE' && (
        <SimulationDialog open={simOpen} onOpenChange={setSimOpen} record={record} run={run} rerunning={rerunning} onRerun={() => void rerun(record)} />
      )}
    </main>
  )
}
