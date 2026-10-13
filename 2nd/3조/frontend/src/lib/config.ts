import type { Address } from 'viem';

export const config = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545',
  chainId: Number(import.meta.env.VITE_CHAIN_ID || 31337),
  nativeTokenKrwRate: Number(import.meta.env.VITE_NATIVE_TOKEN_KRW_RATE || 1500000),
  factoryAddress: (import.meta.env.VITE_MOA_FACTORY_ADDRESS || '') as Address,
  accountAddress: (import.meta.env.VITE_MOA_ACCOUNT_ADDRESS || '') as Address,
  attackMode: import.meta.env.VITE_ATTACK_MODE === 'true',
};

export const hasFactoryAddress = config.factoryAddress.length > 0;
export const hasAccountAddress = config.accountAddress.length > 0;
