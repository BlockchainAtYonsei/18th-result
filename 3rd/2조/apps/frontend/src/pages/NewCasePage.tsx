// New case: one transfer in; both wallets are analysed, then the policy decides (design doc §6.3).
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { currentApiMode, scenariosFor } from '../app/apiMode'
import { getIdentity } from '../app/identity'
import { useApi } from '../app/useApi'
import { scenarioSender } from '../contracts/catalog'
import { newCaseId, type CaseRecord, type CaseRun, type RunStep, type StoredError } from '../cases/model'
import { useCases } from '../cases/useCases'
import { runCase, type RunCaseOptions, type RunProgress } from '../flow/runCase'
import { useT } from '../i18n/hooks'
import { initialForm, validateForm, type FormErrors, type FormState } from './newcase/form'
import { RunProgressView } from './newcase/RunProgressView'
import { ScenarioList } from './newcase/ScenarioList'
import { TransferForm } from './newcase/TransferForm'

export function NewCasePage({ runOptions }: { runOptions?: Partial<RunCaseOptions> }) {
  const t = useT()
  const api = useApi()
  const navigate = useNavigate()
  const { cases, save, ready } = useCases()
  const [form, setForm] = useState<FormState>(() => initialForm(new Date(), scenariosFor(currentApiMode()).map((s) => s.fixtureId)))
  const [errors, setErrors] = useState<FormErrors>({})
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [failure, setFailure] = useState<{ error: StoredError; step: RunStep | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const record = useRef<CaseRecord | null>(null)

  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  async function execute(base: CaseRecord) {
    record.current = base
    setCaseId(base.id)
    setBusy(true)
    setFailure(null)
    const upsert = (run: CaseRun) => {
      const r = record.current!
      const next = { ...r, runs: [...r.runs.filter((x) => x.runId !== run.runId), run] }
      record.current = next
      return save(next)
    }
    try {
      const final = await runCase(api, base.input, (p, run) => {
        setProgress(p)
        void upsert(run).catch(() => {})
      }, { apiMode: currentApiMode(), ...runOptions })
      await upsert(final)
      if (final.status === 'DONE') navigate(`/cases/${base.id}`)
      else if (final.error) setFailure({ error: final.error, step: final.failedStep })
    } catch { /* CasesProvider displays the storage failure and keeps the pending snapshot. */ }
    finally { setBusy(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    const v = validateForm(form)
    setErrors(v.errors)
    if (!v.input) return
    const base: CaseRecord = {
      id: currentApiMode() === 'backend' ? `CL-${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, '0')}` : newCaseId(cases),
      createdAt: new Date().toISOString(),
      createdBy: getIdentity()?.name ?? 'Unknown',
      input: v.input,
      runs: [],
    }
    await execute(base)
  }

  return (
    <main className="page">
      <nav className="crumb caption" aria-label={t('ui.breadcrumb')}>
        <Link to="/">{t('ui.newcase.crumb')}</Link> / {t('ui.newcase.title')}
      </nav>
      <div className="page-head">
        <div>
          <h1>{t('ui.newcase.title')}</h1>
          <p className="answer">{t('ui.newcase.answer')}</p>
        </div>
      </div>

      <form onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="plain">
          <TransferForm form={form} set={set} errors={errors} />
        </fieldset>
        <div className="nc-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !ready}>
            {busy ? t('ui.newcase.running') : t('ui.newcase.run')}
          </button>
        </div>
      </form>

      {progress && caseId && (
        <RunProgressView progress={progress} failure={failure} caseId={caseId} onRetry={() => record.current && void execute(record.current)} />
      )}

      {!busy && (
        <ScenarioList
          current={form.mode === 'FIXTURE' ? form.recipientFx : null}
          onPick={(fixtureId) => set({ mode: 'FIXTURE', senderFx: scenarioSender(fixtureId), recipientFx: fixtureId })}
        />
      )}
    </main>
  )
}
