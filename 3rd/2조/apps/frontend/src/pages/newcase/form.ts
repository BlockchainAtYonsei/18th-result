// New-case form state and its validation into a CaseInput. Only input checks; no policy logic.
import type { Asset, Mode } from '../../api/types'
import type { CaseInput } from '../../cases/model'
import { findScenario, policyVersions, scenarioSender } from '../../contracts/catalog'
import type { MessageKey } from '../../i18n/hooks'
import { parseDecimalToRaw } from '../../lib/amount'
import { localInputToUtc } from '../../lib/format'

export interface FormState {
  mode: Mode
  senderFx: string
  recipientFx: string
  senderAddr: string
  recipientAddr: string
  assetType: Asset['type']
  mint: string
  decimals: string
  amount: string
  policyVersion: string
  rulesetVersion: string
  from: string
  to: string
  maxTx: string
}

export type FieldError = { key: MessageKey; params?: Record<string, string | number> }
export type FormErrors = Partial<Record<keyof FormState, FieldError>>

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function utcInput(d: Date): string {
  return d.toISOString().slice(0, 16)
}

/** `offered` is the scenario ids on offer, in order; the form starts on the first that is not the common sender. */
export function initialForm(now = new Date(), offered: string[] = ['sender', 'demo-layering']): FormState {
  const recipientFx = offered.find((id) => id !== 'sender') ?? 'sender'
  return {
    mode: 'FIXTURE',
    senderFx: scenarioSender(recipientFx),
    recipientFx,
    senderAddr: '',
    recipientAddr: '',
    assetType: 'SOL',
    mint: '',
    decimals: '6',
    amount: '1',
    policyVersion: policyVersions[0] ?? '1.0.0',
    rulesetVersion: '',
    from: utcInput(new Date(now.getTime() - 24 * 3600 * 1000)),
    to: utcInput(now),
    maxTx: '100',
  }
}

export function validateForm(f: FormState): { input: CaseInput | null; errors: FormErrors } {
  const errors: FormErrors = {}
  let sender = { address: '', fixtureId: null as string | null }
  let recipient = { address: '', fixtureId: null as string | null }

  if (f.mode === 'FIXTURE') {
    const s = findScenario(f.senderFx)
    const r = findScenario(f.recipientFx)
    sender = { address: s?.request.address ?? '', fixtureId: f.senderFx }
    recipient = { address: r?.request.address ?? '', fixtureId: f.recipientFx }
  } else {
    if (!BASE58.test(f.senderAddr.trim())) errors.senderAddr = { key: 'ui.newcase.badAddress' }
    if (!BASE58.test(f.recipientAddr.trim())) errors.recipientAddr = { key: 'ui.newcase.badAddress' }
    sender = { address: f.senderAddr.trim(), fixtureId: null }
    recipient = { address: f.recipientAddr.trim(), fixtureId: null }
    if (!(f.from && f.to && f.from < f.to)) errors.to = { key: 'ui.newcase.badWindow' }
    if (!/^[1-9][0-9]*$/.test(f.maxTx)) errors.maxTx = { key: 'ui.newcase.badMaxTx' }
  }

  let decimals = 9
  if (f.assetType !== 'SOL') {
    if (!BASE58.test(f.mint.trim())) errors.mint = { key: 'ui.newcase.badMint' }
    decimals = /^\d+$/.test(f.decimals) ? Number(f.decimals) : NaN
    if (!(decimals >= 0 && decimals <= 255)) errors.decimals = { key: 'ui.newcase.badDecimals' }
  }

  let amountRaw = ''
  if (!errors.decimals) {
    const parsed = parseDecimalToRaw(f.amount, decimals)
    if (parsed.ok) amountRaw = parsed.raw
    else
      errors.amount =
        parsed.error === 'tooManyDecimals'
          ? { key: 'ui.newcase.amountDecimals', params: { unit: f.assetType === 'SOL' ? 'SOL' : f.assetType === 'TOKEN_2022' ? 'Token-2022' : 'SPL', n: decimals } }
          : parsed.error === 'notPositive'
            ? { key: 'ui.newcase.amountPositive' }
            : { key: 'ui.newcase.amountFormat' }
  }

  if (Object.keys(errors).length > 0) return { input: null, errors }
  const asset: Asset = f.assetType === 'SOL' ? { type: 'SOL', mint: null, decimals: 9 } : { type: f.assetType, mint: f.mint.trim(), decimals }
  return {
    input: {
      mode: f.mode,
      sender,
      recipient,
      asset,
      amountRaw,
      scope: f.mode === 'LIVE' ? { fromTime: localInputToUtc(f.from), toTime: localInputToUtc(f.to), maxTransactions: Number(f.maxTx) } : null,
      policyVersion: f.policyVersion,
      rulesetVersion: f.rulesetVersion || null,
    },
    errors,
  }
}
