import { describe, expect, it } from 'vitest'
import { exportCases, mergeImported, parseCaseExport } from './transfer'
import { fixtureCase } from './testCases'

describe('case export and import', () => {
  it('round-trips cases through a file', () => {
    const c = fixtureCase('CL-0001', 'sanctioned')
    const parsed = parseCaseExport(exportCases([c]))
    expect(parsed).toEqual({ ok: true, cases: [c] })
  })

  it('rejects a file in another format', () => {
    const parsed = parseCaseExport(JSON.stringify({ format: 'other', version: 1, cases: [] }))
    expect(parsed.ok).toBe(false)
  })

  it('rejects text that is not JSON', () => {
    expect(parseCaseExport('not json').ok).toBe(false)
  })

  it('rejects a case whose stored response breaks the contract and names it', () => {
    const c = fixtureCase('CL-0003', 'sanctioned')
    const run = c.runs[0]
    // A COMPLETED analysis may not carry a null score.
    ;(run.recipient!.result.evaluation as { riskScore: number | null }).riskScore = null
    const parsed = parseCaseExport(exportCases([c]))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain('CL-0003')
  })

  it('gives an imported case a new id when the id is taken', () => {
    const existing = [fixtureCase('CL-0001', 'normal')]
    const merged = mergeImported(existing, [fixtureCase('CL-0001', 'warn')])
    expect(merged.map((c) => c.id)).toEqual(['CL-0001', 'CL-0002'])
    expect(merged[1].input.recipient.fixtureId).toBe('warn')
  })
})
