// 실제 API 클라이언트로 Mock Backend를 호출한다. 클라이언트가 모든 응답을 계약 스키마로 검증하므로,
// 이 테스트가 통과하면 Mock 응답도 계약을 지킨다는 뜻이다.
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiFailure, createApiClient } from '../api/client'
import type { AnalysisRequest, ComplianceRequest } from '../api/types'
import { findScenario, protocolModels } from '../contracts/catalog'
import { createMockBackend, type MockStorage } from './backend'

const mock = createMockBackend({ queuedPolls: 1, runningPolls: 1 })
const server = setupServer(...mock.handlers)
const api = createApiClient({ baseUrl: 'http://localhost' })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => mock.reset())
afterAll(() => server.close())

function requestFor(fixtureId: string): AnalysisRequest {
  const scenario = findScenario(fixtureId)
  if (!scenario) throw new Error(`no scenario ${fixtureId}`)
  return scenario.request
}

async function analyzeUntilDone(fixtureId: string) {
  const accepted = await api.createAnalysis(requestFor(fixtureId))
  const id = accepted.data.analysisId
  const seen: string[] = []
  for (let i = 0; i < 5; i++) {
    const { data } = await api.getAnalysis(id)
    seen.push(data.status)
    if (!['QUEUED', 'RUNNING'].includes(data.status)) return { id, result: data, seen }
  }
  throw new Error('analysis did not finish')
}

function intentFor(senderAddr: string, recipientAddr: string) {
  return {
    intentId: `intent-${Math.random().toString(36).slice(2)}`,
    network: 'mainnet-beta' as const,
    sender: senderAddr,
    recipient: recipientAddr,
    asset: { type: 'SOL' as const, mint: null, decimals: 9 },
    amountRaw: '2500000000',
    requestedAt: '2026-11-09T12:00:00Z',
  }
}

async function expectFailure(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiFailure)
  expect((err as ApiFailure).status).toBe(status)
  expect((err as ApiFailure).code).toBe(code)
  return err as ApiFailure
}

