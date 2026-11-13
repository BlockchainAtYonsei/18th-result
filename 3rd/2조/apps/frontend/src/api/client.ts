// Backend Public API 클라이언트. 내부(Internal) 경로는 호출하지 않는다.
// 모든 응답은 공통 계약 스키마로 검증하며, 위반하면 결과로 표시하지 않고 ApiFailure로 올린다.
import type { CaseRecord } from '../cases/model'
import { contractErrors, type ContractDef } from './contract'
import type {
  AnalysisAccepted,
  AnalysisRequest,
  ComplianceRequest,
  ComplianceResponse,
  ConstellationRequest,
  ConstellationSimulationResult,
  ErrorResponse,
  ExperimentRecord,
  ExperimentPage,
  GatewayExperimentResult,
  GatewayRequest,
  KYTAnalysisResult,
  TransferPage,
} from './types'

export type FailureKind =
  /** Backend가 구조화된 오류를 돌려줌 */
  | 'http'
  /** 응답이 계약을 위반함 */
  | 'contract'
  /** Backend에 닿지 못함 */
  | 'network'
  /** 보내려는 요청이 계약을 위반함 */
  | 'request'

export class ApiFailure extends Error {
  readonly kind: FailureKind
  readonly status: number | null
  readonly code: string
  readonly retryable: boolean
  readonly requestId: string | null
  readonly details: string[]

  constructor(init: {
    kind: FailureKind
    message: string
    code: string
    retryable: boolean
    status?: number | null
    requestId?: string | null
    details?: string[]
  }) {
    super(init.message)
    this.name = 'ApiFailure'
    this.kind = init.kind
    this.status = init.status ?? null
    this.code = init.code
    this.retryable = init.retryable
    this.requestId = init.requestId ?? null
    this.details = init.details ?? []
  }
}

export interface ApiResult<T> {
  data: T
  requestId: string | null
  location: string | null
}

export interface ApiClientOptions {
  /** 비우면 같은 출처의 /api를 호출한다(dev 서버 proxy 또는 MSW). */
  baseUrl?: string
}

