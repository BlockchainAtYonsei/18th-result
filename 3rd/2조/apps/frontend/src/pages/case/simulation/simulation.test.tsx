import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from '../../../api/client'
import type { ConstellationRequest } from '../../../api/types'
import { setModeOverride } from '../../../app/apiMode'
import type { CaseRecord } from '../../../cases/model'
import { runCase } from '../../../flow/runCase'
import { fixtureInput } from '../../../flow/testInputs'
import { createMockBackend } from '../../../mocks/backend'
import { renderPage } from '../../../test/render'
import { CasePage } from '../../CasePage'

const mock = createMockBackend({ queuedPolls: 1, runningPolls: 1 })
const server = setupServer(...mock.handlers)
const api = createApiClient({ baseUrl: 'http://localhost' })
const forget = () => server.resetHandlers(...createMockBackend({ queuedPolls: 1, runningPolls: 1 }).handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  localStorage.clear()
  server.resetHandlers(...mock.handlers)
  mock.reset()
})
afterAll(() => server.close())

async function caseFor(recipient: string): Promise<CaseRecord> {
  const input = fixtureInput('sender', recipient)
  const run = await runCase(api, input, () => {}, { pollIntervalMs: 0, apiMode: 'mock' })
  return { id: 'CL-0001', createdAt: '2026-11-11T00:00:00.000Z', createdBy: 'Tester', input, runs: [run] }
}

async function openDialog(recipient: string, before?: () => void) {
  const record = await caseFor(recipient)
  before?.()
  const page = renderPage(<CasePage runOptions={{ pollIntervalMs: 0 }} />, { path: '/cases/:caseId', at: '/cases/CL-0001', seed: [record], api })
  fireEvent.click(await screen.findByRole('button', { name: "What if it's sent another way?" }))
  return { dialog: await screen.findByRole('dialog'), ...page }
}

describe('simulation dialog', () => {
  it('shows the route comparison and what it means as soon as it opens', async () => {
    const { dialog, store } = await openDialog('sanctioned')
    expect(await within(dialog).findByText('Stopped')).toBeTruthy()
    expect(within(dialog).getByText('Submitted')).toBeTruthy()
    expect(within(dialog).getByText(/only holds inside this app/)).toBeTruthy()
    expect(within(dialog).getByTestId('routes').className).not.toContain('is-static')
    expect(within(dialog).getByText('Simulation only. Nothing is broadcast.')).toBeTruthy()
    await waitFor(async () => expect((await store.list())[0].runs[0].gateway).toHaveLength(2))
  })

  it('draws each route from the transfer towards the network and marks where it stops', async () => {
    const { dialog } = await openDialog('sanctioned')
    await within(dialog).findByText('Stopped')
    const routes = within(dialog).getAllByTestId('route')
    expect(routes.map((r) => r.getAttribute('data-outcome'))).toEqual(['SUBMISSION_REJECTED', 'SUBMISSION_ALLOWED'])
    for (const r of routes) {
      expect(within(r).getByText('Transfer')).toBeTruthy()
      expect(within(r).getByText('Network')).toBeTruthy()
    }
    // only the route that submits gets a token that reaches the network
    expect(routes[0].querySelector('.route-out .route-token')).toBeNull()
    expect(routes[1].querySelector('.route-out .route-token')).not.toBeNull()
  })

  it('shows saved results on reopening instead of running again', async () => {
    const { dialog, store } = await openDialog('sanctioned')
    await within(dialog).findByText('Stopped')
    await waitFor(async () => expect((await store.list())[0].runs[0].gateway).toHaveLength(2))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    fireEvent.click(await screen.findByRole('button', { name: "What if it's sent another way?" }))
    const again = await screen.findByRole('dialog')
    expect(await within(again).findByText('Stopped')).toBeTruthy()
    // saved results are shown at once: the run animation is for a run that just happened
    expect(within(again).getByTestId('routes').className).toContain('is-static')
    expect((await store.list())[0].runs[0].gateway).toHaveLength(2)
  })

  it('shows three routes for a warning, one with the warning confirmed', async () => {
    const { dialog } = await openDialog('warn')
    expect(await within(dialog).findByText('Held for review')).toBeTruthy()
    expect(within(dialog).getByText('Through this app, warning confirmed')).toBeTruthy()
    expect(within(dialog).getAllByText('Submitted')).toHaveLength(2)
  })

  it('asks for a re-run when the backend has forgotten the case', async () => {
    const { dialog } = await openDialog('sanctioned', forget)
    expect(await within(dialog).findByText(/no longer has this run/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Re-run case' })).toBeTruthy()
  })

  it('keeps the last good result on screen when a later attempt fails', async () => {
    const { dialog } = await openDialog('sanctioned')
    await within(dialog).findByText('Stopped')
    forget()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run again' }))
    expect(await within(dialog).findByText(/no longer has this run/)).toBeTruthy()
    expect(within(dialog).getByText('Stopped')).toBeTruthy()
  })

  it('in Mock mode says the network result is a placeholder and offers no scenarios or sweep', async () => {
    const { dialog } = await openDialog('sanctioned')
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'On the network' }))
    fireEvent.click(within(dialog).getByRole('tab', { name: 'On the network' }))
    expect(await within(dialog).findByText(/it returns one placeholder result/)).toBeTruthy()
    expect(await within(dialog).findByText(/Placeholder result\. Changing the inputs does not change it/)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Attestation sweep' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /High attestation/ })).toBeNull()
  })
})

