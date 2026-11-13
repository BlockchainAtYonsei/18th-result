// "What if it's sent another way?": the same transfer on another route and on the network (design doc §6.5).
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useApi } from '../../../app/useApi'
import type { CaseRecord, CaseRun, ConstellationSimRecord } from '../../../cases/model'
import { useCases } from '../../../cases/useCases'
import { isStale, latestCompare, latestGatewaySets, latestSweep, runGatewaySet } from '../../../flow/simulate'
import { useT } from '../../../i18n/hooks'
import { markFresh } from './fresh'
import { GatewayTab } from './GatewayTab'
import { NetworkTab, type NetworkBusy } from './NetworkTab'

// Runs whose route check is in flight. Kept outside the component so closing and reopening the dialog
// (or StrictMode mounting twice) cannot start, and save, a second set; the dialog subscribes to show "checking".
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
const flights = {
  has: (runId: string) => inFlight.has(runId),
  set(runId: string, on: boolean) {
    if (on) inFlight.add(runId)
    else inFlight.delete(runId)
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
}

function DialogBody({ record, run, onRerun, rerunning }: { record: CaseRecord; run: CaseRun; onRerun: () => void; rerunning: boolean }) {
  const t = useT()
  const api = useApi()
  const { update } = useCases()
  const [networkBusy, setNetworkBusy] = useState<NetworkBusy>(null)
  const routesBusy = useSyncExternalStore(flights.subscribe, () => flights.has(run.runId))

  // Always change the latest stored run, never the copy this render saw: another save may have landed meanwhile.
  const patch = useCallback(
    (change: (r: CaseRun) => CaseRun) => update(record.id, (c) => ({ ...c, runs: c.runs.map((r) => (r.runId === run.runId ? change(r) : r)) })),
    [update, record.id, run.runId],
  )

  const runRoutes = useCallback(async () => {
    if (flights.has(run.runId)) return
    flights.set(run.runId, true)
    try {
      const records = await runGatewaySet(api, run)
      markFresh(records[0].key)
      await patch((r) => ({ ...r, gateway: [...r.gateway, ...records] }))
    } catch { /* The shared storage notice retains failed writes for retry. */ } finally {
      flights.set(run.runId, false)
    }
  }, [api, run, patch])

  // Opening the dialog answers the question straight away; saved results are shown as they are.
  const neverRan = run.gateway.length === 0
  useEffect(() => {
    if (neverRan) void runRoutes()
  }, [neverRan, runRoutes])

  const saveNetwork = useCallback((records: ConstellationSimRecord[]) => patch((r) => ({ ...r, constellation: [...r.constellation, ...records] })), [patch])
  // Derived from what is saved, so the banner is still there after closing and reopening.
  const stale = isStale(latestGatewaySets(run).last) || isStale(latestCompare(run).last) || isStale(latestSweep(run).last)

  return (
    <>
      <header className="dialog-head">
        <Dialog.Title asChild>
          <h2>{t('ui.sim.title')}</h2>
        </Dialog.Title>
        <Dialog.Close className="btn btn-text">{t('ui.sim.close')}</Dialog.Close>
      </header>
      <p id="sim-intro" className="t2">
        {t('ui.sim.intro')}
      </p>
      {stale && (
        <div className="notice notice-warn" role="alert">
          <span>{t('ui.sim.stale')}</span>
          <div>
            <button type="button" className="btn" disabled={rerunning} onClick={onRerun}>
              {rerunning ? t('ui.case.rerunning') : t('ui.case.rerun')}
            </button>
          </div>
        </div>
      )}
      <Tabs.Root defaultValue="routes" className="tabs">
        <Tabs.List className="tab-list" aria-label={t('ui.sim.title')}>
          <Tabs.Trigger value="routes" className="tab">
            {t('ui.sim.tabRoutes')}
          </Tabs.Trigger>
          <Tabs.Trigger value="network" className="tab">
            {t('ui.sim.tabNetwork')}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="routes">
          <GatewayTab run={run} busy={routesBusy} onRun={() => void runRoutes()} />
        </Tabs.Content>
        <Tabs.Content value="network">
          <NetworkTab run={run} busy={networkBusy} setBusy={setNetworkBusy} onSave={saveNetwork} />
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}

export function SimulationDialog({
  open,
  onOpenChange,
  record,
  run,
  onRerun,
  rerunning,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: CaseRecord
  run: CaseRun
  onRerun: () => void
  rerunning: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog" aria-describedby="sim-intro">
          <DialogBody record={record} run={run} onRerun={onRerun} rerunning={rerunning} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
