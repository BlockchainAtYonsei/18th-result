import { Link, useNavigate } from 'react-router'
import type { KYTAnalysisResult } from '../../api/types'
import { AddressChip } from '../../components/AddressChip'
import { DecisionTag, StatusIcon } from '../../components/StatusTag'
import { latestRun, type CaseRecord } from '../../cases/model'
import { useCopy, useT, type TFunction } from '../../i18n/hooks'
import { formatAmount, relativeTime } from '../../lib/format'
import { caseStatus } from './filter'

function when(t: TFunction, iso: string) {
  const r = relativeTime(iso)
  return r.unit === 'now' ? t('ui.time.now') : t(`ui.time.${r.unit}`, { n: r.n })
}

function MiniRisk({ label, result }: { label: string; result: KYTAnalysisResult | undefined }) {
  const t = useT()
  const ev = result?.evaluation
  const score = ev?.riskScore ?? null
  const fill = ev?.riskLevel === 'HIGH' ? 'var(--block)' : ev?.riskLevel === 'MEDIUM' ? 'var(--warn)' : 'var(--allow)'
  return (
    <span className="mini-risk" title={`${label}: ${score === null ? t('ui.risk.notScored') : score}`}>
      <span className="caption muted">{label.slice(0, 1)}</span>
      <span className="mini-track">{score === null ? <i className="hatched" /> : <i style={{ width: `${Math.max(score, 3)}%`, background: fill }} />}</span>
      <span className="mono">{score === null ? '—' : score}</span>
    </span>
  )
}

export function CaseRow({ c }: { c: CaseRecord }) {
  const t = useT()
  const copy = useCopy()
  const navigate = useNavigate()
  const run = latestRun(c)
  const status = caseStatus(c)
  const provenance = run?.recipient?.result.dataProvenance ?? run?.sender?.result.dataProvenance ?? null
  const reasons = run?.compliance?.decision.reasonCodes.map((code) => copy.reason(code).title) ?? []

  return (
    <tr className="case-row" onClick={() => navigate(`/cases/${c.id}`)}>
      <td>
        <Link to={`/cases/${c.id}`} className="mono case-id" onClick={(e) => e.stopPropagation()}>
          {c.id}
        </Link>
      </td>
      <td>
        <span className="pair">
          <AddressChip address={c.input.sender.address} provenance={provenance} links={false} />
          <span className="muted">→</span>
          <AddressChip address={c.input.recipient.address} provenance={provenance} links={false} />
        </span>
        <span className="caption t2">{formatAmount(c.input.amountRaw, c.input.asset)}</span>
      </td>
      <td>
        {status.kind === 'done' && <DecisionTag action={status.action} />}
        {status.kind === 'failed' && (
          <span className="tag">
            <StatusIcon tone="NONE" />
            {t('ui.dashboard.failedAt', { step: status.step ? t(`ui.step.${status.step}`) : '—' })}
          </span>
        )}
        {status.kind === 'running' && <span className="caption t2">{t('ui.dashboard.running')}</span>}
      </td>
      <td className="why">{reasons.join(' · ')}</td>
      <td>
        <span className="risk-pair">
          <MiniRisk label={t('ui.dashboard.sender')} result={run?.sender?.result} />
          <MiniRisk label={t('ui.dashboard.recipient')} result={run?.recipient?.result} />
        </span>
      </td>
      <td className="t2 nowrap">
        {provenance ? t(`ui.data.${provenance.dataType}`) : t('ui.data.unknown')}
        {run?.apiMode === 'mock' && <span className="caption muted"> · {t('ui.data.mockApi')}</span>}
      </td>
      <td className="t2 nowrap">{when(t, run?.startedAt ?? c.createdAt)}</td>
    </tr>
  )
}
