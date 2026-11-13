import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtureCase } from '../../cases/testCases'
import { renderPage } from '../../test/render'
import { CasePage } from '../CasePage'

afterEach(cleanup)

const open = (recipient: string) =>
  renderPage(<CasePage />, { path: '/cases/:caseId', at: '/cases/CL-0001', seed: [fixtureCase('CL-0001', recipient)] })

describe('CasePage details', () => {
  it('names the rule that fired and quotes its window from the ruleset', async () => {
    open('warn')
    const panel = await screen.findByTestId('wallet-recipient')
    expect(within(panel).getByText('Rapid fan-out')).toBeTruthy()
    expect(within(panel).getByText(/within 300 seconds/)).toBeTruthy()
  })

  it('draws the fund flow when several counterparties are involved', async () => {
    open('warn')
    const flow = await screen.findByTestId('fund-flow')
    expect(within(flow).getByText(/3 of them are evidence/)).toBeTruthy()
  })

  it('does not draw a graph for transfers between only the two wallets', async () => {
    open('sanctioned')
    const transfers = await screen.findByTestId('transfers')
    expect(screen.queryByTestId('fund-flow')).toBeNull()
    expect(within(transfers).getByText('1 recorded transfer, all between the sender and the recipient.')).toBeTruthy()
  })
})
