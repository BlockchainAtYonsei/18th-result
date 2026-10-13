import {
  createPublicClient,
  http,
  isAddress,
  type PublicClient,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';

export const BLOCKCHAIN_CLIENT = Symbol('BLOCKCHAIN_CLIENT');
export interface BlockchainConnection {
  client?: PublicClient;
  factory?: Address;
  error?: 'BLOCKCHAIN_NOT_CONFIGURED' | 'BLOCKCHAIN_INVALID_CONFIG';
}

// Configuration failures affect read endpoints, leaving metadata writes available.
export function createBlockchainConnection(
  env: NodeJS.ProcessEnv = process.env,
): BlockchainConnection {
  const rpc = env.BLOCKCHAIN_RPC_URL;
  const factory = env.MOA_FACTORY_ADDRESS;
  if (!rpc || !factory) return { error: 'BLOCKCHAIN_NOT_CONFIGURED' };
  try {
    const url = new URL(rpc);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !isAddress(factory, { strict: false })
    ) {
      return { error: 'BLOCKCHAIN_INVALID_CONFIG' };
    }
    return {
      factory: factory.toLowerCase() as Address,
      client: createPublicClient({
        chain: sepolia,
        transport: http(rpc, { timeout: 10_000, retryCount: 1 }),
      }),
    };
  } catch {
    return { error: 'BLOCKCHAIN_INVALID_CONFIG' };
  }
}
