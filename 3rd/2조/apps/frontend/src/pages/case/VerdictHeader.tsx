// The top of the case page, in reading order: the outcome, why, then one small line of context (design doc §6.4).
import type { DataProvenance } from '../../api/types'
import { AddressChip } from '../../components/AddressChip'
import { RiskTag, StatusIcon } from '../../components/StatusTag'
import type { CaseInput, CaseRun } from '../../cases/model'
import { useCopy, useT } from '../../i18n/hooks'
import { formatAmount } from '../../lib/format'
import { evaluationFor } from './runData'

export function VerdictHeader({
  input,
  run,
  provenance,
  onSimulate,
}: {
  input: CaseInput
  run: CaseRun
  provenance: DataProvenance | null
  onSimulate?: () => void
}) {
  const t = useT()
  const copy = useCopy()
  const decision = run.compliance?.decision
  // What each wallet's analysis reported as adding to its score. Listed as reported, never summed here.
  const sides = input.sender.address === input.recipient.address ? (['sender'] as const) : (['sender', 'recipient'] as const)
  const basis = sides.flatMap((side) => (evaluationFor(run, side)?.detectedRules ?? []).map((rule) => ({ side, rule })))

  return (
    <section className={`verdict ${decision ? `verdict-${decision.action.toLowerCase()}` : ''}`} data-testid="verdict" aria-labelledby={decision ? 'verdict-title' : undefined}>
      <p className="verdict-transfer caption">
        <AddressChip address={input.sender.address} provenance={provenance} links={false} />
        <span>→ {formatAmount(input.amountRaw, input.asset)} →</span>
        <AddressChip address={input.recipient.address} provenance={provenance} links={false} />
        {provenance && <span className="data-mark">{copy.dataType(provenance.dataType)}</span>}
      </p>
      {decision && (
        <>
          <h1 id="verdict-title" className="verdict-title">
            <StatusIcon tone={decision.action} />
            {copy.decision(decision.action).headline}
          </h1>
          <ul className="reasons">
            {decision.reasonCodes.map((code) => {
              const r = copy.reason(code)
              return (
                <li key={code}>
                  <strong>{r.title}</strong>
                  <span className="t2">{r.detail}</span>
                </li>
              )
            })}
          </ul>
          <div className="verdict-foot">
            <p className="verdict-score">
              {decision.riskScore === null ? (
                <>
                  <strong>{t('ui.risk.notScored')}</strong>
                  <span className="t2">{t('ui.risk.notScoredDetail')}</span>
                </>
              ) : (
                <>
                  <span className="t2">{t('ui.case.risk')}</span>
                  <strong className="score-num">{decision.riskScore}</strong>
                  <span className="muted">{t('ui.risk.outOf')}</span>
                  {decision.riskLevel && <RiskTag level={decision.riskLevel} />}
                  {basis.map(({ side, rule }) => (
                    <span key={`${side}-${rule.ruleId}`} className="score-from t2">
                      {t('ui.case.scoreFrom', { side: t(side === 'sender' ? 'ui.flow.sender' : 'ui.flow.recipient'), rule: copy.rule(rule.ruleId).title, n: rule.scoreContribution })}
                    </span>
                  ))}
                  {decision.riskLevel === 'LOW' && <span className="t2">{t('ui.risk.lowCaveat')}</span>}
                </>
              )}
            </p>
            {onSimulate && (
              <button type="button" className="btn btn-primary" onClick={onSimulate}>
                {t('ui.case.simulate')}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
