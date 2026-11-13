// "On the network": once a route submits the transfer, can the block leader still leave it out? (design doc §6.5)
// Scenario buttons describe inputs only; every sentence about the result comes from what the simulator returned.
import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ConstellationScenario, ConstellationSimulationResult } from '../../../api/types'
import { constellationModelOptions, currentApiMode } from '../../../app/apiMode'
import { useApi } from '../../../app/useApi'
import { ChartFrame } from '../../../components/ChartFrame'
import { DitherLoader } from '../../../components/DitherLoader'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { Term } from '../../../components/Term'
import type { CaseRun, ConstellationSimRecord } from '../../../cases/model'
import { defaultConstellationScenario, protocolModels } from '../../../contracts/catalog'
import { isStale, latestCompare, latestSweep, runAttestationSweep, runConstellationCompare } from '../../../flow/simulate'
import { useCopy, useT, type MessageKey } from '../../../i18n/hooks'
import { markFresh, useFresh } from './fresh'
import { ResultCard } from './NetworkResult'

export type NetworkBusy = null | 'run' | 'sweep'

const OUTCOME_FILL: Record<ConstellationSimulationResult['outcome'], string> = {
  INCLUSION_ENFORCED: 'var(--accent)',
  INCLUSION_NOT_ENFORCED: 'url(#sw-hatch)',
  NO_SUBMISSION_PATH: 'var(--deep)',
  INVALID_SCENARIO: 'var(--fill-2)',
  BLOCK_SKIPPED: 'var(--review)',
}

const BASE: ConstellationScenario = { ...defaultConstellationScenario, proposerCount: 16, rejectingProposerCount: 1, attesterParticipationPercent: 100, submittedToAcceptingProposer: true, psliceAvailable: true, leaderAttemptsExclusion: true }
// Inputs only. What each scenario leads to is whatever the simulator answers.
const PRESETS: { label: MessageKey; scenario: ConstellationScenario }[] = [
  { label: 'ui.sim.network.presetHigh', scenario: { ...BASE, attestationPercent: 100 } },
  { label: 'ui.sim.network.presetLow', scenario: { ...BASE, attestationPercent: 30 } },
  { label: 'ui.sim.network.presetBoundary', scenario: { ...BASE, attestationPercent: 40, attesterParticipationPercent: 60 } },
  { label: 'ui.sim.network.presetParticipationLow', scenario: { ...BASE, attestationPercent: 40, attesterParticipationPercent: 59.99 } },
  { label: 'ui.sim.network.presetReject', scenario: { ...BASE, attestationPercent: 100, rejectingProposerCount: BASE.proposerCount, submittedToAcceptingProposer: false } },
]
const same = (a: ConstellationScenario, b: ConstellationScenario) => (Object.keys(a) as (keyof ConstellationScenario)[]).every((k) => a[k] === b[k])

// Runs whose first comparison was started on opening the tab (survives remounts, so it starts once).
const autoStarted = new Set<string>()

/** Puts components (terms) into a sentence at its {placeholders}. */
function rich(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((seg, i) => {
    const name = /^\{(\w+)\}$/.exec(seg)?.[1]
    return <Fragment key={i}>{name && parts[name] !== undefined ? parts[name] : seg}</Fragment>
  })
}

/** A card that plays the run animation only for a result that was just produced. */
function FreshCard({ rec }: { rec: ConstellationSimRecord }) {
  return <ResultCard rec={rec} animated={useFresh(rec.key)} />
}

