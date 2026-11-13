import { formatRawAmount } from './amount'
export function shortAddress(address: string | null | undefined, keep = 4): string {
  if (!address) return 'unknown'
  if (address.length <= keep * 2 + 1) return address
  return `${address.slice(0, keep)}…${address.slice(-keep)}`
}

/** 계약의 UTC 시각을 그대로 UTC로 보여준다. */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').replace(/(\.\d+)?Z$/, ' UTC')
}

/** datetime-local 입력값(YYYY-MM-DDTHH:mm)을 UTC 시각 문자열로 본다. */
export function localInputToUtc(value: string): string {
  return value.length === 16 ? `${value}:00Z` : `${value}Z`
}

export function utcToLocalInput(iso: string): string {
  return iso.slice(0, 16)
}

export function nowUtcSeconds(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function newIntentId(): string {
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** "2.5 SOL", "120 SPL Ab12…cd34" — amountRaw stays a string all the way (lib/amount). */
export function formatAmount(amountRaw: string, asset: { type: string; mint: string | null; decimals: number }): string {
  const value = formatRawAmount(amountRaw, asset.decimals)
  if (asset.type === 'SOL') return `${value} SOL`
  const kind = asset.type === 'TOKEN_2022' ? 'Token-2022' : 'SPL'
  return `${value} ${kind} ${shortAddress(asset.mint)}`
}

export type RelativeTime = { unit: 'now' } | { unit: 'min' | 'h' | 'd'; n: number }

export function relativeTime(iso: string, now: number = Date.now()): RelativeTime {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 45) return { unit: 'now' }
  const m = Math.round(s / 60)
  if (m < 60) return { unit: 'min', n: m }
  const h = Math.round(m / 60)
  if (h < 48) return { unit: 'h', n: h }
  return { unit: 'd', n: Math.round(h / 24) }
}
