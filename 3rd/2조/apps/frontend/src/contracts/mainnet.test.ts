import { describe, expect, it } from 'vitest'
import { contractErrors } from '../api/contract'
import type { AnalysisRequest } from '../api/types'
import { buildAnalysisRequest } from '../flow/runCase'
import { fixtureInput } from '../flow/testInputs'
import { findScenario, scenarioSender } from './catalog'

const requests = import.meta.glob<AnalysisRequest>(
  '../../../../services/collector/fixtures/*/collection-request.json', { eager: true, import: 'default' },
)

describe('recorded mainnet scenarios', () => {
  it.each(Object.entries(requests))('replays the exact saved window of %s through the Public API', (_path, saved) => {
    const scenario = findScenario(saved.fixtureId!)!
    const input = fixtureInput(scenarioSender(scenario.fixtureId), scenario.fixtureId)
    const request = buildAnalysisRequest(input.recipient, input)
    expect(contractErrors('api/AnalysisRequest', request)).toBeNull()
    expect(request).not.toHaveProperty('requestId')
    expect(request).toEqual({ address: saved.address, network: saved.network, mode: 'FIXTURE', fixtureId: saved.fixtureId, scope: saved.scope })
    expect(scenario.provenance.dataType).toBe('ON_CHAIN')
    expect(scenario.provenance.source).toBe('NODIT_SOLANA_RPC')
    expect(scenario.capturedAt).toMatch(/^2026-11-10T/)
    expect(findScenario(input.sender.fixtureId!)?.provenance.dataType).toBe('ON_CHAIN')
  })
})
