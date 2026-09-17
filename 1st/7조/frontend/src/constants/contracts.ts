import deployment from '../generated/contracts/deployment.json';

type DeploymentContracts = typeof deployment.contracts & {
  demoFactory?: `0x${string}`;
};

const deploymentContracts = deployment.contracts as DeploymentContracts;

export const CHAIN_ID = deployment.chainId;
export const IS_LOCAL_CHAIN = CHAIN_ID === 31337;

export const CONTRACT_ADDRESSES = {
  REVENUE_BRIDGE: deploymentContracts.revenueBridge as `0x${string}`,
  MUSD: deploymentContracts.settlementToken as `0x${string}`,
  REVENUE_RIGHT_TOKEN: deploymentContracts.revenueRightToken as `0x${string}`,
} as const;

export const DEMO_FACTORY_ADDRESS = deploymentContracts.demoFactory;

export const OFFERING_STATUS_LABELS = ['없음', '모집 중', '운영 중', '모집 실패', '정산 중', '정산 완료'] as const;

export function offeringStatusLabel(status: number | bigint | undefined, fallback: string) {
  if (status === undefined) return fallback;
  return OFFERING_STATUS_LABELS[Number(status)] ?? fallback;
}
export const ERC20_ABI = [
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address", "internalType": "address" },
      { "name": "spender", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{ "name": "account", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  }
] as const;
