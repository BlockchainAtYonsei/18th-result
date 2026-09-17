/**
 * Object ids for Vault / LoanBroker / Loan.
 *
 * D3 (`docs/decisions.md`): the deterministic derivation from `xrpl.hashes` is the
 * primary value and the `CreatedNode` scan of the transaction metadata is a
 * cross-check. A mismatch is a hard failure, never a silent fallback, because a
 * wrong id would silently read someone else's object for the rest of the run.
 */
import { hashes } from 'xrpl';

/** `Vault` id: sha512half(space 'V' | AccountID | Sequence). */
export function deriveVaultId(owner: string, sequence: number): string {
  return hashes.hashVault(owner, sequence).toUpperCase();
}

/** `LoanBroker` id: sha512half(space 'l' | AccountID | Sequence). */
export function deriveLoanBrokerId(owner: string, sequence: number): string {
  return hashes.hashLoanBroker(owner, sequence).toUpperCase();
}

/**
 * `Loan` id: sha512half(space 'L' | LoanBrokerID | LoanSequence).
 * `loanSequence` is `LoanBroker.LoanSequence` *before* the LoanSet increments it.
 */
export function deriveLoanId(loanBrokerId: string, loanSequence: number): string {
  return hashes.hashLoan(loanBrokerId, loanSequence).toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Every `LedgerIndex` in `meta.AffectedNodes[].CreatedNode` of the given entry type. */
function createdIndexesOfType(meta: unknown, entryType: string): string[] {
  const nodes = asRecord(meta)?.AffectedNodes;
  if (!Array.isArray(nodes)) {
    return [];
  }
  const found: string[] = [];
  for (const node of nodes) {
    const created = asRecord(asRecord(node)?.CreatedNode);
    if (!created) {
      continue;
    }
    if (created.LedgerEntryType === entryType && typeof created.LedgerIndex === 'string') {
      found.push(created.LedgerIndex.toUpperCase());
    }
  }
  return found;
}

function extractSingle(meta: unknown, entryType: string): string {
  const found = createdIndexesOfType(meta, entryType);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one created ${entryType} node in tx metadata, found ${found.length}`,
    );
  }
  return found[0]!;
}

export function extractVaultId(meta: unknown): string {
  return extractSingle(meta, 'Vault');
}

export function extractLoanBrokerId(meta: unknown): string {
  return extractSingle(meta, 'LoanBroker');
}

export function extractLoanId(meta: unknown): string {
  return extractSingle(meta, 'Loan');
}

/**
 * Cross-check a derived id against the metadata scan. Throws on any disagreement -
 * the plan's "no guessing" rule: an unverified id fails loudly instead of poisoning
 * every later read.
 */
export function assertIdMatchesMeta(
  label: 'Vault' | 'LoanBroker' | 'Loan',
  derived: string,
  meta: unknown,
): string {
  const fromMeta =
    label === 'Vault'
      ? extractVaultId(meta)
      : label === 'LoanBroker'
        ? extractLoanBrokerId(meta)
        : extractLoanId(meta);
  if (fromMeta !== derived.toUpperCase()) {
    throw new Error(
      `${label} id mismatch: hashes derivation gave ${derived}, tx metadata gave ${fromMeta}`,
    );
  }
  return fromMeta;
}
