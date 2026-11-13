import { describe, expect, it } from 'vitest'
import { fixtureCase } from '../cases/testCases'
import { evidenceTransferIds } from './buildFlow'
import { buildFlow } from './buildFlow'

function flowFor(recipient: string) {
  const c = fixtureCase('CL-0001', recipient)
  const run = c.runs[0]
  return buildFlow({
    sender: c.input.sender.address,
    recipient: c.input.recipient.address,
    requested: { amountRaw: c.input.amountRaw, asset: c.input.asset },
    senderTransfers: run.sender!.transfers!,
    recipientTransfers: run.recipient!.transfers!,
    evidenceTransferIds: evidenceTransferIds(run),
  })
}

describe('buildFlow', () => {
  it('draws the fan-out as evidence edges from the recipient', () => {
    const flow = flowFor('warn')
    const evidence = flow.edges.filter((e) => e.evidence)
    expect(evidence).toHaveLength(3)
    expect(new Set(evidence.map((e) => e.to)).size).toBe(3)
    expect(flow.edges.filter((e) => e.kind === 'recorded' && e.to === flow.nodes.find((n) => n.kind === 'recipient')!.id)).toHaveLength(1)
    expect(flow.edges.filter((e) => e.kind === 'requested')).toHaveLength(1)
    expect(flow.nodes.filter((n) => n.kind === 'counterparty')).toHaveLength(3)
  })

  it('shows a transfer found in both snapshots once', () => {
    const flow = flowFor('sanctioned')
    expect(flow.edges.filter((e) => e.kind === 'recorded')).toHaveLength(1)
  })

  it('keeps an unknown owner as a token account node', () => {
    const flow = flowFor('unresolved')
    const account = flow.nodes.find((n) => n.kind === 'account')
    expect(account?.ownerUnknown).toBe(true)
  })
})
