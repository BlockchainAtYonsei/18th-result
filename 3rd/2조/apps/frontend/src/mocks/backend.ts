// Mock Backend: contracts/fixtures와 프론트의 데모 시나리오(demo/fixtures)를 Public API 형태로 돌려준다.
// 실제 Backend(apps/backend)를 대신하는 시연용이며, 위험도·정책·시뮬레이션을 계산하지 않는다.
// 응답은 모두 Fixture 파일을 고르고 ID·시각만 바꿔 끼운 것이다.
import { delay, http, HttpResponse } from 'msw'
import { contractErrors, type ContractDef } from '../api/contract'
import type {
  AnalysisRequest,
  ComplianceRequest,
  ComplianceResponse,
  ConstellationRequest,
  ConstellationSimulationResult,
  ErrorCode,
  GatewayExperimentResult,
  GatewayRequest,
  KYTAnalysisResult,
  NormalizedTransfer,
} from '../api/types'
import { protocolModels } from '../contracts/catalog'

interface KYTDataSnapshotLike {
  transfers: NormalizedTransfer[]
}

// contracts/fixtures plus the frontend's demo scenarios (demo/fixtures), whose answers were recorded from the real engines.
const fixtureFiles = {
  ...import.meta.glob<unknown>('@contracts/fixtures/**/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<unknown>('../../demo/fixtures/**/*.json', { eager: true, import: 'default' }),
}

function fixture<T>(path: string): T | undefined {
  const key = Object.keys(fixtureFiles).find((k) => k.endsWith(`/fixtures/${path}`))
  return key ? (structuredClone(fixtureFiles[key]) as T) : undefined
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

interface MockJob {
  analysisId: string
  requestId: string
  fixtureId: string | null
  request: AnalysisRequest
  createdAt: string
  polls: number
  final: KYTAnalysisResult
}

interface MockReview {
  intentId: string
  decisionId: string
  action: ComplianceResponse['decision']['action']
}

export interface MockBackendOptions {
  /** QUEUED로 응답할 조회 횟수 */
  queuedPolls?: number
  /** RUNNING으로 응답할 조회 횟수 */
  runningPolls?: number
  /** 모든 응답에 넣을 지연(ms) */
  latencyMs?: number
}

/** Where the mock keeps its state between page loads (localStorage in the browser, memory in tests). */
export interface MockStorage {
  load(): string | null
  save(json: string): void
}

export function localMockStorage(key = 'scl.mock.v1'): MockStorage {
  return {
    load: () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    save: (json) => {
      try {
        localStorage.setItem(key, json)
      } catch {
        // storage full or unavailable: the mock keeps working in memory
      }
    },
  }
}

interface MockState {
  jobs: MockJob[]
  reviews: MockReview[]
  seq: number
}

export function createMockBackend(options: MockBackendOptions & { storage?: MockStorage } = {}) {
  const queuedPolls = options.queuedPolls ?? 1
  const runningPolls = options.runningPolls ?? 1
  const latencyMs = options.latencyMs ?? 0

  const jobs = new Map<string, MockJob>()
  let reviews: MockReview[] = []
  let seq = 0
  const storage = options.storage

  try {
    const raw = storage?.load()
    if (raw) {
      const state = JSON.parse(raw) as MockState
      for (const job of state.jobs) jobs.set(job.analysisId, job)
      reviews = state.reviews
      seq = state.seq
    }
  } catch {
    // unreadable saved state: start empty
  }

  function persist() {
    storage?.save(JSON.stringify({ jobs: [...jobs.values()], reviews, seq } satisfies MockState))
  }

  const next = (prefix: string) => `${prefix}-${++seq}`

  function reqId(request: Request): string {
    return request.headers.get('X-Request-ID') || next('mock-request')
  }

  async function respond(body: unknown, status: number, requestId: string, headers: Record<string, string> = {}) {
    if (latencyMs > 0) await delay(latencyMs)
    return HttpResponse.json(body as never, { status, headers: { 'X-Request-ID': requestId, ...headers } })
  }

  function fail(status: number, code: ErrorCode, message: string, retryable: boolean, requestId: string) {
    return respond({ error: { code, message, retryable }, requestId }, status, requestId)
  }

  async function readBody(request: Request, def: ContractDef, requestId: string) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return { error: await fail(400, 'INVALID_REQUEST', '[Mock] The JSON body could not be read.', false, requestId) }
    }
    const errors = contractErrors(def, body)
    if (errors) {
      return {
        error: await fail(400, 'CONTRACT_VALIDATION_FAILED', `[Mock] ${errors.slice(0, 3).join('; ')}`, false, requestId),
      }
    }
    return { body }
  }

  function failedResult(job: Omit<MockJob, 'final'>, code: ErrorCode, message: string, retryable: boolean) {
    return {
      ...pendingResult(job, 'FAILED'),
      error: { code, message, retryable },
    } satisfies KYTAnalysisResult
  }

  function pendingResult(job: Omit<MockJob, 'final'>, status: 'QUEUED' | 'RUNNING' | 'FAILED'): KYTAnalysisResult {
    return {
      schemaVersion: '0.1.0',
      analysisId: job.analysisId,
      requestId: job.requestId,
      status,
      address: job.request.address,
      network: job.request.network,
      mode: job.request.mode,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
      snapshotId: null,
      coverage: null,
      dataProvenance: null,
      evaluation: null,
      error: null,
    }
  }

  /** 수집·분석 결과를 Fixture에서 고른다. 실제 Backend에서 비동기 작업 중 실패하는 경우는 FAILED로 둔다. */
  function finalResult(job: Omit<MockJob, 'final'>): KYTAnalysisResult {
    const { request } = job
    if (request.mode === 'LIVE') {
      return failedResult(job, 'UPSTREAM_UNAVAILABLE', '[Mock] There is no collector, so live on-chain data cannot be fetched.', true)
    }
    const fixtureId = request.fixtureId ?? ''
    const analysis = fixture<KYTAnalysisResult>(`${fixtureId}/analysis.json`)
    if (!analysis) {
      return failedResult(job, 'NOT_FOUND', `[Mock] fixture not found: ${fixtureId}`, false)
    }
    if (analysis.address !== request.address) {
      return failedResult(job, 'INVALID_REQUEST', `[Mock] fixture ${fixtureId} is for address ${analysis.address}`, false)
    }
    if (request.rulesetVersion && analysis.evaluation && analysis.evaluation.rulesetVersion !== request.rulesetVersion) {
      return failedResult(job, 'UNSUPPORTED_VERSION', `[Mock] The fixture only has ruleset ${analysis.evaluation.rulesetVersion}.`, false)
    }
    const at = nowIso()
    return { ...analysis, analysisId: job.analysisId, requestId: job.requestId, createdAt: job.createdAt, updatedAt: at }
  }

  function currentResult(job: MockJob): KYTAnalysisResult {
    if (job.polls <= queuedPolls) return pendingResult(job, 'QUEUED')
    if (job.polls <= queuedPolls + runningPolls) return { ...pendingResult(job, 'RUNNING'), updatedAt: nowIso() }
    return job.final
  }

  function isFinal(job: MockJob) {
    return job.polls > queuedPolls + runningPolls
  }

  const handlers = [
    http.post('*/api/v1/analyses', async ({ request }) => {
      const requestId = reqId(request)
      const parsed = await readBody(request, 'api/AnalysisRequest', requestId)
      if (parsed.error) return parsed.error
      const body = parsed.body as AnalysisRequest
      const base = {
        analysisId: next(`${body.fixtureId ?? 'live'}-analysis`),
        requestId,
        fixtureId: body.fixtureId ?? null,
        request: body,
        createdAt: nowIso(),
        polls: 0,
      }
      const job: MockJob = { ...base, final: finalResult(base) }
      jobs.set(job.analysisId, job)
      persist()
      return respond({ schemaVersion: '0.1.0', analysisId: job.analysisId, requestId, status: 'QUEUED' }, 202, requestId, {
        Location: `/api/v1/analyses/${job.analysisId}`,
      })
    }),

    http.get('*/api/v1/analyses/:id', async ({ request, params }) => {
      const requestId = reqId(request)
      const job = jobs.get(String(params.id))
      if (!job) return fail(404, 'NOT_FOUND', `[Mock] analysis not found: ${params.id}`, false, requestId)
      job.polls += 1
      persist()
      return respond(currentResult(job), 200, requestId)
    }),

    http.get('*/api/v1/analyses/:id/transfers', async ({ request, params }) => {
      const requestId = reqId(request)
      const job = jobs.get(String(params.id))
      if (!job) return fail(404, 'NOT_FOUND', `[Mock] analysis not found: ${params.id}`, false, requestId)
      if (!isFinal(job) || job.final.status === 'FAILED') {
        const retryable = !isFinal(job)
        return fail(409, 'ANALYSIS_NOT_READY', `[Mock] analysis is ${currentResult(job).status}`, retryable, requestId)
      }
      const url = new URL(request.url)
      const limitParam = url.searchParams.get('limit')
      const limit = limitParam === null ? 100 : /^\d+$/.test(limitParam) ? Number(limitParam) : NaN
      if (!(limit >= 1 && limit <= 1000)) {
        return fail(400, 'INVALID_REQUEST', '[Mock] limit must be 1..1000', false, requestId)
      }
      const cursor = url.searchParams.get('cursor')
      const offset = cursor === null ? 0 : /^c\d+$/.test(cursor) ? Number(cursor.slice(1)) : NaN
      if (Number.isNaN(offset)) return fail(400, 'INVALID_REQUEST', '[Mock] invalid cursor', false, requestId)
      const snapshot = fixture<KYTDataSnapshotLike>(`${job.fixtureId}/snapshot.json`)
      const items = snapshot?.transfers ?? []
      const end = offset + limit
      return respond(
        {
          schemaVersion: '0.1.0',
          analysisId: job.analysisId,
          snapshotId: job.final.snapshotId,
          items: items.slice(offset, end),
          pagination: { limit, nextCursor: end < items.length ? `c${end}` : null },
        },
        200,
        requestId,
      )
    }),

    http.post('*/api/v1/compliance/evaluate', async ({ request }) => {
      const requestId = reqId(request)
      const parsed = await readBody(request, 'api/ComplianceRequest', requestId)
      if (parsed.error) return parsed.error
      const body = parsed.body as ComplianceRequest

      const sender = jobs.get(body.senderAnalysisId)
      const recipient = jobs.get(body.recipientAnalysisId)
      if (!sender || !recipient) {
        return fail(404, 'NOT_FOUND', '[Mock] senderAnalysisId or recipientAnalysisId was not found.', false, requestId)
      }
      for (const [role, job] of [['sender', sender], ['recipient', recipient]] as const) {
        const status = currentResult(job).status
        if (status !== 'COMPLETED' && status !== 'PARTIAL') {
          return fail(409, 'ANALYSIS_NOT_READY', `${role} analysis is ${status}`, status !== 'FAILED', requestId)
        }
      }
      if (sender.request.address !== body.intent.sender) {
        return fail(409, 'ASSESSMENT_MISMATCH', 'senderAnalysisId does not belong to intent.sender', false, requestId)
      }
      if (recipient.request.address !== body.intent.recipient) {
        return fail(409, 'ASSESSMENT_MISMATCH', 'recipientAnalysisId does not belong to intent.recipient', false, requestId)
      }
      if (body.intent.sender === body.intent.recipient && body.senderAnalysisId !== body.recipientAnalysisId) {
        return fail(409, 'ASSESSMENT_MISMATCH', 'sender and recipient are the same address; use the same analysis', false, requestId)
      }

      // 같은 송신자·수신자 Fixture 조합의 공개 정책 응답 Fixture를 찾는다.
      const pairs = Object.keys(fixtureFiles)
        .filter((k) => k.endsWith('/public-policy-request.json'))
        .map((k) => ({ key: k, req: structuredClone(fixtureFiles[k]) as ComplianceRequest | undefined }))
        .filter(
          (p) =>
            p.req &&
            p.req.senderAnalysisId === `${sender.fixtureId}-analysis` &&
            p.req.recipientAnalysisId === `${recipient.fixtureId}-analysis`,
        )
      const match = pairs.find((p) => p.req?.policyVersion === body.policyVersion)
      if (!match) {
        if (pairs.length > 0) {
          const versions = pairs.map((p) => p.req?.policyVersion).join(', ')
          return fail(422, 'UNSUPPORTED_VERSION', `[Mock] The policy fixture for this pair only has version ${versions}.`, false, requestId)
        }
        return fail(
          409,
          'CONFLICT',
          `[Mock] There is no policy fixture for sender ${sender.fixtureId ?? 'LIVE'} and recipient ${recipient.fixtureId ?? 'LIVE'}. Run this pair against the Backend.`,
          false,
          requestId,
        )
      }
      // the response sits next to its request (a demo scenario keeps one pair per policy version in sub-folders)
      const answerKey = match.key.replace(/public-policy-request\.json$/, 'public-policy-response.json')
      const answer = fixtureFiles[answerKey] ? (structuredClone(fixtureFiles[answerKey]) as ComplianceResponse) : undefined
      if (!answer) return fail(500, 'INTERNAL_ERROR', '[Mock] policy fixture missing', false, requestId)
      const decision = { ...answer.decision, intentId: body.intent.intentId, evaluatedAt: body.intent.requestedAt }
      reviews = reviews.filter((r) => !(r.intentId === decision.intentId && r.decisionId === decision.decisionId))
      reviews.push({ intentId: decision.intentId, decisionId: decision.decisionId, action: decision.action })
      persist()
      const response: ComplianceResponse = {
        schemaVersion: '0.1.0',
        requestId,
        intent: body.intent,
        assessments: { sender: sender.final.evaluation!, recipient: recipient.final.evaluation! },
        decision,
      }
      return respond(response, 200, requestId)
    }),

    http.post('*/api/v1/experiments/gateway', async ({ request }) => {
      const requestId = reqId(request)
      const parsed = await readBody(request, 'api/GatewayRequest', requestId)
      if (parsed.error) return parsed.error
      const body = parsed.body as GatewayRequest
      const review = reviews.find((r) => r.intentId === body.intentId && r.decisionId === body.decisionId)
      if (!review) return fail(404, 'NOT_FOUND', '[Mock] No saved decision was found.', false, requestId)

      // contracts/semantics.md의 Gateway 결정 표에 맞춰 이미 만들어 둔 결과 Fixture를 고른다.
      const name = !body.route.policyEnforced
        ? 'alternative-path'
        : review.action === 'ALLOW'
          ? 'allow'
          : review.action === 'BLOCK'
            ? 'block'
            : review.action === 'REVIEW'
              ? 'review'
              : body.route.warningAcknowledged
                ? 'warning-acknowledged'
                : 'warning-unacknowledged'
      const result = fixture<GatewayExperimentResult>(`gateway/${name}-result.json`)
      if (!result) return fail(500, 'INTERNAL_ERROR', '[Mock] gateway fixture missing', false, requestId)
      return respond(
        { ...result, experimentId: next('mock-experiment'), intentId: body.intentId, routeId: body.route.routeId },
        200,
        requestId,
      )
    }),

    http.post('*/api/v1/experiments/constellation', async ({ request }) => {
      const requestId = reqId(request)
      const parsed = await readBody(request, 'api/ConstellationRequest', requestId)
      if (parsed.error) return parsed.error
      const body = parsed.body as ConstellationRequest
      const review = reviews.find((r) => r.intentId === body.intentId && r.decisionId === body.decisionId)
      if (!review) return fail(404, 'NOT_FOUND', '[Mock] No saved decision was found.', false, requestId)
      if (body.protocolModelVersion !== protocolModels.mockVersion) {
        return fail(
          422,
          'UNSUPPORTED_VERSION',
          `[Mock] The Mock does not execute research rules. It only returns a placeholder result for ${protocolModels.mockVersion}.`,
          false,
          requestId,
        )
      }
      const result = fixture<ConstellationSimulationResult>('constellation/mock-result.json')
      if (!result) return fail(500, 'INTERNAL_ERROR', '[Mock] constellation fixture missing', false, requestId)
      return respond({ ...result, simulationId: next('mock-simulation'), intentId: body.intentId }, 200, requestId)
    }),
  ]

  return {
    handlers,
    reset() {
      jobs.clear()
      reviews = []
      seq = 0
      persist()
    },
  }
}
