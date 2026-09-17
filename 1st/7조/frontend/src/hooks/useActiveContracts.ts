'use client';

import { useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES, DEMO_FACTORY_ADDRESS } from '../constants/contracts';
import DemoDeploymentFactoryABI from '../generated/contracts/DemoDeploymentFactory.abi.json';

type ActiveDeployment = {
  settlementToken: `0x${string}`;
  revenueBridge: `0x${string}`;
  revenueRightToken: `0x${string}`;
  version: bigint;
};

export function useActiveContracts() {
  const result = useReadContract({
    address: DEMO_FACTORY_ADDRESS,
    abi: DemoDeploymentFactoryABI,
    functionName: 'activeDeployment',
    query: { enabled: !!DEMO_FACTORY_ADDRESS },
  });
  const active = result.data as ActiveDeployment | undefined;

  return {
    addresses: active ? {
      REVENUE_BRIDGE: active.revenueBridge,
      MUSD: active.settlementToken,
      REVENUE_RIGHT_TOKEN: active.revenueRightToken,
    } : CONTRACT_ADDRESSES,
    version: active?.version ?? BigInt(1),
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}
