// 원시 수량(amountRaw)은 십진 정수 문자열이다. 계약상 JavaScript Number나 소수로 바꾸지 않으므로
// 화면 표시와 입력 변환을 모두 문자열 연산으로 처리한다.

const RAW = /^(0|[1-9][0-9]*)$/
const DECIMAL_INPUT = /^([0-9]+)(?:\.([0-9]+))?$/

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** amountRaw를 decimals 기준 사람이 읽는 수량으로 바꾼다. 형식이 맞지 않으면 원문을 그대로 돌려준다. */
export function formatRawAmount(raw: string, decimals: number): string {
  if (!RAW.test(raw)) return raw
  if (decimals === 0) return groupThousands(raw)
  const padded = raw.padStart(decimals + 1, '0')
  const intPart = padded.slice(0, padded.length - decimals)
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '')
  const grouped = groupThousands(intPart)
  return fracPart ? `${grouped}.${fracPart}` : grouped
}

export type AmountError = 'format' | 'tooManyDecimals' | 'notPositive'
export type ParseResult = { ok: true; raw: string } | { ok: false; error: AmountError }

/** 사용자가 입력한 십진 수량을 최소 단위 정수 문자열로 바꾼다. 송금 의도이므로 0보다 커야 한다. */
export function parseDecimalToRaw(input: string, decimals: number): ParseResult {
  const m = input.trim().match(DECIMAL_INPUT)
  if (!m) return { ok: false, error: 'format' }
  const [, intPart, fracPart = ''] = m
  if (fracPart.length > decimals) {
    return { ok: false, error: 'tooManyDecimals' }
  }
  const raw = (intPart + fracPart.padEnd(decimals, '0')).replace(/^0+/, '')
  if (raw === '') return { ok: false, error: 'notPositive' }
  return { ok: true, raw }
}
