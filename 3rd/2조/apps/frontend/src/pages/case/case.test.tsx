import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtureCase } from '../../cases/testCases'
import { renderPage } from '../../test/render'
import { CasePage } from '../CasePage'

afterEach(cleanup)

const open = (recipient: string) =>
  renderPage(<CasePage />, { path: '/cases/:caseId', at: '/cases/CL-0001', seed: [fixtureCase('CL-0001', recipient)] })

describe('CasePage', () => {
  it('leads with the outcome as the page heading and the reason right under it', async () => {
    open('sanctioned')
    const verdict = await screen.findByTestId('verdict')
    expect(within(verdict).getByRole('heading', { level: 1 }).textContent).toContain('This transfer is blocked.')
    expect(within(verdict).getByText('A wallet in this transfer is a sanctioned address.')).toBeTruthy()
    expect(within(verdict).queryByText('Do not send this transfer.')).toBeNull()
  })

  it('says what the score is made of, as reported', async () => {
    open('sanctioned')
    const verdict = await screen.findByTestId('verdict')
    expect(verdict.textContent).toContain('100')
    expect(within(verdict).getByText(/Sanctioned address \+100/)).toBeTruthy()
  })

  it('says in plain words that the data is synthetic and the list is a test list', async () => {
    open('sanctioned')
    const verdict = await screen.findByTestId('verdict')
    expect(within(verdict).getByText(/Synthetic test data/)).toBeTruthy()
    const why = await screen.findByTestId('why')
    expect(within(why).getByText(/Test list, not the real OFAC list/)).toBeTruthy()
  })

  it('traces the decision to the list entry behind it under a one-word heading', async () => {
    open('sanctioned')
    const why = await screen.findByTestId('why')
    expect(within(why).getByRole('heading', { level: 2 }).textContent).toBe('Evidence')
    expect(within(why).getByText('synthetic-sanction-001')).toBeTruthy()
    expect(within(why).getByText(/Recipient/)).toBeTruthy()
    expect(screen.queryByText('What did the policy rely on?')).toBeNull()
  })

  it('keeps contract code names out of everything but the audit section', async () => {
    const { container } = open('sanctioned')
    const audit = await screen.findByTestId('audit')
    expect(audit.textContent).toContain('SANCTION_EXACT_MATCH')
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelector('[data-testid="audit"]')?.remove()
    for (const code of ['SANCTION_EXACT_MATCH', 'SANCTION_EXACT', 'TEST_FIXTURE', 'SYNTHETIC']) {
      expect(clone.textContent).not.toContain(code)
    }
  })

  it('lists every reason and shows a missing combined score as Not scored', async () => {
    open('partial-sanctioned')
    const verdict = await screen.findByTestId('verdict')
    expect(within(verdict).getByText('A wallet in this transfer is a sanctioned address.')).toBeTruthy()
    expect(within(verdict).getByText('A wallet could only be partly analysed.')).toBeTruthy()
    expect(within(verdict).getByText(/Not scored/)).toBeTruthy()
    expect(within(verdict).getByText(/not a score of 0/)).toBeTruthy()
  })

  it('never lets a low score read as a safety guarantee', async () => {
    open('normal')
    const verdict = await screen.findByTestId('verdict')
    expect(within(verdict).getByRole('heading', { level: 1 }).textContent).toContain('This transfer is allowed.')
    expect(within(verdict).getByText(/not a safety guarantee/)).toBeTruthy()
  })

  it('folds wallet analysis, transfers and audit away until asked for', async () => {
    open('sanctioned')
    const audit = await screen.findByTestId('audit')
    const folds = [audit, screen.getByTestId('wallet-sender'), screen.getByTestId('transfers')].map((el) => el.closest('details'))
    for (const d of folds) {
      expect(d).not.toBeNull()
      expect(d!.open).toBe(false)
    }
    expect(screen.getByTestId('why').closest('details')).toBeNull()
  })

  it('shows wallet addresses short, with the full address one click away', async () => {
    open('sanctioned')
    const wallet = await screen.findByTestId('wallet-recipient')
    const full = fixtureCase('CL-0001', 'sanctioned').input.recipient.address
    expect(wallet.textContent).not.toContain(full)
    expect(within(wallet).getByRole('button', { name: /Copy/ })).toBeTruthy()
  })

  it('puts the decision id in the audit section', async () => {
    const c = fixtureCase('CL-0001', 'sanctioned')
    open('sanctioned')
    const audit = await screen.findByTestId('audit')
    expect(audit.textContent).toContain(c.runs[0].compliance!.decision.decisionId)
  })

  it('says so when the case is not in storage', async () => {
    renderPage(<CasePage />, { path: '/cases/:caseId', at: '/cases/CL-0099', seed: [] })
    expect(await screen.findByText('This case could not be found in storage.')).toBeTruthy()
  })

  it('offers a re-run for a run that was interrupted by a reload', async () => {
    const c = fixtureCase('CL-0001', 'sanctioned')
    const stuck = { ...c.runs[0], status: 'RUNNING' as const, finishedAt: null, compliance: null, complianceRequest: null }
    renderPage(<CasePage />, { path: '/cases/:caseId', at: '/cases/CL-0001', seed: [{ ...c, runs: [stuck] }] })
    expect(await screen.findByText('This run was interrupted.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Re-run case' })).toBeTruthy()
  })

  it('says what the wallet did, counted from the evidence, heaviest finding first', async () => {
    open('demo-layering')
    const why = await screen.findByTestId('why')
    const cards = within(why).getAllByRole('article')
    expect(within(cards[0]).getByText('3 transfers with 2 counterparties on the sanctions list: 2 received, 1 sent.')).toBeTruthy()
    expect(within(cards[0]).getByText(/Direct exposure to a sanctioned address \+80/)).toBeTruthy()
    expect(within(cards[1]).getByText('6 transfers to 6 different wallets between 13:10:00 and 13:13:30 UTC.')).toBeTruthy()
  })

  it('keeps the transfer rows one click away', async () => {
    open('demo-layering')
    const why = await screen.findByTestId('why')
    const toggle = within(why).getByText('Show the 3 transfers')
    expect(toggle.closest('details')!.open).toBe(false)
  })

  it('draws what the wallet did inside Evidence and marks the counterparties the direct-exposure evidence names', async () => {
    open('demo-layering')
    const why = await screen.findByTestId('why')
    const flow = within(why).getByTestId('fund-flow')
    expect(within(flow).getAllByText('Listed counterparty')).toHaveLength(2)
  })
})
