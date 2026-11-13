import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from '../api/client'
import { defaultConstellationScenario } from '../contracts/catalog'
import { createMockBackend } from '../mocks/backend'
import { runCase } from './runCase'
import { isStale, latestCompare, latestGatewaySets, runAttestationSweep, runConstellationCompare, runGatewaySet } from './simulate'
import { fixtureInput } from './testInputs'

const mock = createMockBackend({ queuedPolls: 1, runningPolls: 1 })
const server = setupServer(...mock.handlers)
const api = createApiClient({ baseUrl: 'http://localhost' })
const opts = { pollIntervalMs: 0, apiMode: 'mock' as const }

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers(...mock.handlers)
  mock.reset()
})
afterAll(() => server.close())

const doneRun = async (recipient: string) => {
  const run = await runCase(api, fixtureInput('sender', recipient), () => {}, opts)
  expect(run.status).toBe('DONE')
  return run
}

describe('simulation flows', () => {
  it('runs the enforced and the unenforced route for a Block', async () => {
    const records = await runGatewaySet(api, await doneRun('sanctioned'))
    expect(records.map((r) => r.route.routeId)).toEqual(['enforced', 'not-enforced'])
    expect(records.map((r) => r.result?.outcome)).toEqual(['SUBMISSION_REJECTED', 'SUBMISSION_ALLOWED'])
  })

  it('adds the acknowledged route for a Warn', async () => {
    const records = await runGatewaySet(api, await doneRun('warn'))
    expect(records.map((r) => r.result?.outcome)).toEqual(['REVIEW_REQUIRED', 'SUBMISSION_ALLOWED', 'SUBMISSION_ALLOWED'])
    expect(records[1].route).toEqual({ routeId: 'enforced-acknowledged', policyEnforced: true, warningAcknowledged: true })
  })

  it('marks a run stale after the backend forgets it', async () => {
    const run = await doneRun('sanctioned')
    const fresh = createMockBackend({ queuedPolls: 1, runningPolls: 1 })
    server.resetHandlers(...fresh.handlers)
    const records = await runGatewaySet(api, run)
    expect(records.every((r) => r.error?.status === 404)).toBe(true)
    expect(isStale(records)).toBe(true)
    expect(isStale([{ error: null }])).toBe(false)
    // a 404 that is not the Backend's own "unknown record" (a mis-routed /api, say) is not a restart
    expect(isStale([{ error: { kind: 'http', code: 'UNSTRUCTURED_ERROR', message: '', retryable: false, status: 404, requestId: null } }])).toBe(false)
  })

  it('sweeps attestation from 0 to 100 in steps of 5', async () => {
    const records = await runAttestationSweep(api, await doneRun('sanctioned'), '0.0.0-research-pending', defaultConstellationScenario)
    expect(records).toHaveLength(21)
    expect(records.map((r) => r.scenario.attestationPercent)).toEqual(Array.from({ length: 21 }, (_, i) => i * 5))
    expect(new Set(records.map((r) => r.batch)).size).toBe(1)
    expect(records.every((r) => r.purpose === 'sweep')).toBe(true)
  })

  it('records an unsupported model as an error next to a working one', async () => {
    const records = await runConstellationCompare(api, await doneRun('sanctioned'), ['0.0.0-research-pending', '0.1.0-draft'], defaultConstellationScenario)
    expect(records[0].result?.simulationOnly).toBe(true)
    expect(records[1].result).toBeNull()
    expect(records[1].error?.code).toBe('UNSUPPORTED_VERSION')
  })

  it('keeps showing the last good route set after a later attempt fails', async () => {
    const run = await doneRun('sanctioned')
    const good = await runGatewaySet(api, run)
    server.resetHandlers(...createMockBackend({ queuedPolls: 1, runningPolls: 1 }).handlers)
    const failed = await runGatewaySet(api, run)
    const sets = latestGatewaySets({ ...run, gateway: [...good, ...failed] })
    expect(sets.shown.map((r) => r.key)).toEqual(good.map((r) => r.key))
    expect(sets.last.map((r) => r.key)).toEqual(failed.map((r) => r.key))
    expect(isStale(sets.last)).toBe(true)
  })

  it('shows the failed set when there has never been a good one, and nothing when nothing ran', async () => {
    const run = await doneRun('sanctioned')
    server.resetHandlers(...createMockBackend({ queuedPolls: 1, runningPolls: 1 }).handlers)
    const failed = await runGatewaySet(api, run)
    expect(latestGatewaySets({ ...run, gateway: failed }).shown).toHaveLength(2)
    expect(latestGatewaySets(run)).toEqual({ shown: [], last: [] })
  })

  it('keeps showing the last good model comparison after a later one fails', async () => {
    const run = await doneRun('sanctioned')
    const good = await runConstellationCompare(api, run, ['0.0.0-research-pending'], defaultConstellationScenario)
    const failed = await runConstellationCompare(api, run, ['0.1.0-draft'], defaultConstellationScenario)
    const sets = latestCompare({ ...run, constellation: [...good, ...failed] })
    expect(sets.shown.map((r) => r.key)).toEqual(good.map((r) => r.key))
    expect(sets.last.map((r) => r.key)).toEqual(failed.map((r) => r.key))
  })
})
