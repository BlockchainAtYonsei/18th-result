import type { DataProvenance } from '../api/types'

/** Explorer pages for an address or a transaction signature. */
export function explorerLinks(kind: 'address' | 'tx', id: string): { solscan: string; solanaExplorer: string; arkham: string | null } {
  const enc = encodeURIComponent(id)
  return kind === 'tx'
    ? { solscan: `https://solscan.io/tx/${enc}`, solanaExplorer: `https://explorer.solana.com/tx/${enc}`, arkham: null }
    : {
        solscan: `https://solscan.io/account/${enc}`,
        solanaExplorer: `https://explorer.solana.com/address/${enc}`,
        // Arkham draws the counterparty graph this app does not (design doc §8).
        arkham: `https://arkm.com/explorer/address/${enc}`,
      }
}

/** Synthetic fixture data is not on chain, so it never links out (design doc §8). */
export function chainLinkable(p: DataProvenance | null | undefined): boolean {
  return p?.dataType === 'ON_CHAIN'
}
