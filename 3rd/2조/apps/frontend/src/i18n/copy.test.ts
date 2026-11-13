import { describe, expect, it } from 'vitest'
import { createCopy, fill } from './copy'
import { en } from './en'

const copy = createCopy(en)

describe('copy helpers', () => {
  it('fills rule parameters from the ruleset config', () => {
    const fanOut = copy.rule('RAPID_FAN_OUT', { windowSeconds: 300, minRecipients: 3 })
    expect(fanOut.title).toBe('Rapid fan-out')
    expect(fanOut.detail).toContain('3')
    expect(fanOut.detail).toContain('300 seconds')
  })

  it('falls back to a readable sentence for an unknown code', () => {
    const unknown = copy.reason('NOPE')
    expect(unknown.title).toBe('Unrecognised code')
    expect(unknown.detail).toContain('NOPE')
  })

  it('never shows a contract code name as a reason title', () => {
    expect(copy.reason('SANCTION_EXACT_MATCH').title).not.toContain('_')
    expect(copy.reason('SANCTION_EXACT_MATCH').title).toBe('A wallet in this transfer is a sanctioned address.')
  })

  it('describes decisions with a label, a headline and a detail', () => {
    const block = copy.decision('BLOCK')
    expect(block).toEqual({ label: 'Block', headline: 'This transfer is blocked.', detail: 'The policy blocks it.' })
  })

  it('looks up glossary terms', () => {
    expect(copy.glossary('pslice').term).toBe('pslice')
    expect(copy.glossary('pslice').definition).toContain('batch')
  })
})

describe('fill', () => {
  it('picks the singular or plural word from the count', () => {
    const t = '{n} {n|transfer|transfers}, {e} of them {e|is|are} evidence.'
    expect(fill(t, { n: 1, e: 1 })).toBe('1 transfer, 1 of them is evidence.')
    expect(fill(t, { n: 4, e: 0 })).toBe('4 transfers, 0 of them are evidence.')
  })
})
