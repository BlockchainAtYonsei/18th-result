// Read helpers over a stored run: which wallet an evidence item belongs to and the transfers it cites.
import type { Evidence, KYTEvaluation, NormalizedTransfer } from '../../api/types'
import { buildFlow, evidenceTransferIds, type Flow } from '../../charts/buildFlow'
import type { CaseInput, CaseRun } from '../../cases/model'
import type { TFunction } from '../../i18n/hooks'
import { formatUtc } from '../../lib/format'

export type Side = 'sender' | 'recipient'

export function evaluationFor(run: CaseRun, side: Side): KYTEvaluation | null {
  return run.compliance?.assessments[side] ?? run[side]?.result.evaluation ?? null
}

/** Finds an evidence item in either assessment and says which wallet it came from. */
export function findEvidence(run: CaseRun, evidenceId: string): { side: Side; evidence: Evidence; evaluation: KYTEvaluation } | null {
  for (const side of ['sender', 'recipient'] as const) {
    const evaluation = evaluationFor(run, side)
    const evidence = evaluation?.evidences.find((e) => e.evidenceId === evidenceId)
    if (evaluation && evidence) return { side, evidence, evaluation }
  }
  return null
}

/** Transfer ids are per snapshot, so look them up in the snapshot the evidence names. */
export function transfersForEvidence(run: CaseRun, evidence: Evidence): NormalizedTransfer[] | null {
  const side = (['sender', 'recipient'] as const).find((s) => run[s]?.result.snapshotId === evidence.source.snapshotId)
  const list = side ? run[side]?.transfers : null
  if (!list) return null
  return evidence.transferIds.map((id) => list.find((t) => t.id === id)).filter((t): t is NormalizedTransfer => Boolean(t))
}

export function ruleIdsCiting(evaluation: KYTEvaluation, evidenceId: string): string[] {
  return evaluation.detectedRules.filter((r) => r.evidenceIds.includes(evidenceId)).map((r) => r.ruleId)
}

export function positionText(t: TFunction, tr: NormalizedTransfer): string {
  return tr.innerInstructionIndex === null
    ? t('ui.case.why.instruction', { n: tr.instructionIndex })
    : t('ui.case.why.inner', { n: tr.instructionIndex, m: tr.innerInstructionIndex })
}

/** The 1-hop transfer graph of both wallets, or null when a transfer list was not loaded. */
export function caseFlow(input: CaseInput, run: CaseRun): Flow | null {
  if (!run.sender?.transfers || !run.recipient?.transfers) return null
  return buildFlow({
    sender: input.sender.address,
    recipient: input.recipient.address,
    requested: { amountRaw: input.amountRaw, asset: input.asset },
    senderTransfers: run.sender.transfers,
    recipientTransfers: run.recipient.transfers,
    evidenceTransferIds: evidenceTransferIds(run),
  })
}

/** The other party of a transfer, as the graph draws it: the owner wallet, or the token account when the owner is unknown. */
function counterparty(tr: NormalizedTransfer, subject: string): string {
  return tr.fromAddress === subject ? (tr.toAddress ?? tr.destinationAccount) : (tr.fromAddress ?? tr.sourceAccount)
}

/**
 * Counterparties in the direct-exposure evidence. The Public API does not return which address carries the label.
 * By the rule's definition every transfer a DIRECT_FLOW evidence cites is between the analysed wallet and a party
 * whose wallet or token account is listed, so the mark belongs to that counterparty, not to one exact address.
 */
export function listedAddresses(run: CaseRun): Set<string> {
  const out = new Set<string>()
  for (const side of ['sender', 'recipient'] as const) {
    const evaluation = evaluationFor(run, side)
    for (const evidence of evaluation?.evidences ?? []) {
      if (evidence.type !== 'DIRECT_FLOW') continue
      for (const tr of transfersForEvidence(run, evidence) ?? []) out.add(counterparty(tr, evaluation!.subjectAddress))
    }
  }
  return out
}

/** What the wallet did, counted from the transfers an evidence item cites. Null when there is nothing to count. */
export function evidenceSummary(t: TFunction, subject: string, evidence: Evidence, transfers: NormalizedTransfer[] | null, ruleIds: string[]): string | null {
  if (!transfers || transfers.length === 0) return null
  const n = transfers.length
  if (evidence.type === 'DIRECT_FLOW') {
    const others = new Set(transfers.map((tr) => counterparty(tr, subject)))
    return t('ui.case.why.didDirect', {
      n,
      k: others.size,
      in: transfers.filter((tr) => tr.toAddress === subject).length,
      out: transfers.filter((tr) => tr.fromAddress === subject).length,
    })
  }
  if (evidence.type === 'TEMPORAL_PATTERN') {
    const times = transfers.map((tr) => tr.timestamp).filter((x): x is string => x !== null).sort()
    if (times.length === 0) return null
    const first = times[0]
    const last = times[times.length - 1]
    const clock = (iso: string) => (first.slice(0, 10) === last.slice(0, 10) ? iso.slice(11, 19) : formatUtc(iso).replace(' UTC', ''))
    const recipients = new Set(transfers.map((tr) => tr.toAddress)).size
    const key = ruleIds.includes('RAPID_REPEAT') && recipients === 1 ? 'ui.case.why.didRepeat' : 'ui.case.why.didSpread'
    return t(key, { n, k: recipients, from: clock(first), to: clock(last) })
  }
  return null
}
