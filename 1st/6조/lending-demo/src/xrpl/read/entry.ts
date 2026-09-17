/**
 * The one `ledger_entry` call the readers share.
 *
 * A missing object is `null`, not an exception: before its creating transaction is
 * validated every one of these ids legitimately resolves to nothing.
 */
import type { Client } from 'xrpl';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function rippledErrorCode(error: unknown): string | null {
  const code = asRecord(asRecord(error)?.data)?.error;
  return typeof code === 'string' ? code : null;
}

const ABSENT = new Set(['entryNotFound', 'objectNotFound', 'unknownOption']);

/** Fetch a ledger object by index from the validated ledger. `null` when absent. */
export async function readLedgerEntry(
  client: Client,
  index: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.request({
      command: 'ledger_entry',
      index,
      ledger_index: 'validated',
    });
    return asRecord(response.result.node);
  } catch (error) {
    if (ABSENT.has(rippledErrorCode(error) ?? '')) {
      return null;
    }
    throw error;
  }
}
