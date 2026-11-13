import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from '../api/client'
import type { CaseInput } from '../cases/model'
import { findScenario } from '../contracts/catalog'
import { createMockBackend } from '../mocks/backend'
import { runCase, type RunProgress } from './runCase'
import { fixtureInput } from './testInputs'

const mock = createMockBackend({ queuedPolls: 1, runningPolls: 1 })
const server = setupServer(...mock.handlers)
const api = createApiClient({ baseUrl: 'http://localhost' })
const opts = { pollIntervalMs: 0, apiMode: 'mock' as const }

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  mock.reset()
})
afterAll(() => server.close())

describe('runCase', () => {
  it('runs sender → sanctioned to a Block and reports progress in order', async () => {
    const seen: RunProgress[] = []
    const run = await runCase(api, fixtureInput('sender', 'sanctioned'), (p) => seen.push({ ...p }), opts)
    expect(run.status).toBe('DONE')
    expect(run.compliance?.decision.action).toBe('BLOCK')
    expect(run.recipient?.transfers).toHaveLength(1)
    expect(run.finishedAt).not.toBeNull()
    const policyRunning = seen.findIndex((p) => p.policy === 'running')
    const allDone = seen.findIndex((p) => p.sender === 'done' && p.recipient === 'done' && p.policy === 'done')
    expect(policyRunning).toBeGreaterThan(-1)
    expect(allDone).toBeGreaterThan(policyRunning)
  })

  it('uses one analysis when sender and recipient are the same', async () => {
    let posts = 0
    const onStart = ({ request }: { request: Request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/v1/analyses') posts += 1
    }
    server.events.on('request:start', onStart)
    try {
      const run = await runCase(api, fixtureInput('sender', 'sender'), () => {}, opts)
      expect(posts).toBe(1)
      expect(run.sender?.analysisId).toBe(run.recipient?.analysisId)
    } finally {
      server.events.removeListener('request:start', onStart)
    }
  })

  it('stops at the sender step when a LIVE analysis fails', async () => {
    const input: CaseInput = {
      ...fixtureInput('sender', 'normal'),
      mode: 'LIVE',
      sender: { address: findScenario('sender')!.request.address, fixtureId: null },
      recipient: { address: findScenario('normal')!.request.address, fixtureId: null },
      scope: { fromTime: '2026-11-01T00:00:00Z', toTime: '2026-11-02T00:00:00Z', maxTransactions: 100 },
    }
    const run = await runCase(api, input, () => {}, opts)
    expect(run.status).toBe('FAILED')
    expect(run.failedStep).toBe('sender')
    expect(run.error?.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(run.compliance).toBeNull()
  })

  it('times out an analysis that never finishes', async () => {
    const slow = createMockBackend({ queuedPolls: 10_000, runningPolls: 1 })
    server.resetHandlers(...slow.handlers)
    try {
      const run = await runCase(api, fixtureInput('sender', 'normal'), () => {}, { ...opts, timeoutMs: 50 })
      expect(run.status).toBe('FAILED')
      expect(run.error?.code).toBe('TIMEOUT')
      expect(run.error?.retryable).toBe(true)
    } finally {
      server.resetHandlers(...mock.handlers)
    }
  })

  it('replays a demo scenario: held for review under policy 1.0.0, blocked under 1.1.0, with its transfers', async () => {
    const review = await runCase(api, fixtureInput('sender', 'demo-layering'), () => {}, opts)
    expect(review.compliance?.decision.action).toBe('REVIEW')
    expect(review.recipient?.transfers).toHaveLength(20)
    const block = await runCase(api, fixtureInput('sender', 'demo-layering', '1.1.0'), () => {}, opts)
    expect(block.compliance?.decision.action).toBe('BLOCK')
    expect(block.compliance?.decision.reasonCodes).toEqual(['SANCTION_DIRECT_FLOW_BLOCK'])
  })

  it('leaves no step running after the Backend refuses both analyses', async () => {
    server.use(http.post('*/api/v1/analyses', () => new HttpResponse('Invalid CORS request', { status: 403 })))
    const seen: RunProgress[] = []
    const run = await runCase(api, fixtureInput('sender', 'sanctioned'), (p) => seen.push({ ...p }), opts)
    expect(run.failedStep).toBe('sender')
    expect(run.error?.code).toBe('UNSTRUCTURED_ERROR')
    expect(Object.values(seen.at(-1)!)).not.toContain('running')
  })

  it('fails at the policy step when the network drops', async () => {
    server.use(http.post('*/api/v1/compliance/evaluate', () => HttpResponse.error()))
    const run = await runCase(api, fixtureInput('sender', 'sanctioned'), () => {}, opts)
    expect(run.status).toBe('FAILED')
    expect(run.failedStep).toBe('policy')
    expect(run.error?.kind).toBe('network')
  })
})
