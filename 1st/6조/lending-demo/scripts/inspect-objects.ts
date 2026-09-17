/**
 * Ad-hoc devnet inspector.
 *
 *   npx tsx scripts/inspect-objects.ts tx <hash>
 *   npx tsx scripts/inspect-objects.ts entry <ledger-entry-index>
 *   npx tsx scripts/inspect-objects.ts objects <account>
 *
 * Prints raw rippled payloads. It exists so a surprising `tec` code can be diagnosed
 * from the ledger itself instead of from a guess about what the ledger meant.
 */
import { Client } from 'xrpl';

const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233';

function dump(label: string, value: unknown): void {
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [mode, argument] = process.argv.slice(2);
  if (!mode || !argument) {
    throw new Error('usage: inspect-objects.ts <tx|entry|objects> <value>');
  }
  const client = new Client(DEVNET_WSS, { timeout: 20_000 });
  await client.connect();
  try {
    if (mode === 'tx') {
      const response = await client.request({ command: 'tx', transaction: argument });
      dump('tx', response.result);
    } else if (mode === 'entry') {
      const response = await client.request({
        command: 'ledger_entry',
        index: argument,
        ledger_index: 'validated',
      });
      dump('ledger_entry', response.result);
    } else if (mode === 'objects') {
      const response = await client.request({
        command: 'account_objects',
        account: argument,
        ledger_index: 'validated',
      });
      dump('account_objects', response.result);
    } else {
      throw new Error(`unknown mode ${mode}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
