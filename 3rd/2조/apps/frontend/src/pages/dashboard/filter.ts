import type { Action } from '../../api/types'
import { latestRun, type CaseRecord, type RunStep } from '../../cases/model'

export type CaseFilter = 'all' | Action | 'failed' | 'running'

export type CaseStatus = { kind: 'done'; action: Action } | { kind: 'failed'; step: RunStep | null } | { kind: 'running' } | { kind: 'empty' }

export function caseStatus(c: CaseRecord): CaseStatus {
  const run = latestRun(c)
  if (!run) return { kind: 'empty' }
  if (run.status === 'DONE' && run.compliance) return { kind: 'done', action: run.compliance.decision.action }
  if (run.status === 'FAILED') return { kind: 'failed', step: run.failedStep }
  return { kind: 'running' }
}

function matches(c: CaseRecord, q: string): boolean {
  if (q === '') return true
  const run = latestRun(c)
  const haystack = [
    c.id,
    c.input.sender.address,
    c.input.recipient.address,
    ...(run?.sender?.transfers ?? []).map((t) => t.signature),
    ...(run?.recipient?.transfers ?? []).map((t) => t.signature),
  ]
  return haystack.some((h) => h.toLowerCase().includes(q))
}

export function filterCases(cases: CaseRecord[], filter: CaseFilter, query: string): CaseRecord[] {
  const q = query.trim().toLowerCase()
  return cases.filter((c) => {
    const s = caseStatus(c)
    const byFilter =
      filter === 'all' ||
      (filter === 'failed' && s.kind === 'failed') ||
      (filter === 'running' && s.kind === 'running') ||
      (s.kind === 'done' && s.action === filter)
    return byFilter && matches(c, q)
  })
}
