import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createApiClient } from '../api/client'
import { apiBaseUrl, currentApiMode } from '../app/apiMode'
import { CasesContext, type CasesValue } from './context'
import { closeInterruptedRuns, type CaseRecord } from './model'
import { createServerCaseStore } from './serverStore'
import { createIdbCaseStore, validateCaseRecord, type CaseStore } from './store'
import { exportCases, mergeImported, parseCaseExport, type ImportErrorCode } from './transfer'

const byNewest = (a: CaseRecord, b: CaseRecord) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id))

export function CasesProvider({ store: injected, children }: { store?: CaseStore; children: ReactNode }) {
  const store = useMemo(() => injected ?? (currentApiMode() === 'backend'
    ? createServerCaseStore(createApiClient({ baseUrl: apiBaseUrl }), createIdbCaseStore()) : createIdbCaseStore()), [injected])
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [unreadable, setUnreadable] = useState<CasesValue['unreadable']>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const latest = useRef<CaseRecord[]>([])
  const pending = useRef(new Map<string, CaseRecord>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const writes = useRef(0)

  const publish = useCallback((all: CaseRecord[]) => {
    latest.current = all.sort(byNewest)
    setCases(latest.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    store.list().then((all) => {
      if (cancelled) return
      const good: CaseRecord[] = []
      const bad: CasesValue['unreadable'] = []
      for (const c of all) {
        const errors = validateCaseRecord(c)
        if (errors.length === 0) good.push(store.persistence === 'server' ? c : closeInterruptedRuns(c))
        else bad.push({ id: (c as { id?: string }).id ?? '(no id)', errors })
      }
      pending.current.clear()
      publish(good)
      setUnreadable(bad)
      setStorageError(null)
      setReady(true)
    }).catch((e: unknown) => {
      if (!cancelled) setStorageError(e instanceof Error ? e.message : String(e))
    })
    return () => { cancelled = true }
  }, [store, publish, reloadKey])

  const enqueue = useCallback((operation: () => Promise<void>) => {
    writes.current += 1
    setSaving(true)
    const task = queue.current.catch(() => {}).then(operation).catch((e: unknown) => {
      setStorageError(e instanceof Error ? e.message : String(e))
      throw e
    }).finally(() => {
      writes.current -= 1
      setSaving(writes.current > 0)
    })
    // Every caller gets its own rejection; the queue itself always has a rejection handler.
    queue.current = task.catch(() => {})
    return task
  }, [])

  const save = useCallback((record: CaseRecord) => {
    pending.current.set(record.id, record)
    publish([record, ...latest.current.filter((c) => c.id !== record.id)])
    return enqueue(async () => {
      await store.put(record)
      if (pending.current.get(record.id) === record) pending.current.delete(record.id)
      if (pending.current.size === 0) setStorageError(null)
    })
  }, [store, enqueue, publish])

  const update = useCallback(async (id: string, change: (c: CaseRecord) => CaseRecord) => {
    const current = latest.current.find((c) => c.id === id)
    if (current) await save(change(current))
  }, [save])

  const remove = useCallback((id: string) => enqueue(async () => {
    await store.remove(id)
    pending.current.delete(id)
    publish(latest.current.filter((c) => c.id !== id))
  }), [store, enqueue, publish])

  const importText = useCallback(async (text: string) => {
    const parsed = parseCaseExport(text)
    if (!parsed.ok) return { error: parsed.error, code: parsed.code }
    const merged = mergeImported(latest.current, parsed.cases)
    const added = merged.slice(latest.current.length)
    try { for (const c of added) await save(c) }
    catch (e) { return { error: e instanceof Error ? e.message : String(e), code: 'SAVE_FAILED' as ImportErrorCode } }
    return { added: added.length }
  }, [save])

  const exportText = useCallback(() => exportCases(latest.current), [])
  const retrySave = useCallback(async () => {
    for (const record of [...pending.current.values()]) await save(record)
  }, [save])
  const reload = useCallback(async () => {
    await queue.current
    setReady(false)
    setReloadKey((n) => n + 1)
  }, [])
  const value = useMemo<CasesValue>(() => ({ cases, unreadable, ready, storageError, saving, save, update, remove, importText, exportText, retrySave, reload }),
    [cases, unreadable, ready, storageError, saving, save, update, remove, importText, exportText, retrySave, reload])
  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>
}
