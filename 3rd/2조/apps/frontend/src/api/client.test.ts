import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiFailure, createApiClient } from './client'
import record from '../../../../contracts/fixtures/api/experiment-gateway-record.json'

const server = setupServer()
const api = createApiClient({ baseUrl: 'http://localhost' })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function failureOf(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiFailure) return e
    throw e
  }
  throw new Error('expected the call to fail')
}

describe('api client failures', () => {
  it('reports a proxy 502 without the contract error body as an unreachable Backend', async () => {
    server.use(http.get('*/api/v1/analyses/:id', () => new HttpResponse('', { status: 502, headers: { 'Content-Type': 'text/plain' } })))
    const f = await failureOf(api.getAnalysis('analysis-1'))
    expect(f.code).toBe('NETWORK_ERROR')
    expect(f.kind).toBe('network')
    expect(f.status).toBe(502)
    expect(f.retryable).toBe(true)
  })

  it('keeps any other status without the contract error body as an unstructured error', async () => {
    server.use(http.get('*/api/v1/analyses/:id', () => new HttpResponse('Invalid CORS request', { status: 403 })))
    const f = await failureOf(api.getAnalysis('analysis-1'))
    expect(f.code).toBe('UNSTRUCTURED_ERROR')
    expect(f.details).toEqual(['Invalid CORS request'])
    // the error box shows `message`, not `details`, so the raw text has to be in the message
    expect(f.message).toContain('Invalid CORS request')
  })
})


describe('stored experiment API', () => {
  it('retrieves an audit record and a filtered page through shared contract validation', async () => {
    server.use(
      http.get('*/api/v1/experiments/:id', () => HttpResponse.json(record)),
      http.get('*/api/v1/experiments', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('decisionId')).toBe(record.decisionId)
        expect(url.searchParams.get('limit')).toBe('1')
        return HttpResponse.json({ schemaVersion: '0.1.0', items: [record], pagination: { limit: 1, nextCursor: null } })
      }),
    )
    expect((await api.getExperiment(record.recordId)).data.result).toEqual(record.result)
    expect((await api.listExperiments({ decisionId: record.decisionId, limit: 1 })).data.items).toHaveLength(1)
  })

  it('rejects a stored record for a different requested ID', async () => {
    server.use(http.get('*/api/v1/experiments/:id', () => HttpResponse.json(record)))
    expect((await failureOf(api.getExperiment('other-record'))).code).toBe('RESPONSE_LINK_MISMATCH')
  })
})

describe('server case API', () => {
  it('sends shared case contracts and validates the returned revision', async () => {
    const { fixtureCase } = await import('../cases/testCases')
    const c = fixtureCase('CL-0001', 'sanctioned')
    const document = { schemaVersion: '0.1.0', revision: 1, case: c }
    let writes = 0
    server.use(
      http.put('*/api/v1/cases/:id', async ({ request }) => {
        expect(await request.json()).toEqual({ schemaVersion: '0.1.0', expectedRevision: writes++, case: c })
        return HttpResponse.json(document)
      }),
      http.get('*/api/v1/cases/:id', () => HttpResponse.json(document)),
      http.get('*/api/v1/cases', () => HttpResponse.json({ schemaVersion: '0.1.0', items: [document], nextCursor: null })),
      http.delete('*/api/v1/cases/:id', ({ request }) => {
        expect(new URL(request.url).searchParams.get('revision')).toBe('1')
        return HttpResponse.json({ schemaVersion: '0.1.0', caseId: c.id, deleted: true })
      }),
    )
    expect((await api.saveCase(c, 0)).data.revision).toBe(1)
    expect((await api.getCase(c.id)).data.case).toEqual(c)
    expect((await api.listCases()).data.items).toHaveLength(1)
    expect((await api.deleteCase(c.id, 1)).data.deleted).toBe(true)
    expect((await failureOf(api.saveCase(c, 1))).code).toBe('RESPONSE_LINK_MISMATCH')
  })
})
