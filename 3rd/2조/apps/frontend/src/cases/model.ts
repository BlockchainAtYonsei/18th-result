// A case is one transfer screened over one or more runs. Each run keeps the API responses as a snapshot,
// so a case can be reopened after the Backend restarts (design doc §9).
import { ApiFailure, type FailureKind } from '../api/client'
import type {
  Asset,
  ComplianceRequest,
  ComplianceResponse,
  ConstellationScenario,
  ConstellationSimulationResult,
  GatewayExperimentResult,
  GatewayRoute,
  KYTAnalysisResult,
  Mode,
  NormalizedTransfer,
  Scope,
} from '../api/types'
import type { ApiMode } from '../app/apiMode'

export type RunStep = 'sender' | 'recipient' | 'policy'

export interface CaseParty {
  address: string
  fixtureId: string | null
}

export interface CaseInput {
  mode: Mode
  sender: CaseParty
  recipient: CaseParty
  asset: Asset
  amountRaw: string
  scope: Scope | null
  policyVersion: string
  rulesetVersion: string | null
}

export interface StoredError {
  kind: FailureKind | 'timeout'
  code: string
  message: string
  retryable: boolean
  status: number | null
  requestId: string | null
}

export interface AnalysisSnapshot {
  analysisId: string
  result: KYTAnalysisResult
  transfers: NormalizedTransfer[] | null
}

export interface GatewaySimRecord {
  key: string
  at: string
  route: GatewayRoute
  result: GatewayExperimentResult | null
  error: StoredError | null
}

export interface ConstellationSimRecord {
  key: string
  at: string
  batch: string
  purpose: 'compare' | 'sweep'
  version: string
  scenario: ConstellationScenario
  result: ConstellationSimulationResult | null
  error: StoredError | null
}

export interface CaseRun {
  runId: string
  startedAt: string
  finishedAt: string | null
  apiMode: ApiMode
  status: 'RUNNING' | 'DONE' | 'FAILED'
  failedStep: RunStep | null
  error: StoredError | null
  sender: AnalysisSnapshot | null
  recipient: AnalysisSnapshot | null
  complianceRequest: ComplianceRequest | null
  compliance: ComplianceResponse | null
  gateway: GatewaySimRecord[]
  constellation: ConstellationSimRecord[]
}

export interface CaseRecord {
  id: string
  createdAt: string
  createdBy: string
  input: CaseInput
  runs: CaseRun[]
}

export function toStoredError(e: unknown): StoredError {
  if (e instanceof ApiFailure) {
    return { kind: e.kind, code: e.code, message: e.message, retryable: e.retryable, status: e.status, requestId: e.requestId }
  }
  return {
    kind: 'network',
    code: 'NETWORK_ERROR',
    message: e instanceof Error ? e.message : String(e),
    retryable: true,
    status: null,
    requestId: null,
  }
}

const ID = /^CL-(\d+)$/

export function newCaseId(existing: Pick<CaseRecord, 'id'>[]): string {
  const max = existing.reduce((m, c) => {
    const n = ID.exec(c.id)
    return n ? (BigInt(n[1]) > m ? BigInt(n[1]) : m) : m
  }, 0n)
  return `CL-${String(max + 1n).padStart(4, '0')}`
}

export function latestRun(c: CaseRecord): CaseRun | null {
  return c.runs.reduce<CaseRun | null>((best, r) => (best === null || r.startedAt > best.startedAt ? r : best), null)
}

export function newKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * A run still marked RUNNING when the cases are loaded has no runner any more: the page was reloaded or closed.
 * Close it as failed and retryable so the case offers "Re-run" instead of spinning forever.
 */
export function closeInterruptedRuns(c: CaseRecord): CaseRecord {
  if (!c.runs.some((r) => r.status === 'RUNNING')) return c
  return {
    ...c,
    runs: c.runs.map((r): CaseRun =>
      r.status !== 'RUNNING'
        ? r
        : {
            ...r,
            status: 'FAILED',
            failedStep: !r.sender ? 'sender' : !r.recipient ? 'recipient' : 'policy',
            error: { kind: 'network', code: 'INTERRUPTED', message: '', retryable: true, status: null, requestId: null },
          },
    ),
  }
}
