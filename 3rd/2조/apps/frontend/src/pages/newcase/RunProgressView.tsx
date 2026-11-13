import { Link } from 'react-router'
import { DitherLoader } from '../../components/DitherLoader'
import { ErrorNotice } from '../../components/ErrorNotice'
import type { RunStep, StoredError } from '../../cases/model'
import type { RunProgress, StepState } from '../../flow/runCase'
import { useT } from '../../i18n/hooks'

const STEPS: RunStep[] = ['sender', 'recipient', 'policy']
const ENDPOINT: Record<RunStep, string> = {
  sender: 'POST /analyses',
  recipient: 'POST /analyses',
  policy: 'POST /compliance/evaluate',
}

function Mark({ state, n }: { state: StepState; n: number }) {
  if (state === 'done') return <span className="step-mark done" aria-hidden="true">✓</span>
  if (state === 'failed') return <span className="step-mark failed" aria-hidden="true">✕</span>
  return <span className={`step-mark ${state}`} aria-hidden="true">{n}</span>
}

export function RunProgressView({
  progress,
  failure,
  caseId,
  onRetry,
}: {
  progress: RunProgress
  failure: { error: StoredError; step: RunStep | null } | null
  caseId: string
  onRetry: () => void
}) {
  const t = useT()
  const label: Record<StepState, string> = {
    pending: t('ui.newcase.stepPending'),
    running: t('ui.newcase.stepRunning'),
    done: t('ui.newcase.stepDone'),
    failed: t('ui.newcase.stepFailed'),
  }
  return (
    <section className="run-progress" aria-live="polite">
      <h2>{t('ui.newcase.progressTitle')}</h2>
      <ol className="pipeline">
        {STEPS.map((s, i) => (
          <li key={s} className={`pipe-step ${progress[s]}`}>
            <Mark state={progress[s]} n={i + 1} />
            <span className="pipe-name">{t(`ui.step.${s}`)}</span>
            <span className="caption mono muted">{ENDPOINT[s]}</span>
            {progress[s] === 'running' ? <DitherLoader label={label.running} /> : <span className="caption t2">{label[progress[s]]}</span>}
          </li>
        ))}
      </ol>
      {failure && (
        <div className="run-failure">
          <ErrorNotice error={failure.error} step={failure.step ?? undefined} onRetry={onRetry} />
          <Link to={`/cases/${caseId}`}>{t('ui.newcase.openCase')}</Link>
        </div>
      )}
    </section>
  )
}
