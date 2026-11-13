// Turns contract codes into sentences by lookup. Unknown codes get a readable fallback that still names the code.
import type { Action } from '../api/types'
import type { Messages } from './en'

export interface CopyPair {
  title: string
  detail: string
}
export interface DecisionCopy {
  label: string
  headline: string
  detail: string
}
export type RuleParams = { windowSeconds?: number; minRecipients?: number; minTransactions?: number }
export type GlossaryId = keyof Messages['glossary']

export interface Copy {
  decision(a: Action): DecisionCopy
  level(l: string | null): string
  jobStatus(s: string): string
  reason(code: string): CopyPair
  rule(id: string, params?: RuleParams): CopyPair
  evidence(type: string): string
  coverage(reason: string): string
  error(code: string): CopyPair
  gatewayOutcome(o: string): string
  gatewayOutcomeShort(o: string): string
  gatewayReason(r: string): string
  networkOutcome(o: string): string
  explanation(c: string): string
  /** A readable name for a protocol model version the Backend has registered; the version itself when unknown. */
  modelName(version: string): string
  dataType(d: string): string
  labelSource(s: string): string
  glossary(id: GlossaryId): { term: string; definition: string }
}

/** Fills `{name}` with params, and `{name|one|other}` with `one` when params.name is 1, else `other`. */
export function fill(template: string, params: Record<string, string | number | undefined>): string {
  return template
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, k: string, one: string, other: string) =>
      params[k] === undefined ? m : Number(params[k]) === 1 ? one : other,
    )
    .replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])))
}

export function createCopy(m: Messages): Copy {
  const unknown = (code: string): CopyPair => ({ title: m.ui.unknownCode.title, detail: fill(m.ui.unknownCode.detail, { code }) })
  const pick = <T,>(dict: Record<string, T>, code: string): T | undefined => (Object.hasOwn(dict, code) ? dict[code] : undefined)
  const sentence = (dict: Record<string, string>, code: string) => pick(dict, code) ?? unknown(code).detail

  return {
    decision: (a) => pick(m.decision, a) ?? { label: a, headline: unknown(a).title, detail: unknown(a).detail },
    level: (l) => (l === null ? '' : (pick<string>(m.level, l) ?? l)),
    jobStatus: (s) => pick<string>(m.jobStatus, s) ?? s,
    reason: (code) => pick(m.reason, code) ?? unknown(code),
    rule: (id, params = {}) => {
      const r = pick(m.rule, id)
      if (!r) return unknown(id)
      const filled = fill(r.detail, params)
      return { title: r.name, detail: /\{\w+\}/.test(filled) ? r.generic : filled }
    },
    evidence: (t) => sentence(m.evidence, t),
    coverage: (r) => sentence(m.coverage, r),
    error: (code) => pick(m.error, code) ?? unknown(code),
    gatewayOutcome: (o) => sentence(m.gateway.outcome, o),
    gatewayOutcomeShort: (o) => sentence(m.gateway.outcomeShort, o),
    gatewayReason: (r) => sentence(m.gateway.reason, r),
    networkOutcome: (o) => sentence(m.network.outcome, o),
    explanation: (c) => sentence(m.network.explanation, c),
    modelName: (v) => pick<string>(m.ui.sim.network.modelName, v) ?? v,
    dataType: (d) => sentence(m.dataType, d),
    labelSource: (s) => sentence(m.labelSource, s),
    glossary: (id) => m.glossary[id],
  }
}
