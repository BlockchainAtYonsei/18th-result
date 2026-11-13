// Test helper: a case record assembled from contracts/fixtures or the demo scenarios (synthetic data).
import type { ComplianceResponse, KYTAnalysisResult, NormalizedTransfer } from '../api/types'
import { findScenario } from '../contracts/catalog'
import type { CaseRecord } from './model'

const files = {
  ...import.meta.glob<unknown>('@contracts/fixtures/**/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<unknown>('../../demo/fixtures/**/*.json', { eager: true, import: 'default' }),
}
export function fixtureJson<T>(path: string): T {
  const key = Object.keys(files).find((k) => k.endsWith(`/fixtures/${path}`))
  if (!key) throw new Error(`fixture missing: ${path}`)
  return structuredClone(files[key]) as T
}

export function fixtureCase(id: string, recipientFixture: string, senderFixture = 'sender'): CaseRecord {
  const s = findScenario(senderFixture)!.request
  const r = findScenario(recipientFixture)!.request
  const compliance = fixtureJson<ComplianceResponse>(`${recipientFixture}/public-policy-response.json`)
  const snap = (f: string) => fixtureJson<{ transfers: NormalizedTransfer[] }>(`${f}/snapshot.json`).transfers
  return {
    id,
    createdAt: '2026-11-11T00:00:00.000Z',
    createdBy: 'Tester',
    input: {
      mode: 'FIXTURE',
      sender: { address: s.address, fixtureId: senderFixture },
      recipient: { address: r.address, fixtureId: recipientFixture },
      asset: compliance.intent.asset,
      amountRaw: compliance.intent.amountRaw,
      scope: null,
      policyVersion: compliance.decision.policyVersion,
      rulesetVersion: null,
    },
    runs: [
      {
        runId: `${id}-run-1`,
        startedAt: '2026-11-11T00:00:00.000Z',
        finishedAt: '2026-11-11T00:00:05.000Z',
        apiMode: 'mock',
        status: 'DONE',
        failedStep: null,
        error: null,
        sender: { analysisId: `${senderFixture}-analysis`, result: fixtureJson<KYTAnalysisResult>(`${senderFixture}/analysis.json`), transfers: snap(senderFixture) },
        recipient: {
          analysisId: `${recipientFixture}-analysis`,
          result: fixtureJson<KYTAnalysisResult>(`${recipientFixture}/analysis.json`),
          transfers: snap(recipientFixture),
        },
        complianceRequest: fixtureJson(`${recipientFixture}/public-policy-request.json`),
        compliance,
        gateway: [],
        constellation: [],
      },
    ],
  }
}
