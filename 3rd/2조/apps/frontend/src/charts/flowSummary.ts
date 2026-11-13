// The fund flow in words: how many recorded transfers, with how many other wallets, and how many are evidence.
import type { TFunction } from '../i18n/hooks'
import type { Flow } from './buildFlow'

export function flowStats(flow: Flow): { recorded: number; counterparties: number; evidence: number } {
  const recorded = flow.edges.filter((e) => e.kind === 'recorded')
  const others = flow.nodes.filter((n) => n.kind === 'counterparty' || n.kind === 'account')
  return { recorded: recorded.length, counterparties: others.length + flow.hiddenCount, evidence: recorded.filter((e) => e.evidence).length }
}

export function flowSummary(t: TFunction, flow: Flow): string {
  const { recorded, counterparties, evidence } = flowStats(flow)
  if (recorded === 0) return t('ui.flow.answerNone')
  // With no other wallet, every recorded transfer is between the sender and the recipient.
  const pairOnly = counterparties === 0
  return evidence > 0
    ? t(pairOnly ? 'ui.flow.answerPairEvidence' : 'ui.flow.answerEvidence', { n: counterparties, m: recorded, e: evidence })
    : t(pairOnly ? 'ui.flow.answerPair' : 'ui.flow.answer', { n: counterparties, m: recorded })
}
