// "Another route": the same decision through this app's submission step and through a route that skips the policy.
// Each route is drawn as a row the transfer travels along; one sentence above says what the rows add up to.
import type { CSSProperties } from 'react'
import type { GatewayExperimentResult } from '../../../api/types'
import { DitherLoader } from '../../../components/DitherLoader'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { Term } from '../../../components/Term'
import type { CaseRun, GatewaySimRecord } from '../../../cases/model'
import { isStale, latestGatewaySets } from '../../../flow/simulate'
import { useCopy, useT, type MessageKey } from '../../../i18n/hooks'
import { useFresh } from './fresh'

const ICON: Record<GatewayExperimentResult['outcome'], string> = { SUBMISSION_REJECTED: '✕', REVIEW_REQUIRED: '⏸', SUBMISSION_ALLOWED: '→' }

/** A sentence for the pattern of returned outcomes. It reads the results; it decides nothing. */
function conclusionKey(shown: GatewaySimRecord[]): MessageKey | null {
  const here = shown.find((r) => r.route.routeId === 'enforced')?.result?.outcome
  const elsewhere = shown.find((r) => r.route.routeId === 'not-enforced')?.result?.outcome
  if (!here || !elsewhere) return null
  const through = (o: string) => o === 'SUBMISSION_ALLOWED'
  if (!through(here) && through(elsewhere)) return 'ui.sim.routes.conclusion.holdsOnlyHere'
  if (through(here) && through(elsewhere)) return 'ui.sim.routes.conclusion.allSubmit'
  if (!through(here) && !through(elsewhere)) return 'ui.sim.routes.conclusion.noneSubmit'
  return null
}

/** The rows for one run. Keyed by the run's first record, so a new run mounts new rows and plays once. */
function RouteRows({ shown }: { shown: GatewaySimRecord[] }) {
  const t = useT()
  const copy = useCopy()
  const live = useFresh(shown[0]?.key)
  const conclusion = conclusionKey(shown)
  return (
    <div className={live ? 'routes-run' : 'routes-run is-static'} data-testid="routes">
      {/* stated once the last route's token has arrived (each route starts 0.35 s after the one before) */}
      {conclusion && (
        <p className="sim-conclusion" key={shown[0]?.key} style={{ animationDelay: `${(shown.length - 1) * 0.35 + 2.5}s` }}>
          {t(conclusion)}
        </p>
      )}
        {/* A token follows each route and stops where the simulator said the route stopped it. */}
        <ol className="routes">
          {shown.map((r, i) => {
            const outcome = r.result?.outcome
            const through = outcome === 'SUBMISSION_ALLOWED'
            return (
              <li key={r.key} className={`route ${outcome ? `route-${outcome.toLowerCase()}` : 'route-failed'}`} data-testid="route" data-outcome={outcome ?? ''} style={{ '--d': `${i * 0.35}s` } as CSSProperties}>
                <div className="route-track">
                  <span className="route-node">{t('ui.sim.routes.transfer')}</span>
                  <span className="route-line route-in">{outcome && <i className="route-token" />}</span>
                  <span className="route-gate">
                    {r.route.policyEnforced ? t(`ui.sim.routes.${r.route.routeId}` as MessageKey) : <Term id="unenforcedRoute">{t(`ui.sim.routes.${r.route.routeId}` as MessageKey)}</Term>}
                    {outcome && !through && (
                      <span className="route-stop" aria-hidden="true">
                        {ICON[outcome]}
                      </span>
                    )}
                  </span>
                  <span className="route-line route-out">{through && <i className="route-token" />}</span>
                  <span className="route-node route-network">{t('ui.sim.routes.network')}</span>
                </div>
                <div className="route-result">
                  {r.result ? (
                    <>
                      <strong>{copy.gatewayOutcomeShort(r.result.outcome)}</strong>
                      <span className="t2">{r.result.reasonCodes.map((c) => copy.gatewayReason(c)).join(' ')}</span>
                    </>
                  ) : (
                    <span className="t2">{r.error ? copy.error(r.error.code).title : '—'}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
    </div>
  )
}

export function GatewayTab({ run, busy, onRun }: { run: CaseRun; busy: boolean; onRun: () => void }) {
  const t = useT()
  const { shown, last } = latestGatewaySets(run)
  // a failed attempt that is not "the backend forgot this run" (that one has its own banner above the tabs)
  const failure = isStale(last) ? null : (last.find((r) => r.error)?.error ?? null)
  const hasResult = shown.some((r) => r.result)

  return (
    <div className="sim-tab">
      {busy && !hasResult && <DitherLoader label={t('ui.sim.routes.running')} />}
      {hasResult && <RouteRows key={shown[0]?.key} shown={shown} />}
      {failure && <ErrorNotice error={failure} />}
      <p className="sim-foot caption muted">
        <span>{t('ui.sim.routes.note')}</span>
        <button type="button" className="btn btn-text" disabled={busy} onClick={onRun}>
          {busy ? t('ui.sim.routes.running') : t('ui.sim.routes.again')}
        </button>
      </p>
    </div>
  )
}
