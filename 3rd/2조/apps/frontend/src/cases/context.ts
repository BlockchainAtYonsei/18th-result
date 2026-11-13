import { createContext } from 'react'
import type { ImportErrorCode } from './transfer'
import type { CaseRecord } from './model'

export interface CasesValue {
  cases: CaseRecord[]
  /** Records found in storage that failed validation; shown as "could not be read", never dropped silently. */
  unreadable: { id: string; errors: string[] }[]
  ready: boolean
  storageError: string | null
  saving: boolean
  retrySave(): Promise<void>
  reload(): Promise<void>
  save(r: CaseRecord): Promise<void>
  /** Changes one case starting from its latest state, so two writers in flight cannot overwrite each other. */
  update(id: string, change: (c: CaseRecord) => CaseRecord): Promise<void>
  remove(id: string): Promise<void>
  importText(text: string): Promise<{ added: number } | { error: string; code?: ImportErrorCode }>
  exportText(): string
}

export const CasesContext = createContext<CasesValue | null>(null)