describe('mock backend through the real client', () => {
  it('accepts an analysis with 202, Location and X-Request-ID', async () => {
    const r = await api.createAnalysis(requestFor('sanctioned'))
    expect(r.data.status).toBe('QUEUED')
    expect(r.location).toBe(`/api/v1/analyses/${r.data.analysisId}`)
    expect(r.requestId).toMatch(/^fe-/)
  })

  it('moves QUEUED → RUNNING → COMPLETED and keeps the fixture result', async () => {
    const { result, seen } = await analyzeUntilDone('sanctioned')
    expect(seen).toEqual(['QUEUED', 'RUNNING', 'COMPLETED'])
    expect(result.evaluation?.riskScore).toBe(100)
    expect(result.dataProvenance?.dataType).toBe('SYNTHETIC')
  })

  it('returns PARTIAL with a null score, not zero', async () => {
    const { result } = await analyzeUntilDone('partial')
    expect(result.status).toBe('PARTIAL')
    expect(result.evaluation?.riskScore).toBeNull()
    expect(result.coverage?.reasons).toContain('TRANSACTION_LIMIT_REACHED')
  })

  it('fails LIVE analyses because there is no collector', async () => {
    const live = { ...requestFor('normal'), mode: 'LIVE' as const }
    delete live.fixtureId
    const accepted = await api.createAnalysis(live)
    let last
    for (let i = 0; i < 4; i++) last = (await api.getAnalysis(accepted.data.analysisId)).data
    expect(last?.status).toBe('FAILED')
    expect(last?.error?.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(last?.evaluation).toBeNull()
    // the error box shows this message in the English UI
    expect(last?.error?.message).not.toMatch(/[\u3131-\uD79D]/)
  })

  it('fails the job when the address does not belong to the fixture', async () => {
    const wrong = { ...requestFor('sanctioned'), address: requestFor('sender').address }
    const accepted = await api.createAnalysis(wrong)
    let last
    for (let i = 0; i < 4; i++) last = (await api.getAnalysis(accepted.data.analysisId)).data
    expect(last?.status).toBe('FAILED')
  })

  it('answers 409 ANALYSIS_NOT_READY for transfers before the snapshot exists, then pages', async () => {
    const accepted = await api.createAnalysis(requestFor('warn'))
    const id = accepted.data.analysisId
    await expectFailure(api.getTransfers(id), 409, 'ANALYSIS_NOT_READY')
    for (let i = 0; i < 3; i++) await api.getAnalysis(id)
    const first = await api.getTransfers(id, { limit: 1 })
    expect(first.data.items).toHaveLength(1)
    expect(first.data.pagination.nextCursor).not.toBeNull()
    const second = await api.getTransfers(id, { limit: 1000, cursor: first.data.pagination.nextCursor })
    expect(second.data.pagination.nextCursor).toBeNull()
  })

  it('answers 404 for an unknown analysis', async () => {
    await expectFailure(api.getAnalysis('nope'), 404, 'NOT_FOUND')
  })

  it('runs the sanctioned demo: BLOCK, gateway rejects on the enforced path, allows on the other', async () => {
    const sender = await analyzeUntilDone('sender')
    const recipient = await analyzeUntilDone('sanctioned')
    const body: ComplianceRequest = {
      intent: intentFor(sender.result.address, recipient.result.address),
      senderAnalysisId: sender.id,
      recipientAnalysisId: recipient.id,
      policyVersion: '1.0.0',
    }
    const review = await api.evaluateCompliance(body)
    expect(review.data.decision.action).toBe('BLOCK')
    expect(review.data.intent.amountRaw).toBe('2500000000')

    const ids = { intentId: body.intent.intentId, decisionId: review.data.decision.decisionId }
    const enforced = await api.runGateway({ ...ids, route: { routeId: 'enforced', policyEnforced: true, warningAcknowledged: false } })
    const bypass = await api.runGateway({ ...ids, route: { routeId: 'alternative', policyEnforced: false, warningAcknowledged: false } })
    expect(enforced.data.outcome).toBe('SUBMISSION_REJECTED')
    expect(bypass.data.outcome).toBe('SUBMISSION_ALLOWED')
    expect(bypass.data.reasonCodes).toEqual(['POLICY_NOT_ENFORCED'])
    expect(enforced.data.actualBroadcast).toBe(false)

    const scenario = {
      proposerCount: 4,
      rejectingProposerCount: 1,
      submittedToAcceptingProposer: true,
      psliceAvailable: true,
      attestationPercent: 100,
      leaderAttemptsExclusion: true,
    }
    const sim = await api.runConstellation({ ...ids, protocolModelVersion: protocolModels.mockVersion, scenario })
    expect(sim.data.simulationOnly).toBe(true)
    expect(sim.data.explanationCodes).toContain('MOCK_RESULT_NOT_PROTOCOL_VALIDATED')
    await expectFailure(
      api.runConstellation({ ...ids, protocolModelVersion: '0.1.0-draft', scenario }),
      422,
      'UNSUPPORTED_VERSION',
    )
  })

  it('needs the warning acknowledged for WARN decisions on the enforced path', async () => {
    const sender = await analyzeUntilDone('sender')
    const recipient = await analyzeUntilDone('warn')
    const intent = intentFor(sender.result.address, recipient.result.address)
    const review = await api.evaluateCompliance({
      intent,
      senderAnalysisId: sender.id,
      recipientAnalysisId: recipient.id,
      policyVersion: '1.0.0',
    })
    expect(review.data.decision.action).toBe('WARN')
    const ids = { intentId: intent.intentId, decisionId: review.data.decision.decisionId }
    const notAck = await api.runGateway({ ...ids, route: { routeId: 'a', policyEnforced: true, warningAcknowledged: false } })
    const ack = await api.runGateway({ ...ids, route: { routeId: 'b', policyEnforced: true, warningAcknowledged: true } })
    expect(notAck.data.outcome).toBe('REVIEW_REQUIRED')
    expect(ack.data.outcome).toBe('SUBMISSION_ALLOWED')
  })

  it('rejects policy review while an analysis is still running, and on address mismatch', async () => {
    const sender = await analyzeUntilDone('sender')
    const pending = await api.createAnalysis(requestFor('normal'))
    await expectFailure(
      api.evaluateCompliance({
        intent: intentFor(sender.result.address, requestFor('normal').address),
        senderAnalysisId: sender.id,
        recipientAnalysisId: pending.data.analysisId,
        policyVersion: '1.0.0',
      }),
      409,
      'ANALYSIS_NOT_READY',
    )
    const recipient = await analyzeUntilDone('normal')
    await expectFailure(
      api.evaluateCompliance({
        intent: intentFor(recipient.result.address, sender.result.address),
        senderAnalysisId: sender.id,
        recipientAnalysisId: recipient.id,
        policyVersion: '1.0.0',
      }),
      409,
      'ASSESSMENT_MISMATCH',
    )
  })

  it('says plainly when the mock has no fixture for a pair', async () => {
    const a = await analyzeUntilDone('sanctioned')
    const b = await analyzeUntilDone('sender')
    const err = await expectFailure(
      api.evaluateCompliance({
        intent: intentFor(a.result.address, b.result.address),
        senderAnalysisId: a.id,
        recipientAnalysisId: b.id,
        policyVersion: '1.0.0',
      }),
      409,
      'CONFLICT',
    )
    expect(err.message).toContain('[Mock]')
  })

  it('refuses to send a request that breaks the contract', async () => {
    const bad = { ...requestFor('normal'), mode: 'FIXTURE' as const, fixtureId: undefined }
    const err = await api.createAnalysis(bad).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiFailure)
    expect((err as ApiFailure).kind).toBe('request')
  })

  it('keeps analyses across a reload when given storage', async () => {
    let saved: string | null = null
    const storage: MockStorage = { load: () => saved, save: (json) => void (saved = json) }
    const a = createMockBackend({ queuedPolls: 1, runningPolls: 1, storage })
    server.resetHandlers(...a.handlers)
    try {
      const accepted = await api.createAnalysis(requestFor('sanctioned'))
      const id = accepted.data.analysisId
      for (let i = 0; i < 3; i++) await api.getAnalysis(id)
      const b = createMockBackend({ queuedPolls: 1, runningPolls: 1, storage })
      server.resetHandlers(...b.handlers)
      const again = await api.getAnalysis(id)
      expect(again.data.status).toBe('COMPLETED')
      expect(again.data.evaluation?.riskScore).toBe(100)
    } finally {
      server.resetHandlers(...mock.handlers)
    }
  })
})
