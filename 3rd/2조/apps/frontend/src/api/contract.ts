// 공통 계약의 JSON Schema(2020-12)로 요청·응답을 검증한다.
// 스키마 파일은 contracts/schemas/를 빌드 시점에 그대로 가져오므로, 계약이 바뀌면 검증도 같이 바뀐다.
import Ajv2020 from 'ajv/dist/2020'
import type { ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

const schemaFiles = import.meta.glob<Record<string, unknown>>('@contracts/schemas/*.schema.json', {
  eager: true,
  import: 'default',
})

export const SCHEMA_BASE = 'https://baypeline.github.io/solana-compliance-lab/contracts/schemas/'

export type SchemaFile = 'common' | 'api' | 'experiment' | 'kyt' | 'policy' | 'collector'
/** 예: 'api/KYTAnalysisResult' → api.schema.json#/$defs/KYTAnalysisResult */
export type ContractDef = `${SchemaFile}/${string}`

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
for (const schema of Object.values(schemaFiles)) {
  ajv.addSchema(schema)
}

const validators = new Map<ContractDef, ValidateFunction>()

function validatorFor(def: ContractDef): ValidateFunction {
  let validate = validators.get(def)
  if (!validate) {
    const [file, name] = def.split('/')
    const ref = `${SCHEMA_BASE}${file}.schema.json#/$defs/${name}`
    validate = ajv.getSchema(ref)
    if (!validate) {
      throw new Error(`Contract schema not found: ${ref}`)
    }
    validators.set(def, validate)
  }
  return validate
}

/** 계약 위반이면 사람이 읽을 수 있는 오류 목록을, 통과하면 null을 돌려준다. */
export function contractErrors(def: ContractDef, data: unknown): string[] | null {
  const validate = validatorFor(def)
  if (validate(data)) return null
  return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
}

export function schemaFileCount(): number {
  return Object.keys(schemaFiles).length
}
