// Gateway and Constellation simulations for a finished run (design doc §6.5).
// Calls carry only the run's intentId and decisionId; the Backend looks up the stored decision.
import type { ApiClient } from '../api/client'
import type { Action, ConstellationScenario, GatewayRoute } from '../api/types'
import { newKey, toStoredError, type CaseRun, type ConstellationSimRecord, type GatewaySimRecord, type StoredError } from '../cases/model'

function ids(run: CaseRun) {
  if (!run.compliance) throw new Error('This run has no policy decision to simulate.')
  return { intentId: run.compliance.intent.intentId, decisionId: run.compliance.decision.decisionId }
}

/** The routes worth comparing. The acknowledged route only matters for a Warn (contract Gateway table). */
export function gatewayRoutesFor(action: Action): GatewayRoute[] {
  return [
    { routeId: 'enforced', policyEnforced: true, warningAcknowledged: false },
    ...(action === 'WARN' ? [{ routeId: 'enforced-acknowledged', policyEnforced: true, warningAcknowledged: true }] : []),
    { routeId: 'not-enforced', policyEnforced: false, warningAcknowledged: false },
  ]
}

export async function runGatewaySet(api: ApiClient, run: CaseRun): Promise<GatewaySimRecord[]> {
  const { intentId, decisionId } = ids(run)
  const routes = gatewayRoutesFor(run.compliance!.decision.action)
  return Promise.all(
    routes.map(async (route): Promise<GatewaySimRecord> => {
      const base = { key: newKey('gw'), at: new Date().toISOString(), route }
      try {
        return { ...base, result: (await api.runGateway({ intentId, decisionId, route })).data, error: null }
      } catch (e) {
        return { ...base, result: null, error: toStoredError(e) }
      }
    }),
  )
}

async function simulate(
  api: ApiClient,
  run: CaseRun,
  batch: string,
  purpose: ConstellationSimRecord['purpose'],
  version: string,
  scenario: ConstellationScenario,
): Promise<ConstellationSimRecord> {
  const { intentId, decisionId } = ids(run)
  const base = { key: newKey('cs'), at: new Date().toISOString(), batch, purpose, version, scenario }
  try {
    return { ...base, result: (await api.runConstellation({ intentId, decisionId, protocolModelVersion: version, scenario })).data, error: null }
  } catch (e) {
    return { ...base, result: null, error: toStoredError(e) }
  }
}

export function runConstellationCompare(
  api: ApiClient,
  run: CaseRun,
  versions: string[],
  scenario: ConstellationScenario,
): Promise<ConstellationSimRecord[]> {
  const batch = newKey('cmp')
  return Promise.all(versions.map((v) => simulate(api, run, batch, 'compare', v, scenario)))
}

/** The same scenario at attestation 0, step, 2·step … 100. The step is a sampling choice, not a rule. */
export async function runAttestationSweep(
  api: ApiClient,
  run: CaseRun,
  version: string,
  scenario: ConstellationScenario,
  step = 5,
): Promise<ConstellationSimRecord[]> {
  const batch = newKey('sweep')
  const points: number[] = []
  for (let p = 0; p <= 100; p += step) points.push(p)
  if (points[points.length - 1] !== 100) points.push(100)
  const out: ConstellationSimRecord[] = []
  for (const attestationPercent of points) {
    out.push(await simulate(api, run, batch, 'sweep', version, { ...scenario, attestationPercent }))
  }
  return out
}

/** True when the Backend answered that it does not know this run's IDs (its own 404 NOT_FOUND), e.g. after a restart. */
export function isStale(records: Array<{ error: StoredError | null }>): boolean {
  return records.some((r) => r.error?.status === 404 && r.error.code === 'NOT_FOUND')
}

/**
 * Which route set to show, and which was the last attempt. A set is one click: one record per route, appended together.
 * A failed later attempt must not hide results that were already saved (design doc §9).
 */
export function latestGatewaySets(run: CaseRun): { shown: GatewaySimRecord[]; last: GatewaySimRecord[] } {
  const size = run.compliance ? gatewayRoutesFor(run.compliance.decision.action).length : 0
  if (size === 0 || run.gateway.length === 0) return { shown: [], last: [] }
  const sets: GatewaySimRecord[][] = []
  for (let end = run.gateway.length; end > 0; end -= size) sets.push(run.gateway.slice(Math.max(0, end - size), end))
  const last = sets[0]
  return { shown: sets.find((set) => set.some((r) => r.result)) ?? last, last }
}

function latestBatch(records: ConstellationSimRecord[]): { shown: ConstellationSimRecord[]; last: ConstellationSimRecord[] } {
  const order = [...new Set(records.map((r) => r.batch))].reverse()
  const batch = (id: string) => records.filter((r) => r.batch === id)
  if (order.length === 0) return { shown: [], last: [] }
  const good = order.find((id) => batch(id).some((r) => r.result))
  return { shown: batch(good ?? order[0]), last: batch(order[0]) }
}

/** The model comparison to show (last one with a result) and the last attempt. */
export function latestCompare(run: CaseRun) {
  return latestBatch(run.constellation.filter((r) => r.purpose === 'compare'))
}

/** The attestation sweep to show (last one with a result) and the last attempt. */
export function latestSweep(run: CaseRun) {
  return latestBatch(run.constellation.filter((r) => r.purpose === 'sweep'))
}
