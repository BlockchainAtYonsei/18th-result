import { describe, expect, it, vi } from 'vitest'
import { ApiFailure, type CaseDocument } from '../api/client'
import type { CaseRecord } from './model'
import { createMemoryCaseStore } from './store'
import { createServerCaseStore } from './serverStore'
import { fixtureCase } from './testCases'

const result = <T,>(data: T) => ({ data, requestId: 'test', location: null })
const conflict = () => new ApiFailure({ kind: 'http', status: 409, code: 'CONFLICT', message: 'Changed', retryable: false })
function server(seed: CaseRecord[] = []) {
  const documents = new Map<string, CaseDocument>(seed.map((c) => [c.id, { schemaVersion: '0.1.0', revision: 1, case: c }]))
  const api = {
    listCases: vi.fn(async (cursor?: string) => {
      const items = [...documents.values()].filter((d) => !cursor || d.case.id > cursor).sort((a, b) => a.case.id.localeCompare(b.case.id))
      // Small pages ensure the store actually consumes pagination.
      return result({ schemaVersion: '0.1.0' as const, items: items.slice(0, 1), nextCursor: items.length > 1 ? items[0].case.id : null })
    }),
    getCase: vi.fn(async (id: string) => result(structuredClone(documents.get(id)!))),
    saveCase: vi.fn(async (c: CaseRecord, revision: number) => {
      if ((documents.get(c.id)?.revision ?? 0) !== revision) throw conflict()
      const document: CaseDocument = { schemaVersion: '0.1.0', revision: revision + 1, case: structuredClone(c) }
      documents.set(c.id, document)
      return result(document)
    }),
    deleteCase: vi.fn(async (id: string, revision: number) => {
      if (documents.get(id)?.revision !== revision) throw conflict()
      documents.delete(id)
      return result({ schemaVersion: '0.1.0', caseId: id, deleted: true as const })
    }),
  }
  return { api, documents }
}

describe('server case store', () => {
  it('loads every page and reopens the same records in an independent browser store', async () => {
    const { api } = server([fixtureCase('CL-0001', 'normal'), fixtureCase('CL-0002', 'warn')])
    const first = createServerCaseStore(api)
    expect(await first.list()).toHaveLength(2)
    const c = (await first.get('CL-0001'))!
    await first.put({ ...c, createdBy: 'Changed' })
    const second = createServerCaseStore(api)
    expect((await second.list()).find((r) => r.id === c.id)?.createdBy).toBe('Changed')
    await second.remove(c.id)
    expect(await createServerCaseStore(api).list()).toHaveLength(1)
  })
  it('refuses stale browser writes instead of overwriting another browser', async () => {
    const { api, documents } = server([fixtureCase('CL-0001', 'normal')])
    const a = createServerCaseStore(api), b = createServerCaseStore(api)
    const [c] = await a.list(); await b.list()
    await a.put({ ...c, createdBy: 'Browser A' })
    await expect(b.put({ ...c, createdBy: 'Browser B' })).rejects.toMatchObject({ status: 409 })
    expect(documents.get(c.id)?.case.createdBy).toBe('Browser A')
  })
  it('moves legacy cases only after the server acknowledges the write', async () => {
    const c = fixtureCase('CL-0001', 'normal')
    const legacy = createMemoryCaseStore([c])
    const { api } = server()
    api.saveCase.mockRejectedValueOnce(new Error('offline'))
    const store = createServerCaseStore(api, legacy)
    await expect(store.list()).rejects.toThrow('offline')
    expect(await legacy.get(c.id)).toEqual(c)
    expect(await store.list()).toEqual([c])
    expect(await legacy.list()).toEqual([])
    expect(await store.list()).toEqual([c])
  })
  it('preserves both records when legacy and server IDs collide', async () => {
    const original = fixtureCase('CL-0001', 'normal')
    const local = { ...original, createdBy: 'Local' }
    const legacy = createMemoryCaseStore([local])
    const { api, documents } = server([original])
    const all = await createServerCaseStore(api, legacy).list()
    expect(all).toHaveLength(2)
    expect(documents.get(original.id)?.case).toEqual(original)
    expect(all.find((r) => r.createdBy === 'Local')?.id).not.toBe(original.id)
    expect(await legacy.list()).toHaveLength(0)
  })
  it('does not duplicate a migration after a lost acknowledgement', async () => {
    const original = fixtureCase('CL-0001', 'normal')
    const legacy = createMemoryCaseStore([original])
    const { api } = server([original])
    expect(await createServerCaseStore(api, legacy).list()).toEqual([original])
    expect(api.saveCase).not.toHaveBeenCalled()
    expect(await legacy.list()).toHaveLength(0)
  })
  it('never falls back to local storage when the server cannot be reached', async () => {
    const { api } = server()
    const local = createMemoryCaseStore([fixtureCase('CL-0001', 'normal')])
    api.listCases.mockRejectedValue(new Error('unreachable'))
    await expect(createServerCaseStore(api, local).list()).rejects.toThrow('unreachable')
    expect(await local.list()).toHaveLength(1)
  })
})

it('keeps unreadable legacy records locally and exposes them for the unreadable-record notice', async () => {
  const original = fixtureCase('CL-0001', 'normal')
  const invalid = { ...original, createdAt: 'broken' }
  const legacy = createMemoryCaseStore([invalid])
  const { api } = server()
  expect(await createServerCaseStore(api, legacy).list()).toEqual([invalid])
  expect(await legacy.list()).toEqual([invalid])
  expect(api.saveCase).not.toHaveBeenCalled()
})