function newRequestId(): string {
  return `fe-${crypto.randomUUID()}`
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')

  async function call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { body?: unknown; bodyDef?: ContractDef; responseDef: ContractDef },
  ): Promise<ApiResult<T>> {
    if (opts.body !== undefined && opts.bodyDef) {
      const errors = contractErrors(opts.bodyDef, opts.body)
      if (errors) {
        throw new ApiFailure({
          kind: 'request',
          code: 'CONTRACT_VALIDATION_FAILED',
          message: 'The request does not match the shared contract, so it was not sent.',
          retryable: false,
          details: errors,
        })
      }
    }

    const sentRequestId = newRequestId()
    let res: Response
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-Request-ID': sentRequestId,
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    } catch (e) {
      throw new ApiFailure({
        kind: 'network',
        code: 'NETWORK_ERROR',
        message: `No response from the backend (${e instanceof Error ? e.message : String(e)}).`,
        retryable: true,
        requestId: sentRequestId,
      })
    }

    const requestId = res.headers.get('X-Request-ID') ?? sentRequestId
    const text = await res.text()
    let json: unknown = undefined
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }

    if (!res.ok) {
      if (json !== undefined && contractErrors('common/ErrorResponse', json) === null) {
        const body = json as ErrorResponse
        throw new ApiFailure({
          kind: 'http',
          status: res.status,
          code: body.error.code,
          message: body.error.message,
          retryable: body.error.retryable,
          requestId: body.requestId,
        })
      }
      // A gateway status without the contract body comes from something in front of the Backend
      // (the dev proxy, a load balancer) that could not get an answer from it.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new ApiFailure({
          kind: 'network',
          status: res.status,
          code: 'NETWORK_ERROR',
          message: `HTTP ${res.status} from a proxy in front of the backend.`,
          retryable: true,
          requestId,
          details: text ? [text.slice(0, 500)] : [],
        })
      }
      throw new ApiFailure({
        kind: 'http',
        status: res.status,
        code: 'UNSTRUCTURED_ERROR',
        message: `HTTP ${res.status} without the agreed error format${text ? `: ${text.slice(0, 200)}` : '.'}`,
        retryable: res.status >= 500,
        requestId,
        details: text ? [text.slice(0, 500)] : [],
      })
    }

    const errors = contractErrors(opts.responseDef, json)
    if (errors) {
      throw new ApiFailure({
        kind: 'contract',
        status: res.status,
        code: 'RESPONSE_CONTRACT_VIOLATION',
        message: `The response does not match the shared contract (${opts.responseDef}).`,
        retryable: false,
        requestId,
        details: errors,
      })
    }
    return { data: json as T, requestId, location: res.headers.get('Location') }
  }

  /** 요청과 응답의 연결 관계(같은 ID인지)만 확인한다. 값의 의미는 판단하지 않는다. */
  function linked(ok: boolean, what: string, requestId: string | null) {
    if (!ok) {
      throw new ApiFailure({
        kind: 'contract',
        code: 'RESPONSE_LINK_MISMATCH',
        message: `The response ${what} differs from the request.`,
        retryable: false,
        requestId,
      })
    }
  }

  return {
    async listCases(cursor?: string) {
      return call<CasePage>('GET', `/api/v1/cases${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { responseDef: 'api/CasePage' })
    },
    async getCase(id: string) {
      const r = await call<CaseDocument>('GET', `/api/v1/cases/${encodeURIComponent(id)}`, { responseDef: 'api/CaseDocument' })
      linked(r.data.case.id === id, 'case.id', r.requestId)
      return r
    },
    async saveCase(record: CaseRecord, expectedRevision: number) {
      const r = await call<CaseDocument>('PUT', `/api/v1/cases/${encodeURIComponent(record.id)}`, {
        body: { schemaVersion: '0.1.0', expectedRevision, case: record }, bodyDef: 'api/CaseWrite', responseDef: 'api/CaseDocument',
      })
      linked(r.data.case.id === record.id && r.data.revision === expectedRevision + 1, 'case revision', r.requestId)
      return r
    },
    async deleteCase(id: string, revision: number) {
      const r = await call<{ schemaVersion: string; caseId: string; deleted: true }>('DELETE', `/api/v1/cases/${encodeURIComponent(id)}?revision=${revision}`, { responseDef: 'api/CaseDeleted' })
      linked(r.data.caseId === id, 'caseId', r.requestId)
      return r
    },
    async getExperiment(recordId: string) {
      const r = await call<ExperimentRecord>('GET', `/api/v1/experiments/${encodeURIComponent(recordId)}`, {
        responseDef: 'api/ExperimentRecord',
      })
      linked(r.data.recordId === recordId, 'recordId', r.requestId)
      return r
    },

    async listExperiments(params: { type?: ExperimentRecord['type']; intentId?: string; decisionId?: string; limit?: number; cursor?: string } = {}) {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
      const qs = query.toString()
      return call<ExperimentPage>('GET', `/api/v1/experiments${qs ? `?${qs}` : ''}`, { responseDef: 'api/ExperimentPage' })
    },

    async createAnalysis(body: AnalysisRequest) {
      const r = await call<AnalysisAccepted>('POST', '/api/v1/analyses', {
        body,
        bodyDef: 'api/AnalysisRequest',
        responseDef: 'api/AnalysisAccepted',
      })
      return r
    },

    async getAnalysis(analysisId: string) {
      const r = await call<KYTAnalysisResult>('GET', `/api/v1/analyses/${encodeURIComponent(analysisId)}`, {
        responseDef: 'api/KYTAnalysisResult',
      })
      linked(r.data.analysisId === analysisId, 'analysisId', r.requestId)
      return r
    },

    async getTransfers(analysisId: string, params: { limit?: number; cursor?: string | null } = {}) {
      const q = new URLSearchParams()
      if (params.limit !== undefined) q.set('limit', String(params.limit))
      if (params.cursor) q.set('cursor', params.cursor)
      const qs = q.toString()
      const r = await call<TransferPage>(
        'GET',
        `/api/v1/analyses/${encodeURIComponent(analysisId)}/transfers${qs ? `?${qs}` : ''}`,
        { responseDef: 'api/TransferPage' },
      )
      linked(r.data.analysisId === analysisId, 'analysisId', r.requestId)
      return r
    },

    async evaluateCompliance(body: ComplianceRequest) {
      const r = await call<ComplianceResponse>('POST', '/api/v1/compliance/evaluate', {
        body,
        bodyDef: 'api/ComplianceRequest',
        responseDef: 'api/ComplianceResponse',
      })
      linked(r.data.intent.intentId === body.intent.intentId, 'intentId', r.requestId)
      linked(r.data.decision.intentId === body.intent.intentId, 'decision.intentId', r.requestId)
      linked(r.data.decision.policyVersion === body.policyVersion, 'policyVersion', r.requestId)
      return r
    },

    async runGateway(body: GatewayRequest) {
      const r = await call<GatewayExperimentResult>('POST', '/api/v1/experiments/gateway', {
        body,
        bodyDef: 'api/GatewayRequest',
        responseDef: 'experiment/GatewayExperimentResult',
      })
      linked(r.data.intentId === body.intentId, 'intentId', r.requestId)
      linked(r.data.routeId === body.route.routeId, 'routeId', r.requestId)
      return r
    },

    async runConstellation(body: ConstellationRequest) {
      const r = await call<ConstellationSimulationResult>('POST', '/api/v1/experiments/constellation', {
        body,
        bodyDef: 'api/ConstellationRequest',
        responseDef: 'experiment/ConstellationSimulationResult',
      })
      linked(r.data.intentId === body.intentId, 'intentId', r.requestId)
      linked(r.data.protocolModelVersion === body.protocolModelVersion, 'protocolModelVersion', r.requestId)
      return r
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

export interface CaseDocument { schemaVersion: '0.1.0'; revision: number; case: CaseRecord }
export interface CasePage { schemaVersion: '0.1.0'; items: CaseDocument[]; nextCursor: string | null }
