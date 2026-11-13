import { describe, expect, it } from 'vitest'
import { fixtureCase } from '../../cases/testCases'
import { en } from '../../i18n/en'
import { fill } from '../../i18n/copy'
import { lookup, type TFunction } from '../../i18n/hooks'
import { evidenceSummary, findEvidence, listedAddresses, transfersForEvidence } from './runData'

const t: TFunction = (key, params) => fill(lookup(en, key) ?? key, params ?? {})

function directFlow() {
  const run = fixtureCase('CL-0001', 'direct-flow').runs[0]
  const id = run.compliance!.decision.referencedEvidenceIds[0]
  return { run, ...findEvidence(run, id)! }
}

describe('reading the evidence', () => {
  it('names the counterparty of each direct-exposure transfer', () => {
    const { run, evidence, evaluation } = directFlow()
    const tr = transfersForEvidence(run, evidence)![0]
    const other = tr.fromAddress === evaluation.subjectAddress ? tr.toAddress : tr.fromAddress
    expect([...listedAddresses(run)]).toEqual([other])
  })

  it('falls back to the token account when the counterparty owner is unknown', () => {
    const { run, evidence, evaluation } = directFlow()
    const list = run.recipient!.transfers!
    const tr = list.find((x) => evidence.transferIds.includes(x.id))!
    const fromMe = tr.fromAddress === evaluation.subjectAddress
    const account = fromMe ? tr.destinationAccount : tr.sourceAccount
    if (fromMe) tr.toAddress = null
    else tr.fromAddress = null
    expect([...listedAddresses(run)]).toEqual([account])
    expect(evidenceSummary(t, evaluation.subjectAddress, evidence, transfersForEvidence(run, evidence), ['SANCTION_DIRECT_FLOW'])).toMatch(/^1 transfer with 1 counterparty on the sanctions list/)
  })

  it('describes repeat payments to one wallet', () => {
    const run = fixtureCase('CL-0001', 'demo-burst').runs[0]
    const evaluation = run.compliance!.assessments.recipient
    const rule = evaluation.detectedRules.find((r) => r.ruleId === 'RAPID_REPEAT')!
    const { evidence } = findEvidence(run, rule.evidenceIds[0])!
    expect(evidenceSummary(t, evaluation.subjectAddress, evidence, transfersForEvidence(run, evidence), ['RAPID_REPEAT'])).toBe(
      '5 transfers to the same wallet between 10:00:00 and 10:00:48 UTC.',
    )
  })
})
