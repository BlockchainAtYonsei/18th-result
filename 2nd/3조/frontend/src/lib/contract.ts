import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  http,
  keccak256,
  parseEventLogs,
  parseEther,
  formatEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { config } from './config';

export const ACTION_TRANSFER = 0;

const localChain = {
  id: config.chainId,
  name: 'Moa Local Network',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11' as Address,
    },
  },
} as const;

export const factoryAbi = [
  {
    type: 'error',
    name: 'CreatorNotOwner',
    inputs: [{ name: 'creator', type: 'address' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owners', type: 'address[5]' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'accountsOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'owners', type: 'address[5]', indexed: false },
      { name: 'threshold', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const accountAbi = [
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [{ name: 'caller', type: 'address' }],
  },
  {
    type: 'error',
    name: 'ProposalNotFound',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'ProposalNotPending',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'AlreadyApproved',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientApprovals',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'current', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'IntentMismatch',
    inputs: [
      { name: 'expected', type: 'bytes32' },
      { name: 'actual', type: 'bytes32' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      { name: 'available', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'NotProposer',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'caller', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'owners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[5]' }],
  },
  {
    type: 'function',
    name: 'THRESHOLD',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'proposalCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getProposal',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'proposer', type: 'address' },
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'intentHash', type: 'bytes32' },
        { name: 'approvalCount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'createdAt', type: 'uint256' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'hasApproved',
    stateMutability: 'view',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'computeIntentHash',
    stateMutability: 'view',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'createProposal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: 'proposalId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approveProposal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeProposal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelProposal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'balance', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'proposer', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'data', type: 'bytes', indexed: false },
      { name: 'intentHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProposalApproved',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'approvalCount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProposalExecuted',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'executor', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'data', type: 'bytes', indexed: false },
      { name: 'intentHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

type OnchainProposal = {
  proposer: Address;
  target: Address;
  value: bigint;
  data: Hex;
  intentHash: Hex;
  approvalCount: bigint;
  status: number;
  createdAt: bigint;
};

export const publicClient = createPublicClient({
  chain: localChain,
  transport: http(config.rpcUrl),
});

export async function readAccountState(accountAddress: Address) {
  const [owners, threshold, balance] = await Promise.all([
    publicClient.multicall({
      contracts: [
        { address: accountAddress, abi: accountAbi, functionName: 'owners' },
        { address: accountAddress, abi: accountAbi, functionName: 'THRESHOLD' },
      ],
      allowFailure: false,
    }),
    publicClient.getBalance({ address: accountAddress }),
  ]).then(([results, nextBalance]) => [results[0], results[1], nextBalance] as const);

  return {
    owners: Array.from(owners as readonly Address[]),
    threshold: Number(threshold as bigint),
    balance: formatEther(balance),
  };
}

export async function readFactoryAccounts(owner: Address) {
  return publicClient.readContract({
    address: config.factoryAddress,
    abi: factoryAbi,
    functionName: 'accountsOf',
    args: [owner],
  });
}

export async function readProposal(accountAddress: Address, proposalId: number) {
  return publicClient.readContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'getProposal',
    args: [BigInt(proposalId)],
  }) as Promise<OnchainProposal>;
}

export async function readProposalCount(accountAddress: Address) {
  return publicClient.readContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'proposalCount',
  });
}

export async function readProposalBatch(accountAddress: Address, proposalIds: number[]) {
  if (proposalIds.length === 0) return [] as OnchainProposal[];
  const results = await publicClient.multicall({
    contracts: proposalIds.map((proposalId) => ({
      address: accountAddress,
      abi: accountAbi,
      functionName: 'getProposal' as const,
      args: [BigInt(proposalId)] as const,
    })),
    allowFailure: false,
  });
  return results as OnchainProposal[];
}

export async function readApproval(accountAddress: Address, proposalId: number, owner: Address) {
  return publicClient.readContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'hasApproved',
    args: [BigInt(proposalId), owner],
  });
}

export async function readApprovalBatch(accountAddress: Address, proposalIds: number[], owners: Address[]) {
  if (proposalIds.length === 0 || owners.length === 0) return [] as boolean[];
  const results = await publicClient.multicall({
    contracts: proposalIds.flatMap((proposalId) => owners.map((owner) => ({
      address: accountAddress,
      abi: accountAbi,
      functionName: 'hasApproved' as const,
      args: [BigInt(proposalId), owner] as const,
    }))),
    allowFailure: false,
  });
  return results as boolean[];
}

