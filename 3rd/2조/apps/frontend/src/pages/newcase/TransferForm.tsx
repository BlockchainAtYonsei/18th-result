import { useContext } from 'react'
import { MessagesContext } from '../../i18n/context'
import type { Asset, Mode } from '../../api/types'
import { AddressChip } from '../../components/AddressChip'
import { Term } from '../../components/Term'
import { currentApiMode, scenariosFor } from '../../app/apiMode'
import { findScenario, policyVersions, rulesetVersions } from '../../contracts/catalog'
import { scenarioName } from './scenarioName'
import { useT } from '../../i18n/hooks'
import { parseDecimalToRaw } from '../../lib/amount'
import { formatUtc } from '../../lib/format'
import type { FormErrors, FormState } from './form'

function Err({ e }: { e?: FormErrors[keyof FormErrors] }) {
  const t = useT()
  return e ? <span className="field-error">{t(e.key, e.params)}</span> : null
}

function Party({ side, form, set, errors }: { side: 'sender' | 'recipient'; form: FormState; set: (p: Partial<FormState>) => void; errors: FormErrors }) {
  const t = useT()
  const messages = useContext(MessagesContext)
  const fxKey = side === 'sender' ? 'senderFx' : 'recipientFx'
  const addrKey = side === 'sender' ? 'senderAddr' : 'recipientAddr'
  const id = `nc-${side}`
  const scenario = findScenario(form[fxKey])
  return (
    <div className="party">
      <span className="party-label">{t(side === 'sender' ? 'ui.newcase.sender' : 'ui.newcase.recipient')}</span>
      {form.mode === 'FIXTURE' ? (
        <>
          <div className="field">
            <label htmlFor={id}>{t(side === 'sender' ? 'ui.newcase.senderScenario' : 'ui.newcase.recipientScenario')}</label>
            <select id={id} className="input" value={form[fxKey]} onChange={(e) => set({ [fxKey]: e.target.value })}>
              {scenariosFor(currentApiMode()).map((s) => (
                <option key={s.fixtureId} value={s.fixtureId}>
                  {scenarioName(s.fixtureId, messages)} · {t(s.provenance.dataType === 'ON_CHAIN' ? 'ui.newcase.recordedMainnet' : 'ui.data.SYNTHETIC')}
                </option>
              ))}
            </select>
          </div>
          {scenario && <AddressChip address={scenario.request.address} provenance={scenario.provenance} full />}
          {scenario?.provenance.dataType === 'ON_CHAIN' && (
            <div className="hint">
              <p>{t('ui.newcase.recordedSource', { source: scenario.provenance.source, capturedAt: formatUtc(scenario.capturedAt) })}</p>
              <p>{t('ui.newcase.recordedScope', { from: formatUtc(scenario.request.scope.fromTime), to: formatUtc(scenario.request.scope.toTime), max: scenario.request.scope.maxTransactions })}</p>
            </div>
          )}
        </>
      ) : (
        <div className="field">
          <label htmlFor={id}>{t(side === 'sender' ? 'ui.newcase.senderAddress' : 'ui.newcase.recipientAddress')}</label>
          <input
            id={id}
            className="input mono-input"
            value={form[addrKey]}
            onChange={(e) => set({ [addrKey]: e.target.value })}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={errors[addrKey] ? true : undefined}
          />
          <Err e={errors[addrKey]} />
        </div>
      )}
    </div>
  )
}

