// Everything needed to trace the decision: versions, data source, IDs and the raw codes (design doc §6.4, item 4).
import type { ReactNode } from 'react'
import type { CaseRecord, CaseRun } from '../../cases/model'
import { useT } from '../../i18n/hooks'
import { formatUtc } from '../../lib/format'

export function AuditInfo({ record, run }: { record: CaseRecord; run: CaseRun }) {
  const t = useT()
  const d = run.compliance?.decision
  const evaluation = run.compliance?.assessments.recipient ?? run.recipient?.result.evaluation ?? null
  const prov = run.recipient?.result.dataProvenance ?? run.sender?.result.dataProvenance ?? null
  const label = evaluation?.evidences[0]?.source.labelDataset ?? null
  const rows: [string, ReactNode][] = [
    [t('ui.case.audit.policyVersion'), d?.policyVersion ?? '—'],
    [t('ui.case.audit.rulesetVersion'), evaluation?.rulesetVersion ?? '—'],
    [t('ui.case.audit.data'), prov ? `${prov.dataType} · ${prov.source}${prov.reference ? ` · ${prov.reference}` : ''}` : '—'],
    [t('ui.case.audit.labels'), label ? `${label.source} · ${label.version} · ${formatUtc(label.fetchedAt)}` : '—'],
    [t('ui.case.audit.evaluatedAt'), formatUtc(d?.evaluatedAt)],
    [t('ui.case.audit.reasonCodes'), d?.reasonCodes.join(', ') ?? '—'],
    [t('ui.case.audit.decisionId'), d?.decisionId ?? '—'],
    [t('ui.case.audit.intentId'), run.compliance?.intent.intentId ?? '—'],
    [t('ui.case.audit.analyses'), [run.sender?.analysisId, run.recipient?.analysisId].filter(Boolean).join(', ') || '—'],
    [t('ui.case.audit.requests'), [run.sender?.result.requestId, run.recipient?.result.requestId, run.compliance?.requestId].filter(Boolean).join(', ') || '—'],
    [t('ui.case.audit.apiMode'), run.apiMode],
    [t('ui.case.audit.runAt'), formatUtc(run.startedAt)],
    [t('ui.case.audit.createdBy'), record.createdBy],
  ]
  return (
    <section data-testid="audit">
      <dl className="kv audit">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="mono-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