export async function readCanExecute(accountAddress: Address, proposalId: number) {
  const [proposal, balance] = await Promise.all([
    readProposal(accountAddress, proposalId),
    publicClient.getBalance({ address: accountAddress }),
  ]);
  return proposal.status === 0 && proposal.approvalCount >= 3n && balance >= proposal.value;
}

export function getWalletClient() {
  if (!window.ethereum) {
    throw new Error('브라우저 지갑을 찾을 수 없습니다.');
  }

  return createWalletClient({
    chain: localChain,
    transport: custom(window.ethereum),
  });
}

async function getSupportedWalletClient() {
  const walletClient = getWalletClient();
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('지갑 계정을 선택해주세요.');
  const chainId = await walletClient.getChainId();
  if (chainId !== config.chainId) {
    throw new Error(`지원 네트워크가 아닙니다. 지갑 네트워크를 Chain ID ${config.chainId}로 변경해주세요.`);
  }
  return walletClient;
}

export async function getAuthorizedWallet() {
  const walletClient = getWalletClient();
  const [account] = await walletClient.getAddresses();
  return account ?? null;
}

export async function connectWallet() {
  const walletClient = getWalletClient();
  const [address] = await walletClient.requestAddresses();
  const chainId = await walletClient.getChainId();
  if (chainId !== config.chainId) {
    throw new Error(`지원 네트워크가 아닙니다. 지갑 네트워크를 Chain ID ${config.chainId}로 변경해주세요.`);
  }
  return address;
}

async function waitForTransaction(client: WalletClient, hash: Hex) {
  await (publicClient as PublicClient).waitForTransactionReceipt({ hash });
  return hash;
}

export async function createAccount(owners: Address[]) {
  if (owners.length !== 5) throw new Error('공동계좌에는 Owner 5명이 필요합니다.');
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const { request } = await publicClient.simulateContract({
    address: config.factoryAddress,
    abi: factoryAbi,
    functionName: 'createAccount',
    args: [owners as [Address, Address, Address, Address, Address]],
    account,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'AccountCreated' });
  const log = logs[0];
  if (!log) throw new Error('AccountCreated 이벤트를 찾지 못했습니다.');
  return { hash, accountAddress: log.args.account };
}

export async function deposit(accountAddress: Address, amount: string) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.sendTransaction({
    account,
    to: accountAddress,
    value: parseEther(amount),
  });
  return waitForTransaction(walletClient, hash);
}

export async function createProposal(
  accountAddress: Address,
  recipient: Address,
  amount: string,
) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'createProposal',
    args: [recipient, parseEther(amount), '0x'],
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: accountAbi, logs: receipt.logs, eventName: 'ProposalCreated' });
  const log = logs[0];
  if (!log) throw new Error('ProposalCreated 이벤트를 찾지 못했습니다.');
  return { hash, proposalId: Number(log.args.proposalId), intentHash: log.args.intentHash };
}

export async function approveTransaction(accountAddress: Address, proposalId: number) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'approveProposal',
    args: [BigInt(proposalId)],
    account,
  });
  return waitForTransaction(walletClient, hash);
}

export async function cancelProposal(accountAddress: Address, proposalId: number) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'cancelProposal',
    args: [BigInt(proposalId)],
    account,
  });
  return waitForTransaction(walletClient, hash);
}

export async function executeTransaction(accountAddress: Address, proposalId: number) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const proposal = await readProposal(accountAddress, proposalId);
  const hash = await walletClient.writeContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'executeProposal',
    args: [BigInt(proposalId), proposal.target, proposal.value, proposal.data],
    account,
  });
  return waitForTransaction(walletClient, hash);
}

export async function executeWithPayload(
  accountAddress: Address,
  proposalId: number,
  recipient: Address,
  amount: string,
) {
  const walletClient = await getSupportedWalletClient();
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: accountAddress,
    abi: accountAbi,
    functionName: 'executeProposal',
    args: [BigInt(proposalId), recipient, parseEther(amount), '0x'],
    account,
  });
  return waitForTransaction(walletClient, hash);
}

export function makeIntentHash(
  accountAddress: Address,
  proposalId: number,
  recipient: Address,
  amount: string,
  data: Hex = '0x',
) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
      ],
      [
        accountAddress,
        BigInt(config.chainId),
        BigInt(proposalId),
        recipient,
        parseEther(amount),
        keccak256(data),
      ],
    ),
  );
}