export function NetworkTab({
  run,
  busy,
  setBusy,
  onSave,
}: {
  run: CaseRun
  busy: NetworkBusy
  setBusy: (b: NetworkBusy) => void
  onSave: (records: ConstellationSimRecord[]) => Promise<void>
}) {
  const t = useT()
  const copy = useCopy()
  const api = useApi()
  const mockMode = currentApiMode() === 'mock'
  const options = constellationModelOptions
  const [s, setS] = useState<ConstellationScenario>(PRESETS[0].scenario)
  const [modelA, setModelA] = useState(options[0] ?? '')
  const [modelB, setModelB] = useState(options[1] ?? '')
  const [bad, setBad] = useState(false)

  const compare = latestCompare(run)
  const sweep = latestSweep(run).shown
  // a failed later attempt, reported once (when the failed attempt is itself what is shown, its cards carry the error)
  const failure = isStale(compare.last) || compare.last[0]?.batch === compare.shown[0]?.batch ? null : (compare.last.find((r) => r.error)?.error ?? null)
  const drawn = compare.shown[0]?.scenario ?? s

  const go = useCallback(
    async (kind: 'run' | 'sweep', scenario: ConstellationScenario) => {
      setBusy(kind)
      // The Mock only answers for its placeholder version, whatever the build offers.
      const versions = mockMode ? [protocolModels.mockVersion] : [modelA, ...(modelB && modelB !== modelA ? [modelB] : [])]
      try {
        const records = kind === 'run' ? await runConstellationCompare(api, run, versions, scenario) : await runAttestationSweep(api, run, versions[0], scenario)
        if (kind === 'run') records.forEach((r) => markFresh(r.key))
        await onSave(records)
      } catch { /* CasesProvider exposes storage errors and keeps pending results. */ } finally {
        setBusy(null)
      }
    },
    [api, run, mockMode, modelA, modelB, onSave, setBusy],
  )

  // Opening the tab shows a first result; saved results are shown as they are.
  const neverRan = compare.shown.length === 0
  useEffect(() => {
    if (!neverRan || autoStarted.has(run.runId)) return
    autoStarted.add(run.runId)
    void go('run', PRESETS[0].scenario)
  }, [neverRan, run.runId, go])

  const valid = () => Number.isInteger(s.proposerCount) && s.proposerCount >= 1 && Number.isInteger(s.rejectingProposerCount) && s.rejectingProposerCount >= 0 && s.attestationPercent >= 0 && s.attestationPercent <= 100 && s.attesterParticipationPercent !== undefined && s.attesterParticipationPercent >= 0 && s.attesterParticipationPercent <= 100
  const custom = (kind: 'run' | 'sweep') => {
    if (!valid()) return setBad(true)
    setBad(false)
    void go(kind, s)
  }
  const num = (k: 'proposerCount' | 'rejectingProposerCount' | 'attestationPercent' | 'attesterParticipationPercent') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS((x) => ({ ...x, [k]: e.target.value === '' ? NaN : Number(e.target.value) }))
  const flag = (k: 'submittedToAcceptingProposer' | 'psliceAvailable' | 'leaderAttemptsExclusion') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS((x) => ({ ...x, [k]: e.target.checked }))

  return (
    <div className="sim-tab">
      <div className="sim-head">
        <h3>{t('ui.sim.network.question')}</h3>
        <p className="t2">
          {rich(t('ui.sim.network.context'), {
            leader: <Term id="leader" />,
            constellation: <Term id="constellation" />,
            attestations: <Term id="attestation">{t('ui.sim.network.attestations')}</Term>,
          })}
        </p>
      </div>
      {!mockMode && <p className="notice caption">{t('ui.sim.network.researchRules')}</p>}
      {mockMode && <p className="notice caption">{t('ui.sim.network.mockOnly')}</p>}

      {!mockMode && (
        <div className="seg presets" role="group" aria-label={t('ui.sim.network.presets')}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={compare.shown.length > 0 && same(drawn, p.scenario) ? 'on' : ''}
              aria-pressed={compare.shown.length > 0 && same(drawn, p.scenario)}
              disabled={busy !== null}
              onClick={() => {
                setS(p.scenario)
                void go('run', p.scenario)
              }}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      )}

      <div className={`sim-results ${compare.shown.length > 1 ? 'two' : ''}`}>
        {busy === 'run' && <DitherLoader label={t('ui.sim.network.running')} />}
        {busy !== 'run' && compare.shown.map((r) => <FreshCard key={r.key} rec={r} />)}
        {failure && <ErrorNotice error={failure} />}
      </div>

      {!mockMode && (
        <details className="fold">
          <summary>
            <span className="fold-title">{t('ui.sim.network.custom')}</span>
          </summary>
          <div className="fold-body">
            <fieldset className="plain net-inputs">
              <div className="row2">
                <div className="field">
                  <label htmlFor="sim-p">{t('ui.sim.network.proposers')}</label>
                  <input id="sim-p" className="input" type="number" min={1} value={Number.isNaN(s.proposerCount) ? '' : s.proposerCount} onChange={num('proposerCount')} />
                </div>
                <div className="field">
                  <label htmlFor="sim-r">{t('ui.sim.network.rejecting')}</label>
                  <input id="sim-r" className="input" type="number" min={0} value={Number.isNaN(s.rejectingProposerCount) ? '' : s.rejectingProposerCount} onChange={num('rejectingProposerCount')} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sim-a">{t('ui.sim.network.attestation')}</label>
                <input id="sim-a" className="input" type="number" min={0} max={100} step={0.01} value={Number.isNaN(s.attestationPercent) ? '' : s.attestationPercent} onChange={num('attestationPercent')} />
              </div>
              <div className="field">
                <label htmlFor="sim-participation">{t('ui.sim.network.participation')}</label>
                <input id="sim-participation" className="input" type="number" min={0} max={100} step={0.01} value={s.attesterParticipationPercent === undefined || Number.isNaN(s.attesterParticipationPercent) ? '' : s.attesterParticipationPercent} onChange={num('attesterParticipationPercent')} />
              </div>
              <label className="check">
                <input type="checkbox" checked={s.submittedToAcceptingProposer} onChange={flag('submittedToAcceptingProposer')} /> {t('ui.sim.network.submitted')}
              </label>
              <label className="check">
                <input type="checkbox" checked={s.psliceAvailable} onChange={flag('psliceAvailable')} /> {t('ui.sim.network.pslice')}
              </label>
              <label className="check">
                <input type="checkbox" checked={s.leaderAttemptsExclusion} onChange={flag('leaderAttemptsExclusion')} /> {t('ui.sim.network.leaderTries')}
              </label>
              <div className="row2">
                <div className="field">
                  <label htmlFor="sim-ma">{t('ui.sim.network.modelA')}</label>
                  <select id="sim-ma" className="input" value={modelA} onChange={(e) => setModelA(e.target.value)}>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {copy.modelName(o)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sim-mb">{t('ui.sim.network.modelB')}</label>
                  <select id="sim-mb" className="input" value={modelB} onChange={(e) => setModelB(e.target.value)}>
                    <option value="">{t('ui.sim.network.none')}</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {copy.modelName(o)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {bad && <span className="field-error">{t('ui.sim.network.badInputs')}</span>}
              <div className="net-actions">
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => custom('run')}>
                  {busy === 'run' ? t('ui.sim.network.running') : t('ui.sim.network.run')}
                </button>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => custom('sweep')}>
                  {busy === 'sweep' ? t('ui.sim.network.sweeping') : t('ui.sim.network.sweep')}
                </button>
              </div>
            </fieldset>
            {busy === 'sweep' && <DitherLoader label={t('ui.sim.network.sweeping')} />}
            {sweep.length > 0 && (
              <ChartFrame
                question={t('ui.sim.network.sweepQuestion')}
                answer={t('ui.sim.network.sweepAnswer', { step: 5 })}
                table={
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t('ui.sim.network.colAttestation')}</th>
                        <th>{t('ui.sim.network.colModel')}</th>
                        <th>{t('ui.sim.network.colOutcome')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sweep.map((r) => (
                        <tr key={r.key}>
                          <td>{r.scenario.attestationPercent}%</td>
                          <td>{copy.modelName(r.version)}</td>
                          <td>{r.result ? copy.networkOutcome(r.result.outcome) : t('ui.sim.network.failed')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <svg viewBox="0 0 820 70" role="img" aria-label={t('ui.sim.network.sweepQuestion')}>
                  <defs>
                    <pattern id="sw-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="var(--surface)" />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--na)" strokeWidth="2" />
                    </pattern>
                  </defs>
                  {sweep.map((r, i) => {
                    const w = 800 / sweep.length
                    return (
                      <g key={r.key}>
                        <title>{`${r.scenario.attestationPercent}% · ${r.result ? copy.networkOutcome(r.result.outcome) : t('ui.sim.network.failed')}`}</title>
                        <rect x={10 + i * w + 1} y="8" width={w - 2} height="26" fill={r.result ? OUTCOME_FILL[r.result.outcome] : 'var(--fill-1)'} />
                      </g>
                    )
                  })}
                  {[0, 25, 50, 75, 100].map((p) => (
                    <text key={p} x={10 + (p / 100) * 800} y="56" textAnchor={p === 0 ? 'start' : p === 100 ? 'end' : 'middle'} className="g-cap">
                      {p}%
                    </text>
                  ))}
                </svg>
                <div className="legend caption t2">
                  {(['INCLUSION_ENFORCED', 'INCLUSION_NOT_ENFORCED', 'NO_SUBMISSION_PATH', 'INVALID_SCENARIO', 'BLOCK_SKIPPED'] as const).map((o) => (
                    <span key={o}>
                      <i className={`lg-swatch sw-${o.toLowerCase()}`} /> {copy.networkOutcome(o)}
                    </span>
                  ))}
                </div>
              </ChartFrame>
            )}
          </div>
        </details>
      )}

      <p className="caption muted">{t('ui.sim.network.notice')}</p>
    </div>
  )
}
