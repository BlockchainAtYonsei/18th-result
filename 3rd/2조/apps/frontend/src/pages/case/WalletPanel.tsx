import type { KYTAnalysisResult, KYTEvaluation } from '../../api/types'
import { AddressChip } from '../../components/AddressChip'
import { RiskGauge } from '../../components/RiskGauge'
import { RiskTag } from '../../components/StatusTag'
import { Term } from '../../components/Term'
import { rulesetConfig } from '../../contracts/catalog'
import type { GlossaryId } from '../../i18n/copy'
import { useCopy, useT } from '../../i18n/hooks'

const RULE_TERM: Record<string, GlossaryId> = {
  SANCTION_EXACT: 'sanctionsList',
  SANCTION_DIRECT_FLOW: 'directExposure',
  RAPID_FAN_OUT: 'fanOut',
  RAPID_REPEAT: 'repeat',
}

export function WalletPanel({
  side,
  address,
  result,
  evaluation,
}: {
  side: 'sender' | 'recipient'
  address: string
  result: KYTAnalysisResult | null
  evaluation: KYTEvaluation | null
}) {
  const t = useT()
  const copy = useCopy()
  const ruleset = evaluation ? rulesetConfig(evaluation.rulesetVersion) : undefined
  const coverage = result?.coverage ?? null

  return (
    <section className="wallet" data-testid={`wallet-${side}`}>
      <header className="wallet-head">
        <h3>{t(side === 'sender' ? 'ui.wallet.sender' : 'ui.wallet.recipient')}</h3>
        <AddressChip address={address} provenance={result?.dataProvenance ?? null} copy />
      </header>
      {!evaluation ? (
        <p className="t2">{t('ui.wallet.notRun')}</p>
      ) : (
        <>
          <RiskGauge score={evaluation.riskScore} level={evaluation.riskLevel} highThreshold={ruleset?.highRiskThreshold ?? null} />
          <div className="wallet-block">
            <span className="caption muted">{t('ui.wallet.rules')}</span>
            {evaluation.detectedRules.length === 0 ? (
              <p className="t2">{t('ui.wallet.noRules')}</p>
            ) : (
              <ul className="rules">
                {evaluation.detectedRules.map((r) => {
                  const text = copy.rule(r.ruleId, ruleset?.rules[r.ruleId])
                  const term = RULE_TERM[r.ruleId]
                  return (
                    <li key={r.ruleId}>
                      <div className="rule-head">
                        <strong>{term ? <Term id={term}>{text.title}</Term> : text.title}</strong>
                        <RiskTag level={r.riskLevel} />
                        <span className="caption muted">{t('ui.wallet.contribution', { n: r.scoreContribution })}</span>
                      </div>
                      <p className="t2">{text.detail}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {coverage && (
            <div className="wallet-block">
              <span className="caption muted">{t('ui.wallet.coverage')}</span>
              {coverage.status === 'COMPLETE' ? (
                <p className="t2">{t('ui.wallet.complete', { tx: coverage.transactionCount, n: coverage.transferCount })}</p>
              ) : (
                <>
                  <p className="t2">{t('ui.wallet.partial', { tx: coverage.transactionCount, n: coverage.transferCount })}</p>
                  <ul className="plain-list t2">
                    {coverage.reasons.map((r) => (
                      <li key={r}>{copy.coverage(r)}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
