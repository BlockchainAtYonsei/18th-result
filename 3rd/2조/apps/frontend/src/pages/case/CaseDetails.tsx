// What a reader checks after the verdict, kept closed until asked for: each wallet's analysis, the transfers, the audit trail.
import type { ReactNode } from 'react'
import { ActivityTimeline } from '../../charts/ActivityTimeline'
import { evidenceTransferIds } from '../../charts/buildFlow'
import { flowStats, flowSummary } from '../../charts/flowSummary'
import type { CaseInput, CaseRecord, CaseRun } from '../../cases/model'
import { useT } from '../../i18n/hooks'
import { AuditInfo } from './AuditInfo'
import { caseFlow, evaluationFor } from './runData'
import { WalletPanel } from './WalletPanel'

function Fold({ title, hint, testId, children }: { title: string; hint?: string; testId?: string; children: ReactNode }) {
  return (
    <details className="fold" data-testid={testId}>
      <summary>
        <span className="fold-title">{title}</span>
        {hint && <span className="fold-hint">{hint}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}

export function CaseDetails({ record, input, run }: { record: CaseRecord; input: CaseInput; run: CaseRun }) {
  const t = useT()
  const provenance = run.recipient?.result.dataProvenance ?? run.sender?.result.dataProvenance ?? null
  const ev = evidenceTransferIds(run)
  const sEval = evaluationFor(run, 'sender')
  const rEval = evaluationFor(run, 'recipient')
  const analysed = Boolean(run.sender || run.recipient)
  const haveTransfers = run.sender?.transfers && run.recipient?.transfers
  const flow = caseFlow(input, run)
  const stats = flow ? flowStats(flow) : null
  const score = (v: number | null | undefined) => (v === null || v === undefined ? t('ui.risk.notScored') : String(v))

  return (
    <div className="folds">
      {analysed && (
        <Fold title={t('ui.case.fold.wallets')} hint={t('ui.case.fold.walletsHint', { s: score(sEval?.riskScore), r: score(rEval?.riskScore) })}>
          <div className="wallet-grid">
            <WalletPanel side="sender" address={input.sender.address} result={run.sender?.result ?? null} evaluation={sEval} />
            <WalletPanel side="recipient" address={input.recipient.address} result={run.recipient?.result ?? null} evaluation={rEval} />
          </div>
        </Fold>
      )}
      {analysed && (
        <Fold title={t('ui.case.fold.transfers')} hint={stats ? t('ui.case.fold.transfersHint', { n: stats.recorded }) : undefined} testId="transfers">
          {!flow || !haveTransfers ? (
            <p className="t2">{t('ui.case.why.listNotLoaded')}</p>
          ) : (
            <>
              {/* the graph, when there is one, sits in Evidence; here the same data in words and on a time axis */}
              <p className="t2">{flowSummary(t, flow)}</p>
              <ActivityTimeline
                provenance={provenance}
                lanes={[
                  { label: t('ui.flow.sender'), address: input.sender.address, transfers: run.sender!.transfers!, evidenceIds: ev.sender },
                  { label: t('ui.flow.recipient'), address: input.recipient.address, transfers: run.recipient!.transfers!, evidenceIds: ev.recipient },
                ]}
              />
            </>
          )}
        </Fold>
      )}
      <Fold title={t('ui.case.fold.audit')} hint={t('ui.case.fold.auditHint')}>
        <AuditInfo record={record} run={run} />
      </Fold>
    </div>
  )
}
