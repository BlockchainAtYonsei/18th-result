import { describe, expect, it } from 'vitest'
import { closeInterruptedRuns, latestRun, newCaseId, toStoredError } from './model'
import { createMemoryCaseStore, validateCaseRecord } from './store'
import { fixtureCase } from './testCases'
import { ApiFailure } from '../api/client'

describe('case store', () => {
  it('saves, lists, reads and removes cases', async () => {
    const store = createMemoryCaseStore()
    const c = fixtureCase('CL-0001', 'sanctioned')
    await store.put(c)
    expect((await store.list()).map((x) => x.id)).toEqual(['CL-0001'])
    expect((await store.get('CL-0001'))?.input.recipient.fixtureId).toBe('sanctioned')
    await store.remove('CL-0001')
    expect(await store.list()).toEqual([])
  })

  it('hands out the next free case id', () => {
    expect(newCaseId([])).toBe('CL-0001')
    expect(newCaseId([fixtureCase('CL-0007', 'normal'), fixtureCase('CL-0002', 'warn')])).toBe('CL-0008')
  })

  it('accepts a well-formed fixture case', () => {
    expect(validateCaseRecord(fixtureCase('CL-0001', 'partial-sanctioned'))).toEqual([])
  })

  it('picks the most recent run', () => {
    const c = fixtureCase('CL-0001', 'warn')
    c.runs.push({ ...c.runs[0], runId: 'second', startedAt: '2026-11-11T01:00:00.000Z' })
    expect(latestRun(c)?.runId).toBe('second')
  })

  it('stores API failures as plain data', () => {
    const e = toStoredError(new ApiFailure({ kind: 'http', status: 409, code: 'CONFLICT', message: 'no', retryable: false, requestId: 'r1' }))
    expect(e).toEqual({ kind: 'http', status: 409, code: 'CONFLICT', message: 'no', retryable: false, requestId: 'r1' })
    expect(toStoredError(new Error('boom')).kind).toBe('network')
  })

  it('rejects simulation records the screens cannot draw', () => {
    const base = fixtureCase('CL-0001', 'sanctioned')
    const withRun = (patch: Record<string, unknown>) => ({ ...base, runs: [{ ...base.runs[0], ...patch }] })
    const good = { key: 'gw-1', at: '2026-11-11T00:00:00.000Z', route: { routeId: 'enforced', policyEnforced: true, warningAcknowledged: false }, result: null, error: null }
    expect(validateCaseRecord(withRun({ gateway: [good] }))).toEqual([])
    expect(validateCaseRecord(withRun({ gateway: [null] })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ gateway: [{ ...good, route: undefined }] })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ constellation: [{ key: 'cs-1', at: 'x', batch: 'b', purpose: 'compare', version: '1.0.0', result: null, error: null }] })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ startedAt: 5 })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ recipient: { ...base.runs[0].recipient!, transfers: {} } })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ error: { kind: 'http', code: 'X', message: 'm', retryable: false } })).length).toBeGreaterThan(0)
    expect(validateCaseRecord(withRun({ error: 'boom' })).length).toBeGreaterThan(0)
  })

  it('closes a run that was still running when the page went away', () => {
    const c = fixtureCase('CL-0001', 'sanctioned')
    const stuck = { ...c.runs[0], status: 'RUNNING' as const, finishedAt: null, compliance: null, complianceRequest: null }
    const closed = closeInterruptedRuns({ ...c, runs: [stuck] }).runs[0]
    expect(closed.status).toBe('FAILED')
    expect(closed.failedStep).toBe('policy')
    expect(closed.error).toMatchObject({ code: 'INTERRUPTED', retryable: true })
    expect(closeInterruptedRuns(c)).toBe(c)
  })
})
