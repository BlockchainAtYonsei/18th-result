import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CasesProvider } from './CasesProvider'
import type { CasesValue } from './context'
import type { GatewaySimRecord } from './model'
import { createMemoryCaseStore } from './store'
import { fixtureCase } from './testCases'
import { useCases } from './useCases'

afterEach(cleanup)

function Probe({ onValue }: { onValue: (v: CasesValue) => void }) {
  onValue(useCases())
  return null
}

const record = (key: string): GatewaySimRecord => ({
  key,
  at: '2026-11-11T00:00:00.000Z',
  route: { routeId: key, policyEnforced: true, warningAcknowledged: false },
  result: null,
  error: null,
})

describe('CasesProvider.update', () => {
  it('applies two changes started from the same snapshot without losing either', async () => {
    const store = createMemoryCaseStore([fixtureCase('CL-0001', 'sanctioned')])
    let cases!: CasesValue
    render(
      <CasesProvider store={store}>
        <Probe onValue={(v) => (cases = v)} />
      </CasesProvider>,
    )
    await act(async () => {})
    const add = (key: string) =>
      cases.update('CL-0001', (c) => ({ ...c, runs: c.runs.map((r) => ({ ...r, gateway: [...r.gateway, record(key)] })) }))
    await act(async () => {
      await Promise.all([add('a'), add('b')])
    })
    const saved = (await store.list())[0]
    expect(saved.runs[0].gateway.map((g) => g.key)).toEqual(['a', 'b'])
  })
})

it('serializes delayed writes so an old progress response cannot overwrite a completed result', async () => {
  const memory = createMemoryCaseStore()
  let release!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  const store = { ...memory, put: async (c: import('./model').CaseRecord) => { if (++calls === 1) await blocked; await memory.put(c) } }
  let cases!: CasesValue
  render(<CasesProvider store={store}><Probe onValue={(v) => { cases = v }} /></CasesProvider>)
  await act(async () => {})
  const c = fixtureCase('CL-0001', 'normal')
  await act(async () => {
    const first = cases.save({ ...c, createdBy: 'Progress' })
    const last = cases.save({ ...c, createdBy: 'Finished' })
    release()
    await Promise.all([first, last])
  })
  expect((await store.get(c.id))?.createdBy).toBe('Finished')
  expect(cases.saving).toBe(false)
})

it('keeps an unsaved result visible, reports the failure and retries it', async () => {
  const memory = createMemoryCaseStore()
  let fail = true
  const store = { ...memory, put: async (c: import('./model').CaseRecord) => { if (fail) throw new Error('offline'); await memory.put(c) } }
  let cases!: CasesValue
  render(<CasesProvider store={store}><Probe onValue={(v) => { cases = v }} /></CasesProvider>)
  await act(async () => {})
  const c = fixtureCase('CL-0001', 'normal')
  await act(async () => { await expect(cases.save(c)).rejects.toThrow('offline') })
  expect(cases.storageError).toBe('offline')
  expect(cases.cases).toEqual([c])
  expect(await memory.list()).toHaveLength(0)
  fail = false
  await act(async () => { await cases.retrySave() })
  expect(cases.storageError).toBeNull()
  expect(await memory.get(c.id)).toEqual(c)
})

it('shows a failed initial load without presenting an empty ready store', async () => {
  const memory = createMemoryCaseStore()
  let fail = true
  const store = { ...memory, list: async () => { if (fail) throw new Error('offline'); return memory.list() } }
  let cases!: CasesValue
  render(<CasesProvider store={store}><Probe onValue={(v) => { cases = v }} /></CasesProvider>)
  await act(async () => {})
  expect(cases.ready).toBe(false)
  expect(cases.storageError).toBe('offline')
  fail = false
  await act(async () => { await cases.reload() })
  expect(cases.ready).toBe(true)
  expect(cases.storageError).toBeNull()
})

it('does not mark another browser’s active server run as interrupted merely by viewing it', async () => {
  const c = fixtureCase('CL-0001', 'normal')
  c.runs[0].status = 'RUNNING'
  c.runs[0].finishedAt = null
  const store = { ...createMemoryCaseStore([c]), persistence: 'server' as const }
  let cases!: CasesValue
  render(<CasesProvider store={store}><Probe onValue={(v) => { cases = v }} /></CasesProvider>)
  await act(async () => {})
  expect(cases.cases[0].runs[0].status).toBe('RUNNING')
  expect(cases.cases[0].runs[0].error).toBeNull()
})
