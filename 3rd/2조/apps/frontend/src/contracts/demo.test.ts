// The frontend's own demo scenarios (demo/fixtures): fuller wallets than the shared contract fixtures.
// Their results were recorded from the real engines, so every file must still satisfy the shared contract.
import { describe, expect, it } from 'vitest'
import { contractErrors, type ContractDef } from '../api/contract'
import type { KYTAnalysisResult, NormalizedTransfer } from '../api/types'
import { expectedDecision, fixtureScenarios } from './catalog'

const files = import.meta.glob<unknown>('../../demo/fixtures/**/*.json', { eager: true, import: 'default' })
const DEF: Record<string, ContractDef> = {
  'snapshot.json': 'collector/KYTDataSnapshot',
  'analysis-request.json': 'api/AnalysisRequest',
  'analysis.json': 'api/KYTAnalysisResult',
  'public-policy-request.json': 'api/ComplianceRequest',
  'public-policy-response.json': 'api/ComplianceResponse',
}
const DEMO = ['demo-layering', 'demo-burst', 'demo-busy-clean']

describe('demo scenarios', () => {
  it.each(Object.keys(files))('%s satisfies the shared contract', (path) => {
    const def = DEF[path.split('/').at(-1)!]
    expect(def, `no contract for ${path}`).toBeTruthy()
    expect(contractErrors(def, files[path])).toBeNull()
  })

  it('are offered right after the common sender, before the single-rule contract fixtures', () => {
    expect(fixtureScenarios.slice(0, 4).map((s) => s.fixtureId)).toEqual(['sender', ...DEMO])
  })

  it('carry the decision the real policy engine gave', () => {
    expect(DEMO.map((id) => expectedDecision(id))).toEqual(['REVIEW', 'WARN', 'ALLOW'])
  })

  it('cite only transfers that exist in the recorded snapshot', () => {
    for (const id of DEMO) {
      const find = (name: string) => files[Object.keys(files).find((k) => k.endsWith(`/${id}/${name}`))!]
      const transfers = (find('snapshot.json') as { transfers: NormalizedTransfer[] }).transfers.map((t) => t.id)
      const cited = (find('analysis.json') as KYTAnalysisResult).evaluation!.evidences.flatMap((e) => e.transferIds)
      expect(cited.every((t) => transfers.includes(t))).toBe(true)
    }
    const layering = files[Object.keys(files).find((k) => k.endsWith('/demo-layering/analysis.json'))!] as KYTAnalysisResult
    expect(layering.evaluation!.evidences.map((e) => e.type).sort()).toEqual(['DIRECT_FLOW', 'TEMPORAL_PATTERN'])
  })
})