export function TransferForm({ form, set, errors }: { form: FormState; set: (p: Partial<FormState>) => void; errors: FormErrors }) {
  const t = useT()
  const decimals = form.assetType === 'SOL' ? 9 : Number(form.decimals)
  const preview = Number.isInteger(decimals) ? parseDecimalToRaw(form.amount, decimals) : null
  const modes: { id: Mode; label: string }[] = [
    { id: 'FIXTURE', label: t('ui.newcase.fixture') },
    { id: 'LIVE', label: t('ui.newcase.live') },
  ]

  return (
    <div className="nc-form">
      <div className="field">
        <span className="label">{t('ui.newcase.source')}</span>
        <div className="seg" role="radiogroup" aria-label={t('ui.newcase.source')}>
          {modes.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={form.mode === m.id} className={form.mode === m.id ? 'on' : ''} onClick={() => set({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="hint">{form.mode === 'FIXTURE' ? t('ui.newcase.fixtureHint') : t('ui.newcase.liveHint')}</span>
      </div>

      <div className="composer">
        <Party side="sender" form={form} set={set} errors={errors} />
        <div className="composer-mid">
          <div className="field">
            <label htmlFor="nc-amount">{t('ui.newcase.amount')}</label>
            <div className="amount-row">
              <input id="nc-amount" className="input amount-input" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} aria-invalid={errors.amount ? true : undefined} />
              <select className="input asset-select" aria-label={t('ui.newcase.asset')} value={form.assetType} onChange={(e) => set({ assetType: e.target.value as Asset['type'] })}>
                <option value="SOL">SOL</option>
                <option value="SPL">SPL</option>
                <option value="TOKEN_2022">Token-2022</option>
              </select>
            </div>
            <Err e={errors.amount} />
            {preview?.ok && <span className="hint mono">{t('ui.newcase.baseUnits', { raw: preview.raw })}</span>}
          </div>
          <svg className="composer-arrow" viewBox="0 0 200 14" aria-hidden="true">
            <line x1="0" y1="7" x2="190" y2="7" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 5" />
            <path d="M183 2 L193 7 L183 12" fill="none" stroke="var(--accent)" strokeWidth="2" />
          </svg>
        </div>
        <Party side="recipient" form={form} set={set} errors={errors} />
      </div>

      {form.assetType !== 'SOL' && (
        <div className="row2">
          <div className="field">
            <label htmlFor="nc-mint">
              <Term id="tokenAccount">{t('ui.newcase.mint')}</Term>
            </label>
            <input id="nc-mint" className="input mono-input" value={form.mint} onChange={(e) => set({ mint: e.target.value })} spellCheck={false} />
            <Err e={errors.mint} />
          </div>
          <div className="field">
            <label htmlFor="nc-decimals">{t('ui.newcase.decimals')}</label>
            <input id="nc-decimals" className="input" inputMode="numeric" value={form.decimals} onChange={(e) => set({ decimals: e.target.value })} />
            <Err e={errors.decimals} />
          </div>
        </div>
      )}

      <details className="advanced">
        <summary>{t('ui.newcase.advanced')}</summary>
        <div className="row3">
          <div className="field">
            <label htmlFor="nc-policy">{t('ui.newcase.policyVersion')}</label>
            <select id="nc-policy" className="input" value={form.policyVersion} onChange={(e) => set({ policyVersion: e.target.value })}>
              {policyVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nc-ruleset">{t('ui.newcase.rulesetVersion')}</label>
            <select id="nc-ruleset" className="input" value={form.rulesetVersion} onChange={(e) => set({ rulesetVersion: e.target.value })}>
              <option value="">{t('ui.newcase.rulesetDefault')}</option>
              {rulesetVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {form.mode === 'LIVE' && (
            <>
              <div className="field">
                <label htmlFor="nc-from">{t('ui.newcase.windowFrom')}</label>
                <input id="nc-from" className="input" type="datetime-local" value={form.from} onChange={(e) => set({ from: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nc-to">{t('ui.newcase.windowTo')}</label>
                <input id="nc-to" className="input" type="datetime-local" value={form.to} onChange={(e) => set({ to: e.target.value })} />
                <Err e={errors.to} />
              </div>
              <div className="field">
                <label htmlFor="nc-max">{t('ui.newcase.maxTx')}</label>
                <input id="nc-max" className="input" inputMode="numeric" value={form.maxTx} onChange={(e) => set({ maxTx: e.target.value })} />
                <Err e={errors.maxTx} />
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  )
}
