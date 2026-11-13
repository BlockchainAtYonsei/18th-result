import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConstellationScenario, ConstellationSimulationResult } from '../../../api/types'
import type { ConstellationSimRecord } from '../../../cases/model'
import { ResultCard } from './NetworkResult'

afterEach(cleanup)

const scenario: ConstellationScenario = { proposerCount: 4, rejectingProposerCount: 1, submittedToAcceptingProposer: true, psliceAvailable: true, attestationPercent: 100, leaderAttemptsExclusion: true }
const record = (version: string, result: Partial<ConstellationSimulationResult>, s = scenario): ConstellationSimRecord => ({
  key: `cs-${version}`,
  at: '2026-11-11T00:00:00.000Z',
  batch: 'cmp-1',
  purpose: 'compare',
  version,
  scenario: s,
  result: {
    schemaVersion: '0.1.0',
    simulationId: 'sim-1',
    intentId: 'intent-1',
    protocolModelVersion: version,
    proposerPathAvailable: true,
    psliceInclusionEnforced: false,
    leaderExclusionValid: null,
    outcome: 'INCLUSION_NOT_ENFORCED',
    explanationCodes: ['NO_EXCLUSION_ATTEMPT'],
    simulationOnly: true,
    ...result,
  } as ConstellationSimulationResult,
  error: null,
})

describe('network result card', () => {
  it('draws attested batches reaching the leader only when the simulator reported the attestation step', () => {
    const { container } = render(
      <ResultCard animated={false} rec={record('0.1.0-draft', { psliceInclusionEnforced: true, leaderExclusionValid: false, outcome: 'INCLUSION_ENFORCED', explanationCodes: ['ATTESTATION_CONDITION_MET', 'LEADER_EXCLUSION_INVALID'] })} />,
    )
    expect(container.querySelectorAll('.batch-attested')).toHaveLength(3)
    expect(container.querySelector('.net-leader text')?.textContent).toBe('✓')
    expect(screen.getByText('The leader must include it.')).toBeTruthy()
  })

  it('draws no proposer batches for a model that reports no attestation step', () => {
    const { container } = render(<ResultCard animated={false} rec={record('0.1.0-single-leader', { leaderExclusionValid: true, explanationCodes: ['LEADER_EXCLUSION_VALID'] })} />)
    expect(container.querySelectorAll('.batch-attested, .batch-unattested')).toHaveLength(0)
    expect(container.querySelectorAll('.to-leader')).toHaveLength(1)
    expect(container.querySelector('.net-leader text')?.textContent).toBe('?')
  })

  it('says so when there are more proposers than it draws, and keeps their proportion', () => {
    const { container } = render(<ResultCard animated={false} rec={record('0.1.0-draft', {}, { ...scenario, proposerCount: 20, rejectingProposerCount: 5 })} />)
    expect(container.querySelectorAll('.proposer')).toHaveLength(8)
    expect(container.querySelectorAll('.proposer-rejecting')).toHaveLength(2)
    expect(screen.getByText('Drawn with 8 of 20 proposers, in the same proportion.')).toBeTruthy()
  })

  it('gives a placeholder result no picture', () => {
    const { container } = render(<ResultCard animated={false} rec={record('0.0.0-research-pending', { explanationCodes: ['MOCK_RESULT_NOT_PROTOCOL_VALIDATED'] })} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

it('shows a skipped block without drawing a successful transfer into the leader', () => {
  const { container } = render(<ResultCard animated={false} rec={record('0.2.0-research', {
    blockStatus: 'SKIPPED', outcome: 'BLOCK_SKIPPED', psliceInclusionEnforced: false,
    explanationCodes: ['BLOCK_PARTICIPATION_BELOW_THRESHOLD'],
    modelParameters: { sourceId: 'team-research-40-60-v1', psliceInclusionThresholdPercent: 40, blockParticipationThresholdPercent: 60 },
  }, { ...scenario, attestationPercent: 40, attesterParticipationPercent: 59.99 })} />)
  expect(screen.getByText('Block skipped.')).toBeTruthy()
  expect(screen.getByText('The block is skipped; this is not a selective transaction block.')).toBeTruthy()
  expect(container.querySelectorAll('.to-leader, .batch-attested')).toHaveLength(0)
  expect(screen.getByText('Applied rules: pslice ≥ 40%, aggregate participation ≥ 60%.')).toBeTruthy()
})
it('labels old results as historical rather than applying the current thresholds', () => {
  render(<ResultCard animated={false} rec={record('0.1.0-draft', {})} />)
  expect(screen.getByText('Historical model result. Its original rules differ from the current 40% / 60% model.')).toBeTruthy()
})
it('draws an invalid leader exclusion as an invalid block instead of a successful inclusion', () => {
  const { container } = render(<ResultCard animated={false} rec={record('0.2.0-research', {
    blockStatus: 'INVALID_LEADER_EXCLUSION', outcome: 'INCLUSION_ENFORCED', psliceInclusionEnforced: true,
    leaderExclusionValid: false, explanationCodes: ['ATTESTATION_CONDITION_MET', 'LEADER_EXCLUSION_INVALID'],
  })} />)
  expect(container.querySelector('.net-leader text')?.textContent).toBe('✕')
  expect(screen.getByText('A block omitting this required pslice would be invalid.')).toBeTruthy()
})
