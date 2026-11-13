// Local storage is used for standalone Mock mode and migration; Backend mode uses serverStore.
import { createStore, del, get, set, values } from 'idb-keyval'
import { contractErrors, type ContractDef } from '../api/contract'
import type { CaseRecord } from './model'

export interface CaseStore {
  readonly persistence?: 'server'
  list(): Promise<CaseRecord[]>
  get(id: string): Promise<CaseRecord | undefined>
  put(r: CaseRecord): Promise<void>
  remove(id: string): Promise<void>
}

export function createIdbCaseStore(): CaseStore {
  // No IndexedDB (old browser, some private modes, tests): keep cases in memory for this session.
  if (typeof indexedDB === 'undefined') return createMemoryCaseStore()
  const store = createStore('scl-cases', 'cases')
  return {
    list: () => values<CaseRecord>(store),
    get: (id) => get<CaseRecord>(id, store),
    put: (r) => set(r.id, r, store),
    remove: (id) => del(id, store),
  }
}

export function createMemoryCaseStore(seed: CaseRecord[] = []): CaseStore {
  const map = new Map<string, CaseRecord>(seed.map((c) => [c.id, structuredClone(c)]))
  return {
    list: async () => [...map.values()].map((c) => structuredClone(c)),
    get: async (id) => (map.has(id) ? structuredClone(map.get(id)!) : undefined),
    put: async (r) => {
      map.set(r.id, structuredClone(r))
    },
    remove: async (id) => {
      map.delete(id)
    },
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const storedError = (v: unknown) =>
  isObj(v) && isStr(v.code) && isStr(v.message) && isStr(v.kind) && typeof v.retryable === 'boolean' && (v.status === null || typeof v.status === 'number')

/** Shape checks plus contract validation of every stored API object. Empty list = readable. */
export function validateCaseRecord(r: unknown): string[] {
  const errs: string[] = []
  if (!isObj(r)) return ['case is not an object']
  const id = isStr(r.id) ? r.id : '(no id)'
  const at = (path: string, msg: string) => errs.push(`${id} ${path}: ${msg}`)
  const contract = (path: string, def: ContractDef, value: unknown) => {
    const e = contractErrors(def, value)
    if (e) at(path, e.slice(0, 2).join('; '))
  }

  contract('case', 'api/CaseRecord', r)
  if (!isStr(r.id) || !/^CL-\d+$/.test(r.id)) at('id', 'must look like CL-0001')
  if (!isStr(r.createdAt)) at('createdAt', 'missing')
  if (!isStr(r.createdBy)) at('createdBy', 'missing')
  const input = r.input
  if (!isObj(input)) at('input', 'missing')
  else {
    if (input.mode !== 'LIVE' && input.mode !== 'FIXTURE') at('input.mode', 'must be LIVE or FIXTURE')
    for (const side of ['sender', 'recipient'] as const) {
      const p = input[side]
      if (!isObj(p) || !isStr(p.address) || !(p.fixtureId === null || isStr(p.fixtureId))) at(`input.${side}`, 'invalid party')
    }
    contract('input.asset', 'common/Asset', input.asset)
    if (!isStr(input.amountRaw) || !/^[1-9][0-9]*$/.test(input.amountRaw)) at('input.amountRaw', 'must be a positive integer string')
    if (!isStr(input.policyVersion)) at('input.policyVersion', 'missing')
  }
  if (!Array.isArray(r.runs)) at('runs', 'missing')
  else
    r.runs.forEach((run: unknown, i: number) => {
      const p = `runs[${i}]`
      if (!isObj(run)) return at(p, 'not an object')
      if (!isStr(run.runId)) at(`${p}.runId`, 'missing')
      if (!isStr(run.startedAt)) at(`${p}.startedAt`, 'missing')
      if (run.error !== null && !storedError(run.error)) at(`${p}.error`, 'invalid')
      if (run.failedStep !== null && !['sender', 'recipient', 'policy'].includes(run.failedStep as string)) at(`${p}.failedStep`, 'invalid')
      if (!['RUNNING', 'DONE', 'FAILED'].includes(run.status as string)) at(`${p}.status`, 'invalid')
      if (run.apiMode !== 'mock' && run.apiMode !== 'backend') at(`${p}.apiMode`, 'invalid')
      for (const side of ['sender', 'recipient'] as const) {
        const snap = run[side]
        if (snap === null) continue
        if (!isObj(snap)) {
          at(`${p}.${side}`, 'invalid')
          continue
        }
        contract(`${p}.${side}.result`, 'api/KYTAnalysisResult', snap.result)
        if (Array.isArray(snap.transfers)) snap.transfers.forEach((t, j) => contract(`${p}.${side}.transfers[${j}]`, 'collector/NormalizedTransfer', t))
        else if (snap.transfers !== null) at(`${p}.${side}.transfers`, 'must be a list or null')
      }
      if (run.complianceRequest !== null) contract(`${p}.complianceRequest`, 'api/ComplianceRequest', run.complianceRequest)
      if (run.compliance !== null) contract(`${p}.compliance`, 'api/ComplianceResponse', run.compliance)
      if (!Array.isArray(run.gateway) || !Array.isArray(run.constellation)) at(p, 'simulation lists missing')
      else {
        // every field the simulation screens read, so a tampered file is refused here instead of crashing a screen later
        const simRecord = (path: string, rec: unknown, resultDef: ContractDef): rec is Record<string, unknown> => {
          if (!isObj(rec)) return at(path, 'not an object'), false
          if (!isStr(rec.key) || !isStr(rec.at)) at(path, 'key or time missing')
          if (rec.result !== null) contract(`${path}.result`, resultDef, rec.result)
          if (rec.error !== null && !storedError(rec.error)) at(`${path}.error`, 'invalid')
          return true
        }
        run.gateway.forEach((g, j) => {
          const path = `${p}.gateway[${j}]`
          if (simRecord(path, g, 'experiment/GatewayExperimentResult')) contract(`${path}.route`, 'experiment/GatewayRoute', g.route)
        })
        run.constellation.forEach((c, j) => {
          const path = `${p}.constellation[${j}]`
          if (!simRecord(path, c, 'experiment/ConstellationSimulationResult')) return
          if (!isStr(c.batch) || !isStr(c.version) || (c.purpose !== 'compare' && c.purpose !== 'sweep')) at(path, 'batch, version or purpose invalid')
          contract(`${path}.scenario`, 'experiment/ConstellationScenario', c.scenario)
        })
      }
    })
  return errs
}