describe('simulation dialog against a Backend', () => {
  // A stand-in for the simulator: returns separate research and single-leader results; the server owns both rules.
  function simulator(calls: ConstellationRequest[], failing = { on: false }) {
    return http.post('*/api/v1/experiments/constellation', async ({ request }) => {
      const body = (await request.json()) as ConstellationRequest
      calls.push(body)
      if (failing.on) return HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'boom', retryable: false }, requestId: 'r-1' }, { status: 500 })
      const baseline = body.protocolModelVersion.endsWith('single-leader')
      const skipped = !baseline && (body.scenario.attesterParticipationPercent ?? 100) < 60
      const met = !baseline && !skipped && body.scenario.attestationPercent >= 40
      return HttpResponse.json({
        schemaVersion: '0.1.0',
        simulationId: `sim-${calls.length}`,
        intentId: body.intentId,
        protocolModelVersion: body.protocolModelVersion,
        proposerPathAvailable: true,
        psliceInclusionEnforced: met,
        leaderExclusionValid: skipped ? null : !met,
        blockStatus: baseline ? 'NOT_EVALUATED' : skipped ? 'SKIPPED' : met ? 'INVALID_LEADER_EXCLUSION' : 'VALID',
        ...(!baseline ? { modelParameters: { sourceId: 'team-research-40-60-v1', psliceInclusionThresholdPercent: 40, blockParticipationThresholdPercent: 60 } } : {}),
        outcome: skipped ? 'BLOCK_SKIPPED' : met ? 'INCLUSION_ENFORCED' : 'INCLUSION_NOT_ENFORCED',
        explanationCodes: skipped ? ['BLOCK_PARTICIPATION_BELOW_THRESHOLD'] : met ? ['ATTESTATION_CONDITION_MET', 'LEADER_EXCLUSION_INVALID'] : ['ATTESTATION_CONDITION_NOT_MET', 'LEADER_EXCLUSION_VALID'],
        simulationOnly: true,
      })
    })
  }

  async function openNetwork(calls: ConstellationRequest[], failing = { on: false }) {
    setModeOverride('backend')
    const opened = await openDialog('sanctioned', () => server.use(simulator(calls, failing)))
    fireEvent.mouseDown(within(opened.dialog).getByRole('tab', { name: 'On the network' }))
    fireEvent.click(within(opened.dialog).getByRole('tab', { name: 'On the network' }))
    return opened
  }

  it('runs the first scenario once on opening the tab and draws what the simulator returned', async () => {
    const calls: ConstellationRequest[] = []
    const { dialog } = await openNetwork(calls)
    expect(await within(dialog).findByText('The leader must include it.')).toBeTruthy()
    expect(calls.map((c) => c.scenario.attestationPercent)).toEqual([100, 100])
    expect(dialog.querySelectorAll('.batch-attested').length).toBeGreaterThan(0)
  })

  it('sends the scenario a button names and shows the new answer', async () => {
    const calls: ConstellationRequest[] = []
    const { dialog } = await openNetwork(calls)
    await within(dialog).findByText('The leader must include it.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Low attestation (30%)' }))
    expect((await within(dialog).findAllByText('Nothing forces the leader to include it.')).length).toBeGreaterThan(0)
    expect(calls.at(-1)?.scenario.attestationPercent).toBe(30)
    expect(within(dialog).getByRole('button', { name: 'Low attestation (30%)' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the last answer and reports a failed attempt once', async () => {
    const calls: ConstellationRequest[] = []
    const failing = { on: false }
    const { dialog } = await openNetwork(calls, failing)
    await within(dialog).findByText('The leader must include it.')
    failing.on = true
    fireEvent.click(within(dialog).getByRole('button', { name: 'Low attestation (30%)' }))
    expect(await within(dialog).findByText('The backend hit an internal error.')).toBeTruthy()
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1)
    expect(within(dialog).getByText('The leader must include it.')).toBeTruthy()
  })
  it('sends both exact thresholds and distinguishes an insufficient-participation block skip', async () => {
    const calls: ConstellationRequest[] = []
    const { dialog } = await openNetwork(calls)
    await within(dialog).findByText('The leader must include it.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exact thresholds (40% / 60%)' }))
    await waitFor(() => expect(calls.at(-1)?.scenario).toMatchObject({ attestationPercent: 40, attesterParticipationPercent: 60 }))
    await within(dialog).findAllByText('Target pslice: 40% · Aggregate participation: 60%.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insufficient participation (59.99%)' }))
    expect(await within(dialog).findByText('The block is skipped; this is not a selective transaction block.')).toBeTruthy()
    expect(calls.at(-1)?.scenario.attesterParticipationPercent).toBe(59.99)
  })

})
