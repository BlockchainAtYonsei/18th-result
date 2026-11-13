import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

function Broken(): never {
  throw new Error('cannot draw this')
}

describe('ErrorBoundary', () => {
  it('shows a message and a way back instead of a blank page when a screen throws', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('This screen could not be shown.')).toBeTruthy()
    expect(screen.getByText(/cannot draw this/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to cases' }).getAttribute('href')).toBe('#/')
    quiet.mockRestore()
  })
})
