import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { getIdentity } from './identity'

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})
afterEach(cleanup)

describe('App shell', () => {
  it('sends a visitor without identity to the login page', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })

  it('opens the dashboard after signing in', async () => {
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Name or e-mail'), { target: { value: 'Henry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Cases' })).toBeTruthy()
    expect(getIdentity()?.name).toBe('Henry')
  })
})
