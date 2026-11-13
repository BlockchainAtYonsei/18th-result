import { describe, expect, it } from 'vitest'
import { contractErrors, schemaFileCount, type ContractDef } from './contract'

const fixtures = import.meta.glob<unknown>('@contracts/fixtures/**/*.json', { eager: true, import: 'default' })
const manifest = import.meta.glob<{ fixtures: { path: string; schema: string }[] }>(
  '@contracts/fixtures/manifest.json',
  { eager: true, import: 'default' },
)

function fixture(path: string): unknown {
  const key = Object.keys(fixtures).find((k) => k.endsWith(`/fixtures/${path}`))
  if (!key) throw new Error(`fixture 없음: ${path}`)
  return fixtures[key]
}

function defFromManifest(schema: string): ContractDef {
  // "../schemas/api.schema.json#/$defs/AnalysisRequest" → "api/AnalysisRequest"
  const m = schema.match(/schemas\/(\w+)\.schema\.json#\/\$defs\/(\w+)$/)
  if (!m) throw new Error(`알 수 없는 스키마 참조: ${schema}`)
  return `${m[1]}/${m[2]}` as ContractDef
}

describe('contract validation', () => {
  it('loads every schema file from contracts/', () => {
    expect(schemaFileCount()).toBe(6)
  })

  const entries = Object.values(manifest)[0].fixtures
  it.each(entries.map((e) => [e.path, e.schema]))('fixture %s passes %s', (path, schema) => {
    expect(contractErrors(defFromManifest(schema), fixture(path))).toBeNull()
  })

  it('rejects a COMPLETED analysis whose riskScore is null', () => {
    const analysis = structuredClone(fixture('sanctioned/analysis.json')) as {
      evaluation: { riskScore: number | null; riskLevel: string | null }
    }
    analysis.evaluation.riskScore = null
    analysis.evaluation.riskLevel = null
    expect(contractErrors('api/KYTAnalysisResult', analysis)).not.toBeNull()
  })

  it('rejects an unknown enum value', () => {
    const result = { ...(fixture('gateway/block-result.json') as object), outcome: 'SUBMITTED' }
    expect(contractErrors('experiment/GatewayExperimentResult', result)).not.toBeNull()
  })
})
