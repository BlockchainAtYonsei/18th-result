import { describe, expect, it } from 'vitest'
import { fixtureCase } from '../../cases/testCases'
import { filterCases } from './filter'

const cases = [fixtureCase('CL-0001', 'sanctioned'), fixtureCase('CL-0002', 'warn'), fixtureCase('CL-0003', 'partial-sanctioned')]

describe('filterCases', () => {
  it('keeps cases whose latest decision matches', () => {
    expect(filterCases(cases, 'BLOCK', '').map((c) => c.id)).toEqual(['CL-0001', 'CL-0003'])
    expect(filterCases(cases, 'WARN', '').map((c) => c.id)).toEqual(['CL-0002'])
    expect(filterCases(cases, 'all', '')).toHaveLength(3)
  })

  it('finds a case by an address prefix, ignoring case', () => {
    expect(filterCases(cases, 'all', '4VJ9JU')).toHaveLength(3)
    expect(filterCases(cases, 'all', 'cl-0002').map((c) => c.id)).toEqual(['CL-0002'])
  })

  it('finds a case by a transfer signature', () => {
    // signature of a fan-out transfer in the warn fixture
    expect(filterCases(cases, 'all', 'G8mkV3evpXRR').map((c) => c.id)).toEqual(['CL-0002'])
  })

  it('separates failed runs', () => {
    const failed = fixtureCase('CL-0004', 'normal')
    failed.runs[0] = { ...failed.runs[0], status: 'FAILED', compliance: null, failedStep: 'policy' }
    expect(filterCases([...cases, failed], 'failed', '').map((c) => c.id)).toEqual(['CL-0004'])
  })
})
