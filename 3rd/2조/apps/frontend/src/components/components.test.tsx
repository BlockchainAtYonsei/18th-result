import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataProvenance } from '../api/types'
import { AddressChip } from './AddressChip'
import { ChartFrame } from './ChartFrame'
import { ErrorNotice } from './ErrorNotice'
import { RiskGauge } from './RiskGauge'
import { DecisionTag, RiskTag } from './StatusTag'

afterEach(cleanup)

const synthetic: DataProvenance = { dataType: 'SYNTHETIC', source: 'contracts/fixtures', reference: null }
const onChain: DataProvenance = { dataType: 'ON_CHAIN', source: 'rpc', reference: null }
const ADDR = '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR'

describe('AddressChip', () => {
  it('does not link synthetic addresses to an explorer', () => {
    const { container } = render(<AddressChip address={ADDR} provenance={synthetic} />)
    expect(container.querySelector('a[href]')).toBeNull()
    expect(container.textContent).not.toContain('Solscan')
  })

  it('links on-chain addresses to the explorers and Arkham', () => {
    const { container } = render(<AddressChip address={ADDR} provenance={onChain} />)
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([`https://solscan.io/account/${ADDR}`, `https://explorer.solana.com/address/${ADDR}`, `https://arkm.com/explorer/address/${ADDR}`])
  })
})

describe('RiskGauge', () => {
  it('shows a missing score as Not scored, never as 0', () => {
    const { container } = render(<RiskGauge score={null} level={null} highThreshold={70} />)
    expect(screen.getByText('Not scored')).toBeTruthy()
    const zeros = [...container.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.trim() === '0')
    expect(zeros).toHaveLength(0)
  })

  it('says Low is not a safety guarantee', () => {
    render(<RiskGauge score={0} level="LOW" highThreshold={70} />)
    expect(screen.getByText(/not a safety guarantee/)).toBeTruthy()
  })
})

describe('status tags', () => {
  it('shows the decision as text, not colour alone', () => {
    render(<DecisionTag action="BLOCK" />)
    expect(screen.getByText('Block')).toBeTruthy()
  })

  it('shows a missing level as Not scored', () => {
    render(<RiskTag level={null} />)
    expect(screen.getByText('Not scored')).toBeTruthy()
  })
})

describe('ChartFrame', () => {
  it('switches between the chart and its table', () => {
    render(
      <ChartFrame question="Who?" answer="Three wallets." table={<table><tbody><tr><td>row</td></tr></tbody></table>}>
        <svg data-testid="chart" />
      </ChartFrame>,
    )
    expect(screen.getByTestId('chart')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(screen.getByText('row')).toBeTruthy()
    expect(screen.queryByTestId('chart')).toBeNull()
  })
})

describe('ErrorNotice', () => {
  it('explains the failure in words and offers a retry when it can be retried', () => {
    let retried = false
    render(
      <ErrorNotice
        step="sender"
        error={{ kind: 'timeout', code: 'TIMEOUT', message: 'x', retryable: true, status: null, requestId: null }}
        onRetry={() => (retried = true)}
      />,
    )
    expect(screen.getByText('The analysis did not finish in time.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retried).toBe(true)
  })
})
