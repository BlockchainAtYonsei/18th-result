import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Term } from './Term'

afterEach(cleanup)

describe('Term', () => {
  it('underlines the word itself and explains it on focus, with no ? marker', async () => {
    const { container } = render(<p>Each <Term id="pslice">pslice</Term> is attested.</p>)
    const word = screen.getByRole('button', { name: 'pslice' })
    expect(container.textContent).toBe('Each pslice is attested.')
    fireEvent.focus(word)
    const found = await screen.findAllByText(/a proposer's batch of transactions/i)
    expect(found.length).toBeGreaterThan(0)
  })
})
