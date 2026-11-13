import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtureCase } from '../../cases/testCases'
import { renderPage } from '../../test/render'
import { DashboardPage } from '../DashboardPage'

afterEach(cleanup)

const seed = [fixtureCase('CL-0001', 'sanctioned'), fixtureCase('CL-0002', 'warn'), fixtureCase('CL-0003', 'partial-sanctioned')]

describe('DashboardPage', () => {
  it('lists every case and narrows to Block with the filter', async () => {
    renderPage(<DashboardPage />, { seed })
    const rows = await screen.findAllByRole('row', { name: /CL-000/ })
    expect(rows).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /^Block/ }))
    expect(screen.getAllByRole('row', { name: /CL-000/ })).toHaveLength(2)
  })

  it('shows every reason of a decision with equal weight', async () => {
    renderPage(<DashboardPage />, { seed })
    const row = await screen.findByRole('row', { name: /CL-0003/ })
    expect(within(row).getByText(/A wallet in this transfer is a sanctioned address\./)).toBeTruthy()
    expect(within(row).getByText(/A wallet could only be partly analysed\./)).toBeTruthy()
  })

  it('opens a case from its row', async () => {
    renderPage(<DashboardPage />, { seed })
    fireEvent.click(await screen.findByRole('link', { name: 'CL-0002' }))
    expect(screen.getAllByTestId('location').some((el) => el.textContent === '/cases/CL-0002')).toBe(true)
  })

  it('invites a first case when there are none', async () => {
    renderPage(<DashboardPage />, { seed: [] })
    expect(await screen.findByText('No transfers checked yet.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'New case' }).length).toBeGreaterThan(0)
  })
})
