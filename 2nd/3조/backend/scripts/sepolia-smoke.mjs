import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createPublicClient, http, isAddress } from 'viem';
import { sepolia } from 'viem/chains';
config({ path: new URL('../.env', import.meta.url), quiet: true });
const rpc = process.env.BLOCKCHAIN_RPC_URL;
const address = process.env.MOA_FACTORY_ADDRESS;
if (!rpc || !address) {
  console.log('SKIPPED: blockchain configuration missing');
} else {
  try {
    if (!isAddress(address, { strict: false }) || address.toLowerCase() !== '0x33d4123ac88792cfe81a8ae818760c8008d29747') throw new Error();
    const url = new URL(rpc);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 10000, retryCount: 0 }) });
    if (await client.getChainId() !== sepolia.id) throw new Error();
    // Read the committed generated ABI without a runtime dependency on Hardhat.
    const source = readFileSync(new URL('../src/blockchain/abi/MoaFactory.ts', import.meta.url), 'utf8');
    const abi = JSON.parse(source.slice(source.indexOf('= ') + 2, source.lastIndexOf(' as const;')));
    for (const functionName of ['accountCount', 'THRESHOLD', 'OWNER_COUNT']) {
      const result = await client.readContract({ address, abi, functionName });
      console.log(JSON.stringify({ address, functionName, result: result.toString() }));
    }
  } catch {
    console.error('FAIL: Sepolia read verification failed');
    process.exitCode = 1;
  }
}
