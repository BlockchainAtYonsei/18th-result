/**
 * `account_info` reads. Balances stay raw drops strings - the app never converts
 * protocol values, it only displays them.
 */
import type { Client } from 'xrpl';

export interface AccountSnapshot {
  address: string;
  /** XRP balance in drops, verbatim from `account_info`. */
  balanceDrops: string;
  ownerCount: number;
  sequence: number;
  exists: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function rippledErrorCode(error: unknown): string | null {
  const code = asRecord(asRecord(error)?.data)?.error;
  return typeof code === 'string' ? code : null;
}

export async function readAccount(client: Client, address: string): Promise<AccountSnapshot> {
  try {
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    const data = response.result.account_data;
    return {
      address,
      balanceDrops: data.Balance,
      ownerCount: data.OwnerCount,
      sequence: data.Sequence,
      exists: true,
    };
  } catch (error) {
    if (rippledErrorCode(error) === 'actNotFound') {
      return { address, balanceDrops: '0', ownerCount: 0, sequence: 0, exists: false };
    }
    throw error;
  }
}

/** Current account sequence, required to derive Vault / LoanBroker ids before submitting. */
export async function readAccountSequence(client: Client, address: string): Promise<number> {
  const account = await readAccount(client, address);
  if (!account.exists) {
    throw new Error(`account ${address} does not exist on the ledger`);
  }
  return account.sequence;
}

export interface ReserveInfo {
  baseDrops: number;
  incrementDrops: number;
}

/** Base and per-owner-object reserve, read from the validated ledger of `server_info`. */
export async function readReserves(client: Client): Promise<ReserveInfo> {
  const response = await client.request({ command: 'server_info' });
  const validated = response.result.info.validated_ledger;
  if (!validated) {
    throw new Error('server_info returned no validated_ledger; cannot read reserves');
  }
  return {
    baseDrops: Math.round(validated.reserve_base_xrp * 1_000_000),
    incrementDrops: Math.round(validated.reserve_inc_xrp * 1_000_000),
  };
}
