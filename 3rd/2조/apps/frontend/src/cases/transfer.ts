// Moving cases between browsers as a JSON file, e.g. to prepare the demo laptop (design doc §9).
import { newCaseId, type CaseRecord } from './model'
import { validateCaseRecord } from './store'

export type ImportErrorCode = 'INVALID_JSON' | 'INVALID_FILE' | 'INVALID_FORMAT' | 'UNSUPPORTED_VERSION' | 'MISSING_CASES' | 'INVALID_RECORD' | 'SAVE_FAILED' | 'READ_FAILED'

const FORMAT = 'scl-cases'
const VERSION = 1

export function exportCases(records: CaseRecord[]): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), cases: records }, null, 2)
}

export function parseCaseExport(text: string): { ok: true; cases: CaseRecord[] } | { ok: false; error: string; code: ImportErrorCode } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, code: 'INVALID_JSON', error: 'The file is not JSON.' }
  }
  if (data === null || typeof data !== 'object') return { ok: false, code: 'INVALID_FILE', error: 'The file is not a case export.' }
  const d = data as { format?: unknown; version?: unknown; cases?: unknown }
  if (d.format !== FORMAT) return { ok: false, code: 'INVALID_FORMAT', error: 'The file is not a Compliance Lab case export.' }
  if (d.version !== VERSION) return { ok: false, code: 'UNSUPPORTED_VERSION', error: `Unsupported export version ${String(d.version)}.` }
  if (!Array.isArray(d.cases)) return { ok: false, code: 'MISSING_CASES', error: 'The file has no case list.' }
  for (const c of d.cases) {
    const errs = validateCaseRecord(c)
    if (errs.length > 0) return { ok: false, code: 'INVALID_RECORD', error: `A case could not be read: ${errs[0]}` }
  }
  return { ok: true, cases: d.cases as CaseRecord[] }
}

/** Imported cases keep their content; an id that is already taken gets the next free id. */
export function mergeImported(existing: CaseRecord[], incoming: CaseRecord[]): CaseRecord[] {
  const out = [...existing]
  for (const c of incoming) {
    const taken = out.some((x) => x.id === c.id)
    out.push(taken ? { ...c, id: newCaseId(out) } : c)
  }
  return out
}
