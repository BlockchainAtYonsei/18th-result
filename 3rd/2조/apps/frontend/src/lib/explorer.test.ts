import { describe, expect, it } from 'vitest'
import { chainLinkable, explorerLinks } from './explorer'

describe('explorer links', () => {
  it('builds address links for both explorers', () => {
    expect(explorerLinks('address', 'Abc')).toEqual({
      solscan: 'https://solscan.io/account/Abc',
      solanaExplorer: 'https://explorer.solana.com/address/Abc',
      arkham: 'https://arkm.com/explorer/address/Abc',
    })
  })

  it('builds transaction links for both explorers', () => {
    expect(explorerLinks('tx', 'Sig')).toEqual({
      solscan: 'https://solscan.io/tx/Sig',
      solanaExplorer: 'https://explorer.solana.com/tx/Sig',
      arkham: null,
    })
  })

  it('links only on-chain data', () => {
    expect(chainLinkable({ dataType: 'ON_CHAIN', source: 'rpc', reference: null })).toBe(true)
    expect(chainLinkable({ dataType: 'SYNTHETIC', source: 'fixture', reference: null })).toBe(false)
    expect(chainLinkable(null)).toBe(false)
    expect(chainLinkable(undefined)).toBe(false)
  })
})
