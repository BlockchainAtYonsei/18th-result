// Runs one case in order: both wallet analyses (polled to a final state), then the policy decision.
// Only Public API calls in sequence; no rule is evaluated here (design doc §6.3).
import type { ApiClient } from '../api/client'
import type { AnalysisRequest, ComplianceRequest, KYTAnalysisResult } from '../api/types'
import type { ApiMode } from '../app/apiMode'
import { newKey, toStoredError, type AnalysisSnapshot, type CaseInput, type CaseParty, type CaseRun, type RunStep, type StoredError } from '../cases/model'
import { findScenario } from '../contracts/catalog'
import { newIntentId, nowUtcSeconds } from '../lib/format'

export type StepState = 'pending' | 'running' | 'done' | 'failed'
export interface RunProgress {
  sender: StepState
  recipient: StepState
  policy: StepState
}
export interface RunCaseOptions {
  pollIntervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  apiMode: ApiMode
}

const TERMINAL = new Set(['COMPLETED', 'PARTIAL', 'FAILED'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function buildAnalysisRequest(party: CaseParty, input: CaseInput): AnalysisRequest {
  if (input.mode === 'FIXTURE' && party.fixtureId) {
    const scenario = findScenario(party.fixtureId)
    if (scenario) return input.rulesetVersion ? { ...scenario.request, rulesetVersion: input.rulesetVersion } : scenario.request
  }
  return {
    address: party.address,
    network: 'mainnet-beta',
    mode: 'LIVE',
    scope: input.scope ?? { fromTime: '1970-01-01T00:00:00Z', toTime: nowUtcSeconds(), maxTransactions: 100 },
    ...(input.rulesetVersion ? { rulesetVersion: input.rulesetVersion } : {}),
  }
}

type Waited = { ok: true; result: KYTAnalysisResult } | { ok: false; error: StoredError }

async function waitForAnalysis(api: ApiClient, id: string, poll: number, timeout: number, signal?: AbortSignal): Promise<Waited> {
  const started = Date.now()
  for (;;) {
    if (signal?.aborted) return { ok: false, error: { kind: 'network', code: 'NETWORK_ERROR', message: 'Cancelled.', retryable: true, status: null, requestId: null } }
    try {
      const r = await api.getAnalysis(id)
      if (TERMINAL.has(r.data.status)) return { ok: true, result: r.data }
    } catch (e) {
      const err = toStoredError(e)
      if (!err.retryable) return { ok: false, error: err }
    }
    if (Date.now() - started > timeout) {
      return {
        ok: false,
        error: { kind: 'timeout', code: 'TIMEOUT', message: `Analysis ${id} did not finish within ${Math.round(timeout / 1000)} s.`, retryable: true, status: null, requestId: null },
      }
    }
    await sleep(poll)
  }
}

function jobError(result: KYTAnalysisResult): StoredError {
  const e = result.error
  return {
    kind: 'http',
    code: e?.code ?? 'INTERNAL_ERROR',
    message: e?.message ?? 'The analysis failed.',
    retryable: e?.retryable ?? false,
    status: null,
    requestId: result.requestId,
  }
}

export async function runCase(
  api: ApiClient,
  input: CaseInput,
  onProgress: (p: RunProgress, run: CaseRun) => void,
  opts: RunCaseOptions,
): Promise<CaseRun> {
  const poll = opts.pollIntervalMs ?? 700
  const timeout = opts.timeoutMs ?? 60_000
  const progress: RunProgress = { sender: 'pending', recipient: 'pending', policy: 'pending' }
  const run: CaseRun = {
    runId: newKey('run'),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    apiMode: opts.apiMode,
    status: 'RUNNING',
    failedStep: null,
    error: null,
    sender: null,
    recipient: null,
    complianceRequest: null,
    compliance: null,
    gateway: [],
    constellation: [],
  }
  const emit = () => onProgress({ ...progress }, structuredClone(run))
  const fail = (step: RunStep, error: StoredError): CaseRun => {
    // The run stops here, so a step that was running beside it is no longer being worked on.
    for (const s of ['sender', 'recipient', 'policy'] as const) if (progress[s] === 'running') progress[s] = 'pending'
    progress[step] = 'failed'
    run.status = 'FAILED'
    run.failedStep = step
    run.error = error
    run.finishedAt = new Date().toISOString()
    emit()
    return run
  }

  const same = input.sender.address === input.recipient.address
  progress.sender = 'running'
  progress.recipient = 'running'
  emit()

  // Start both analyses together. The Backend wants one analysis when both sides are the same wallet.
  const [sCreated, rCreated] = await Promise.allSettled([
    api.createAnalysis(buildAnalysisRequest(input.sender, input)),
    same ? Promise.resolve(null) : api.createAnalysis(buildAnalysisRequest(input.recipient, input)),
  ])
  if (sCreated.status === 'rejected') return fail('sender', toStoredError(sCreated.reason))
  if (rCreated.status === 'rejected') return fail('recipient', toStoredError(rCreated.reason))
  const senderId = sCreated.value.data.analysisId
  const recipientId = rCreated.value ? rCreated.value.data.analysisId : senderId

  const [sWait, rWait] = await Promise.all([
    waitForAnalysis(api, senderId, poll, timeout, opts.signal),
    same ? Promise.resolve(null) : waitForAnalysis(api, recipientId, poll, timeout, opts.signal),
  ])

  const snapshot = async (id: string, result: KYTAnalysisResult): Promise<AnalysisSnapshot> => {
    let transfers: AnalysisSnapshot['transfers'] = null
    try {
      transfers = (await api.getTransfers(id, { limit: 1000 })).data.items
    } catch {
      transfers = null // the analysis itself is still usable without the transfer list
    }
    return { analysisId: id, result, transfers }
  }

  for (const [step, waited, id] of [
    ['sender', sWait, senderId],
    ['recipient', rWait ?? sWait, recipientId],
  ] as const) {
    if (!waited.ok) return fail(step, waited.error)
    if (waited.result.status === 'FAILED') return fail(step, jobError(waited.result))
    const snap = step === 'recipient' && same && run.sender ? run.sender : await snapshot(id, waited.result)
    run[step] = snap
    progress[step] = 'done'
    emit()
  }

  progress.policy = 'running'
  emit()
  const request: ComplianceRequest = {
    intent: {
      intentId: newIntentId(),
      network: 'mainnet-beta',
      sender: input.sender.address,
      recipient: input.recipient.address,
      asset: input.asset,
      amountRaw: input.amountRaw,
      requestedAt: nowUtcSeconds(),
    },
    senderAnalysisId: senderId,
    recipientAnalysisId: recipientId,
    policyVersion: input.policyVersion,
  }
  run.complianceRequest = request
  try {
    run.compliance = (await api.evaluateCompliance(request)).data
  } catch (e) {
    return fail('policy', toStoredError(e))
  }
  progress.policy = 'done'
  run.status = 'DONE'
  run.finishedAt = new Date().toISOString()
  emit()
  return run
}
