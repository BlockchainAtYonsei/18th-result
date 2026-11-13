// One model's answer for one scenario: a picture, the outcome sentence, and the simulator's explanations.
// The picture shows the scenario that was sent and only the steps the simulator reported in its result.
import type { ConstellationScenario, ConstellationSimulationResult } from '../../../api/types'
import { ErrorNotice } from '../../../components/ErrorNotice'
import type { ConstellationSimRecord } from '../../../cases/model'
import { useCopy, useT, type MessageKey } from '../../../i18n/hooks'

const MAX_DRAWN = 8

function ProposerDiagram({ s, result }: { s: ConstellationScenario; result: ConstellationSimulationResult }) {
  const t = useT()
  const n = Math.min(s.proposerCount, MAX_DRAWN)
  // more proposers than fit: keep the rejecting share, and never draw a group that exists as empty
  const share = Math.round((s.rejectingProposerCount / s.proposerCount) * n)
  const rejecting =
    s.proposerCount <= MAX_DRAWN
      ? Math.min(s.rejectingProposerCount, n)
      : Math.min(Math.max(share, s.rejectingProposerCount > 0 ? 1 : 0), s.rejectingProposerCount < s.proposerCount ? n - 1 : n)
  const accepting = n - rejecting
  const target = s.submittedToAcceptingProposer ? (accepting > 0 ? 0 : -1) : rejecting > 0 ? n - 1 : -1
  const H = Math.max(170, n * 32 + 46)
  const top = 30
  const ys = Array.from({ length: n }, (_, i) => (n === 1 ? (H + top) / 2 : top + 14 + (i * (H - top - 34)) / (n - 1)))
  const mid = (H + top) / 2

  // What the result reports, not what the inputs suggest:
  const path = result.proposerPathAvailable
  const codes = result.explanationCodes
  // only a model with an attestation step has proposer batches going to the leader
  const batches = codes.includes('ATTESTATION_CONDITION_MET') ? 'attested' : codes.includes('ATTESTATION_CONDITION_NOT_MET') ? 'unattested' : null
  const reached = result.outcome === 'INCLUSION_ENFORCED' || result.outcome === 'INCLUSION_NOT_ENFORCED'

  return (
    <svg className={`net-diagram net-${result.outcome.toLowerCase()} ${result.blockStatus === 'INVALID_LEADER_EXCLUSION' ? 'net-invalid-block' : ''}`} viewBox={`0 0 360 ${H}`} role="img" aria-label={t('ui.sim.network.diagramAnswer', { n: s.proposerCount, k: s.rejectingProposerCount })}>
      {[
        [43, 'ui.sim.network.diagramTx'],
        [176, 'ui.sim.network.diagramProposers'],
        [300, 'ui.sim.network.diagramLeader'],
      ].map(([x, key]) => (
        <text key={key} x={x} y="14" textAnchor="middle" className="g-cap">
          {t(key as MessageKey)}
        </text>
      ))}
      <rect x="14" y={mid - 14} width="58" height="28" rx="6" fill="var(--surface-2)" stroke="var(--line)" />
      {ys.map((y, i) => {
        const rej = i >= accepting
        return (
          <g key={i}>
            <line x1="72" y1={mid} x2="160" y2={y} stroke="var(--hairline)" />
            {i === target && path && <path className="draw d1" pathLength={1} d={`M72 ${mid} L160 ${y}`} stroke="var(--accent)" strokeWidth="2.5" fill="none" />}
            {!rej && batches === 'attested' && reached && <path className="draw d2 batch-attested" pathLength={1} d={`M190 ${y} L276 ${mid}`} stroke="rgb(18 154 240 / 0.7)" strokeWidth="1.5" fill="none" />}
            {!rej && batches === 'unattested' && <line className="batch-unattested" x1="190" y1={y} x2="276" y2={mid} stroke="var(--muted)" strokeDasharray="3 4" />}
            {/* no attestation step in this model: the transfer simply goes on to the leader */}
            {i === target && path && reached && batches === null && <path className="draw d2 to-leader" pathLength={1} d={`M190 ${y} L276 ${mid}`} stroke="var(--accent)" strokeWidth="1.5" fill="none" />}
            <circle className={`proposer ${rej ? 'proposer-rejecting' : ''}`} cx="176" cy={y} r="14" fill="var(--surface-2)" stroke={rej ? 'var(--block)' : 'var(--soft)'} strokeWidth="2" />
            <text x="176" y={y + 4} textAnchor="middle" className="g-cap" style={{ fill: rej ? '#ff8a8a' : 'var(--text)' }}>
              {rej ? '✕' : `P${i + 1}`}
            </text>
          </g>
        )
      })}
      <circle cx="300" cy={mid} r="22" fill="var(--surface-2)" stroke="var(--hairline)" strokeWidth="2" />
      <g className="net-leader d3">
        <circle cx="300" cy={mid} r="22" fill="none" strokeWidth="2.5" />
        <text x="300" y={mid + 5} textAnchor="middle">
          {result.blockStatus === 'INVALID_LEADER_EXCLUSION' ? '✕' : result.outcome === 'INCLUSION_ENFORCED' ? '✓' : result.outcome === 'INCLUSION_NOT_ENFORCED' ? '?' : '–'}
        </text>
      </g>
    </svg>
  )
}

export function ResultCard({ rec, animated }: { rec: ConstellationSimRecord; animated: boolean }) {
  const t = useT()
  const copy = useCopy()
  if (!rec.result) return rec.error ? <ErrorNotice error={rec.error} /> : null
  const mock = rec.result.explanationCodes.includes('MOCK_RESULT_NOT_PROTOCOL_VALIDATED')
  return (
    <div className={`sim-result ${animated && !mock ? '' : 'is-static'}`}>
      <span className="caption t2">{copy.modelName(rec.version)}</span>
      {/* a placeholder result says nothing about the scenario, so it gets no picture */}
      {!mock && <ProposerDiagram s={rec.scenario} result={rec.result} />}
      {!mock && rec.scenario.proposerCount > MAX_DRAWN && <span className="caption muted">{t('ui.sim.network.diagramClamped', { shown: MAX_DRAWN, n: rec.scenario.proposerCount })}</span>}
      {rec.result.blockStatus && <p className="caption">{t(`ui.sim.network.blockStatus.${rec.result.blockStatus}`)}</p>}
      {rec.result.modelParameters && <p className="caption muted">{t('ui.sim.network.appliedRules', { inclusion: rec.result.modelParameters.psliceInclusionThresholdPercent, participation: rec.result.modelParameters.blockParticipationThresholdPercent })}</p>}
      {rec.scenario.attesterParticipationPercent !== undefined && <p className="caption">{t('ui.sim.network.inputSummary', { pslice: rec.scenario.attestationPercent, participation: rec.scenario.attesterParticipationPercent })}</p>}
      {rec.version.startsWith('0.1.0-') && <p className="notice caption">{t('ui.sim.network.legacy')}</p>}
      <strong className="sim-outcome">{copy.networkOutcome(rec.result.outcome)}</strong>
      {mock && <p className="notice notice-warn caption">{t('ui.sim.network.mockWarning')}</p>}
      <ul className="plain-list caption t2">
        {rec.result.explanationCodes.map((c) => (
          <li key={c}>{copy.explanation(c)}</li>
        ))}
      </ul>
    </div>
  )
}
