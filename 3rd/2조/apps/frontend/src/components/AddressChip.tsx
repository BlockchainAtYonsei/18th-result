import { useState } from 'react'
import type { DataProvenance } from '../api/types'
import { useT } from '../i18n/hooks'
import { chainLinkable, explorerLinks } from '../lib/explorer'
import { shortAddress } from '../lib/format'
import { Identicon } from './Identicon'

function ExternalIcon() {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M3 1h6v6M9 1 3.5 6.5M7 9H1V3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function ExplorerLinks({ kind, id, provenance }: { kind: 'address' | 'tx'; id: string; provenance: DataProvenance | null | undefined }) {
  const t = useT()
  const links = explorerLinks(kind, id)
  // Synthetic data is not on chain: no links at all (the page says once that the data is synthetic).
  if (!chainLinkable(provenance)) return null
  return (
    <span className="xl">
      <a href={links.solscan} target="_blank" rel="noopener noreferrer">
        {t('ui.chain.solscan')} <ExternalIcon />
      </a>
      <a href={links.solanaExplorer} target="_blank" rel="noopener noreferrer">
        {t('ui.chain.explorer')} <ExternalIcon />
      </a>
      {links.arkham && (
        <a href={links.arkham} target="_blank" rel="noopener noreferrer">
          {t('ui.chain.arkham')} <ExternalIcon />
        </a>
      )}
    </span>
  )
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={t('ui.chain.copyLabel', { what })}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? t('ui.chain.copied') : t('ui.chain.copy')}
    </button>
  )
}

export function AddressChip({
  address,
  provenance,
  full = false,
  links = true,
  copy = full,
}: {
  address: string
  provenance: DataProvenance | null | undefined
  full?: boolean
  links?: boolean
  /** Show a Copy button (always on when the full address is shown). */
  copy?: boolean
}) {
  return (
    <span className="chip" title={address}>
      <Identicon address={address} size={full ? 22 : 18} />
      <span className={`mono ${full ? 'mono-wrap' : ''}`}>{full ? address : shortAddress(address)}</span>
      {copy && <CopyButton value={address} what={shortAddress(address)} />}
      {links && <ExplorerLinks kind="address" id={address} provenance={provenance} />}
    </span>
  )
}

export function TxChip({ signature, provenance }: { signature: string; provenance: DataProvenance | null | undefined }) {
  return (
    <span className="chip" title={signature}>
      <span className="mono">{`${signature.slice(0, 8)}…${signature.slice(-4)}`}</span>
      <ExplorerLinks kind="tx" id={signature} provenance={provenance} />
    </span>
  )
}
