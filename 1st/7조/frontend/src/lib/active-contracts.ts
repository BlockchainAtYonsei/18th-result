import { createPublicClient, http, type Abi } from 'viem';
import { CONTRACT_ADDRESSES, DEMO_FACTORY_ADDRESS } from '@/constants/contracts';
import DemoDeploymentFactoryABI from '@/generated/contracts/DemoDeploymentFactory.abi.json';

export type ActiveContractAddresses = typeof CONTRACT_ADDRESSES;

export async function resolveActiveContracts(rpcUrl: string): Promise<ActiveContractAddresses> {
  if (!DEMO_FACTORY_ADDRESS) return CONTRACT_ADDRESSES;

  const client = createPublicClient({ transport: http(rpcUrl) });
  const active = await client.readContract({
    address: DEMO_FACTORY_ADDRESS,
    abi: DemoDeploymentFactoryABI as Abi,
    functionName: 'activeDeployment',
  }) as {
    settlementToken: `0x${string}`;
    revenueBridge: `0x${string}`;
    revenueRightToken: `0x${string}`;
  };

  return {
    MUSD: active.settlementToken,
    REVENUE_BRIDGE: active.revenueBridge,
    REVENUE_RIGHT_TOKEN: active.revenueRightToken,
  };
}
