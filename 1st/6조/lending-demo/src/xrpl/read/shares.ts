/**
 * Vault share balances.
 *
 * Shares are an MPToken issued by the vault pseudo-account, so the holder balance is
 * an `MPToken` ledger entry keyed by (issuance id, holder). For an XRP vault the
 * scale is fixed at 0, i.e. one share is one drop.
 */
import type { Client } from 'xrpl';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function rippledErrorCode(error: unknown): string | null {
  const code = asRecord(asRecord(error)?.data)?.error;
  return typeof code === 'string' ? code : null;
}

const ABSENT = new Set(['entryNotFound', 'objectNotFound', 'malformedRequest']);

/**
 * Share balance of `account`, as the raw `MPToken.MPTAmount` string.
 * `'0'` when the holder has no MPToken for this issuance yet.
 */
export async function readShareBalance(
  client: Client,
  shareMPTID: string,
  account: string,
): Promise<string> {
  try {
    const response = await client.request({
      command: 'ledger_entry',
      mptoken: { mpt_issuance_id: shareMPTID, account },
      ledger_index: 'validated',
    });
    const node = asRecord(response.result.node);
    const amount = node?.MPTAmount;
    return amount === undefined || amount === null ? '0' : String(amount);
  } catch (error) {
    if (ABSENT.has(rippledErrorCode(error) ?? '')) {
      return '0';
    }
    throw error;
  }
}

export interface ShareIssuanceView {
  raw: Record<string, unknown>;
  /** Total shares in circulation, the denominator of the exchange rate. */
  outstandingAmount: string;
}

/** The share `MPTokenIssuance`, whose `OutstandingAmount` is the vault's SharesTotal. */
export async function readShareIssuance(
  client: Client,
  shareMPTID: string,
): Promise<ShareIssuanceView | null> {
  try {
    const response = await client.request({
      command: 'ledger_entry',
      mpt_issuance: shareMPTID,
      ledger_index: 'validated',
    });
    const node = asRecord(response.result.node);
    if (!node) {
      return null;
    }
    const outstanding = node.OutstandingAmount;
    return {
      raw: node,
      outstandingAmount:
        outstanding === undefined || outstanding === null ? '0' : String(outstanding),
    };
  } catch (error) {
    if (ABSENT.has(rippledErrorCode(error) ?? '')) {
      return null;
    }
    throw error;
  }
}
