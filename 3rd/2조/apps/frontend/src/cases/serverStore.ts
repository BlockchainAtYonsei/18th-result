// Dashboard case snapshots are server-owned in Backend mode. Never fall back to local writes on failure.
import { ApiFailure, type ApiClient } from '../api/client'
import type { CaseRecord } from './model'
import { validateCaseRecord, type CaseStore } from './store'

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
}

async function migrationId(record: CaseRecord): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(record)))
  const hex = [...new Uint8Array(hash)].slice(0, 12).map((n) => n.toString(16).padStart(2, '0')).join('')
  return `CL-${BigInt(`0x${hex}`).toString()}`
}

export function createServerCaseStore(api: Pick<ApiClient, 'listCases' | 'getCase' | 'saveCase' | 'deleteCase'>, legacy?: CaseStore): CaseStore {
  const revisions = new Map<string, number>()
  const put = async (record: CaseRecord) => {
    const result = await api.saveCase(record, revisions.get(record.id) ?? 0)
    revisions.set(record.id, result.data.revision)
  }
  const list = async () => {
    const records = new Map<string, CaseRecord>()
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const { data } = await api.listCases(cursor)
      for (const document of data.items) {
        records.set(document.case.id, document.case)
        revisions.set(document.case.id, document.revision)
      }
      cursor = data.nextCursor ?? undefined
      if (cursor && seen.has(cursor)) throw new Error('The server repeated a case page cursor.')
      if (cursor) seen.add(cursor)
    } while (cursor)
    const unreadable: CaseRecord[] = []
    // Delete a legacy copy only after its identical contents are confirmed on the server.
    // A deterministic alternate ID makes collisions/retries safe across browsers.
    for (const record of legacy ? await legacy.list() : []) {
      if (validateCaseRecord(record).length) { unreadable.push(record); continue }
      let migrated = record
      const existing = records.get(record.id)
      if (existing && canonical(existing) !== canonical(record)) migrated = { ...record, id: await migrationId(record) }
      const match = records.get(migrated.id)
      if (!match) {
        try { await put(migrated) }
        catch (error) {
          // Another tab may have migrated the same record since this listing.
          if (!(error instanceof ApiFailure) || error.status !== 409) throw error
          const found = await api.getCase(migrated.id)
          if (canonical(found.data.case) !== canonical(migrated)) throw error
          revisions.set(migrated.id, found.data.revision)
        }
        records.set(migrated.id, migrated)
      } else if (canonical(match) !== canonical(migrated)) throw new Error('A migrated case conflicts with the server copy.')
      await legacy!.remove(record.id)
    }
    return [...records.values(), ...unreadable]
  }
  return {
    persistence: 'server',
    list,
    get: async (id) => {
      try {
        const { data } = await api.getCase(id)
        revisions.set(id, data.revision)
        return data.case
      } catch (e) { if (e instanceof ApiFailure && e.status === 404) return undefined; throw e }
    },
    put,
    remove: async (id) => {
      await api.deleteCase(id, revisions.get(id) ?? 0)
      revisions.delete(id)
    },
  }
}
