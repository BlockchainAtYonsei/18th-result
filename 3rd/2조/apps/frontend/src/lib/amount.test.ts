import { describe, expect, it } from 'vitest'
import { formatRawAmount, parseDecimalToRaw } from './amount'

describe('formatRawAmount', () => {
  it('formats SOL lamports with 9 decimals', () => {
    expect(formatRawAmount('1000000000', 9)).toBe('1')
    expect(formatRawAmount('1500000000', 9)).toBe('1.5')
    expect(formatRawAmount('1', 9)).toBe('0.000000001')
  })

  it('keeps zero as "0"', () => {
    expect(formatRawAmount('0', 9)).toBe('0')
    expect(formatRawAmount('0', 0)).toBe('0')
  })

  it('groups the integer part', () => {
    expect(formatRawAmount('1234567000000000', 9)).toBe('1,234,567')
  })

  it('handles values beyond Number precision exactly', () => {
    expect(formatRawAmount('123456789012345678901234567890', 6)).toBe('123,456,789,012,345,678,901,234.56789')
  })

  it('returns the raw string untouched when it is not a decimal integer', () => {
    expect(formatRawAmount('1e9', 9)).toBe('1e9')
  })
})

describe('parseDecimalToRaw', () => {
  it('converts decimal input to raw units without floats', () => {
    expect(parseDecimalToRaw('1', 9)).toEqual({ ok: true, raw: '1000000000' })
    expect(parseDecimalToRaw('0.1', 9)).toEqual({ ok: true, raw: '100000000' })
    expect(parseDecimalToRaw('0.000000001', 9)).toEqual({ ok: true, raw: '1' })
    expect(parseDecimalToRaw('12.34', 2)).toEqual({ ok: true, raw: '1234' })
  })

  it('strips leading zeros', () => {
    expect(parseDecimalToRaw('007', 0)).toEqual({ ok: true, raw: '7' })
  })

  it('rejects zero, too many decimals, and malformed input', () => {
    expect(parseDecimalToRaw('0', 9).ok).toBe(false)
    expect(parseDecimalToRaw('0.0000000001', 9).ok).toBe(false)
    expect(parseDecimalToRaw('1.5', 0).ok).toBe(false)
    expect(parseDecimalToRaw('-1', 9).ok).toBe(false)
    expect(parseDecimalToRaw('1e3', 9).ok).toBe(false)
    expect(parseDecimalToRaw('', 9).ok).toBe(false)
    expect(parseDecimalToRaw('1.', 9).ok).toBe(false)
  })
})
