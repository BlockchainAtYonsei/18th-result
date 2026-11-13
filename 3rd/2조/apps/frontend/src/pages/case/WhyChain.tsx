// Reason → evidence → transactions: what the policy relied on (design doc §6.4, item 2).
import type { NormalizedTransfer } from '../../api/types'
import { AddressChip, TxChip } from '../../components/AddressChip'
import { Term } from '../../components/Term'
import { flowStats } from '../../charts/flowSummary'
import { FundFlowGraph } from '../../charts/FundFlowGraph'
import type { CaseInput, CaseRun } from '../../cases/model'
import { useCopy, useT } from '../../i18n/hooks'
import { formatAmount, formatUtc } from '../../lib/format'
import { caseFlow, evaluationFor, evidenceSummary, findEvidence, listedAddresses, positionText, transfersForEvidence } from './runData'

export function TransferRows({ transfers, provenance }: { transfers: NormalizedTransfer[]; provenance: Parameters<typeof TxChip>[0]['provenance'] }) {
  const t = useT()
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{t('ui.case.why.colTime')}</th>
            <th>{t('ui.case.why.colFlow')}</th>
            <th>{t('ui.case.why.colAmount')}</th>
            <th>
              <Term id="instruction">{t('ui.case.why.colPosition')}</Term>
            </th>
            <th>
              <Term id="signature">{t('ui.case.why.colTx')}</Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((tr) => (
            <tr key={`${tr.signature}-${tr.instructionIndex}-${tr.innerInstructionIndex}-${tr.transferOrdinal}`}>
              <td className="nowrap">{tr.timestamp ? formatUtc(tr.timestamp) : <span className="muted">{t('ui.case.why.noTimestamp')}</span>}</td>
              <td>
                <span className="pair">
                  {tr.fromAddress ? <AddressChip address={tr.fromAddress} provenance={provenance} links={false} /> : <span className="muted">{t('ui.case.why.ownerUnknown')}</span>}
                  <span className="muted">→</span>
                  {tr.toAddress ? <AddressChip address={tr.toAddress} provenance={provenance} links={false} /> : <span className="muted">{t('ui.case.why.ownerUnknown')}</span>}
                </span>
              </td>
              <td className="nowrap">{formatAmount(tr.amountRaw, tr.asset)}</td>
              <td className="nowrap t2">{positionText(t, tr)}</td>
              <td>
                <TxChip signature={tr.signature} provenance={provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WhyChain({ input, run }: { input: CaseInput; run: CaseRun }) {
  const t = useT()
  const copy = useCopy()
  const ids = run.compliance?.decision.referencedEvidenceIds ?? []
  const weight = (id: string) => {
    const found = findEvidence(run, id)
    return found ? Math.max(0, ...found.evaluation.detectedRules.filter((r) => r.evidenceIds.includes(id)).map((r) => r.scoreContribution)) : -1
  }
  // heaviest finding first, by the contribution the analysis reported
  const ordered = [...ids].sort((a, b) => weight(b) - weight(a))
  const flow = caseFlow(input, run)
  const provenance = run.recipient?.result.dataProvenance ?? run.sender?.result.dataProvenance ?? null

  return (
    <section className="section" data-testid="why" aria-labelledby="why-title">
      <h2 id="why-title">{t('ui.case.why.title')}</h2>
      {ids.length === 0 && <p className="t2">{t('ui.case.why.noEvidence')}</p>}
      <div className="evidence-list">
        {ordered.map((id) => {
          const found = findEvidence(run, id)
          if (!found) {
            return (
              <p key={id} className="t2">
                {t('ui.case.why.missing', { id })}
              </p>
            )
          }
          const { side, evidence, evaluation } = found
          const evProvenance = evidence.source.dataProvenance
          const transfers = transfersForEvidence(run, evidence)
          const rules = evaluation.detectedRules.filter((r) => r.evidenceIds.includes(id))
          const summary = evidenceSummary(t, evaluation.subjectAddress, evidence, transfers, rules.map((r) => r.ruleId))
          return (
            <article key={id} className="evidence">
              <header className="evidence-head">
                <span className="caption t2">
                  {[t(side === 'sender' ? 'ui.case.why.sender' : 'ui.case.why.recipient'), ...rules.map((r) => t('ui.case.why.citedBy', { rule: copy.rule(r.ruleId).title, n: r.scoreContribution }))].join(' · ')}
                </span>
                <h3>{summary ?? copy.evidence(evidence.type)}</h3>
              </header>
              {(evidence.transferIds.length === 0 || evidence.labelReferenceIds.length > 0) && (
                <dl className="kv">
                  {evidence.transferIds.length === 0 && (
                    <div>
                      <dt>{t('ui.case.why.related')}</dt>
                      <dd className="wrap">
                        {evidence.relatedAddresses.map((a) => (
                          <AddressChip key={a} address={a} provenance={evProvenance} />
                        ))}
                      </dd>
                    </div>
                  )}
                  {evidence.labelReferenceIds.length > 0 && (
                    <div>
                      <dt>
                        <Term id="sanctionsList">{t('ui.case.why.labels')}</Term>
                      </dt>
                      <dd className="wrap">
                        {evidence.labelReferenceIds.map((r) => (
                          <span key={r} className="mono">
                            {r}
                          </span>
                        ))}
                        <span className="caption muted">{`${copy.labelSource(evidence.source.labelDataset.source)} · ${evidence.source.labelDataset.version}`}</span>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {evidence.transferIds.length === 0 ? (
                <p className="caption t2">{t('ui.case.why.noTransfers')}</p>
              ) : transfers ? (
                <details className="rows-fold">
                  <summary>{t('ui.case.why.showTransfers', { n: transfers.length })}</summary>
                  <TransferRows transfers={transfers} provenance={evProvenance} />
                </details>
              ) : (
                <p className="caption t2">{t('ui.case.why.listNotLoaded')}</p>
              )}
            </article>
          )
        })}
      </div>
      {/* The picture of what the wallets did. It earns its place only when other wallets are involved. */}
      {flow && flowStats(flow).counterparties >= 2 && (
        <FundFlowGraph
          flow={flow}
          levels={{ sender: evaluationFor(run, 'sender')?.riskLevel ?? null, recipient: evaluationFor(run, 'recipient')?.riskLevel ?? null }}
          listed={listedAddresses(run)}
          provenance={provenance}
        />
      )}
    </section>
  )
}
