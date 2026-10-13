import { BaseError, ContractFunctionRevertedError } from 'viem';
import type { PublicClient } from 'viem';
import { BlockchainService } from './blockchain.service';
import { createBlockchainConnection } from './blockchain.client';
import { serialize } from '../common/http';

const address = '0x' + 'ab'.repeat(20);
const owners = Array.from(
  { length: 5 },
  (_, i) => '0x' + `${i + 1}`.repeat(40),
);
const proposal = {
  proposer: address,
  target: address,
  value: 9007199254740993n,
  data: '0x1234',
  intentHash: '0x' + 'cd'.repeat(32),
  approvalCount: 3n,
  status: 0,
  createdAt: 1700000000n,
};
function setup() {
  const client = {
    getChainId: jest.fn().mockResolvedValue(11155111),
    getBalance: jest.fn().mockResolvedValue(1000000000000000001n),
    readContract: jest.fn().mockImplementation(({ functionName, args }) => {
      const results: Record<string, unknown> = {
        accountsOf: [address],
        isMoaAccount: true,
        owners,
        THRESHOLD: 3n,
        proposalCount: 2n,
        getProposal: proposal,
        hasApproved: args?.[1] === owners[0],
      };
      return Promise.resolve(results[functionName]);
    }),
  };
  return {
    client,
    service: new BlockchainService({
      client: client as unknown as PublicClient,
      factory: address as `0x${string}`,
    }),
  };
}
describe('Blockchain read integration', () => {
  it('discovers accounts through Factory and reuses verified registrations', async () => {
    const { client, service } = setup();
    expect(await service.findAccountAddressesByOwner(address)).toEqual([
      address,
    ]);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'accountsOf', args: [address] }),
    );
    await service.getAccountState(address);
    expect(
      client.readContract.mock.calls.some(
        ([call]) => call.functionName === 'isMoaAccount',
      ),
    ).toBe(false);
  });
  it('maps account state and preserves native wei precision', async () => {
    const { client, service } = setup();
    expect(await service.getAccountState(address)).toEqual({
      address,
      owners,
      threshold: 3n,
      proposalCount: 2n,
      balance: 1000000000000000001n,
    });
    await service.getAccountState(address);
    expect(
      client.readContract.mock.calls.filter(
        ([call]) => call.functionName === 'isMoaAccount',
      ),
    ).toHaveLength(1);
    expect(client.getBalance).toHaveBeenCalledWith({ address });
  });
  it.each([
    [0, 'Pending'],
    [1, 'Executed'],
    [2, 'Cancelled'],
  ])('maps proposal status %s', async (status, expected) => {
    const { client, service } = setup();
    client.readContract.mockImplementation(({ functionName }) =>
      Promise.resolve(
        functionName === 'isMoaAccount' ? true : { ...proposal, status },
      ),
    );
    expect(await service.getProposalState(address, '0')).toEqual({
      ...proposal,
      status: expected,
      accountAddress: address,
      proposalId: '0',
    });
  });
  it('rejects unknown status', async () => {
    const { client, service } = setup();
    client.readContract.mockImplementation(({ functionName }) =>
      Promise.resolve(
        functionName === 'isMoaAccount' ? true : { ...proposal, status: 3 },
      ),
    );
    await expect(service.getProposalState(address, '0')).rejects.toMatchObject({
      response: { code: 'BLOCKCHAIN_INVALID_STATE' },
    });
  });
  it('maps owner approvals and security without inventing execution verdicts', async () => {
    const { service } = setup();
    const security = await service.getProposalSecurity(address, '0');
    expect(security.approvals).toEqual(
      owners.map((owner, i) => ({ owner, approved: i === 0 })),
    );
    expect(security.thresholdReached).toBe(true);
    expect(security).not.toHaveProperty('executionMatch');
    expect(serialize(security)).toMatchObject({
      approvalCount: '3',
      approvedPayload: { value: '9007199254740993', data: '0x1234' },
    });
    expect(serialize({ state: [proposal] })).toMatchObject({
      state: [{ createdAt: '1700000000', value: '9007199254740993' }],
    });
  });
  it('handles missing and invalid configuration without leaking configuration', async () => {
    for (const env of [
      {},
      { BLOCKCHAIN_RPC_URL: 'invalid', MOA_FACTORY_ADDRESS: address },
      {
        BLOCKCHAIN_RPC_URL: 'https://example.invalid',
        MOA_FACTORY_ADDRESS: 'invalid',
      },
    ]) {
      const connection = createBlockchainConnection(env);
      expect(connection.error).toBeDefined();
      await expect(
        new BlockchainService(connection).findAccountAddressesByOwner(address),
      ).rejects.toMatchObject({ response: { code: connection.error } });
    }
  });
  it('creates a read-only client from valid configuration', () => {
    const connection = createBlockchainConnection({
      BLOCKCHAIN_RPC_URL: 'https://example.invalid',
      MOA_FACTORY_ADDRESS: address,
    });
    expect(connection.client?.chain?.id).toBe(11155111);
    expect(connection.client).not.toHaveProperty('writeContract');
  });
  it('rejects the wrong chain', async () => {
    const { client, service } = setup();
    client.getChainId.mockResolvedValue(1);
    await expect(service.getAccountState(address)).rejects.toMatchObject({
      response: { code: 'BLOCKCHAIN_INVALID_CONFIG' },
    });
  });
  it('sanitizes RPC errors', async () => {
    const { client, service } = setup();
    client.getBalance.mockRejectedValue(new Error('internal endpoint secret'));
    await expect(service.getAccountState(address)).rejects.toMatchObject({
      response: {
        code: 'BLOCKCHAIN_RPC_FAILED',
        message: 'Blockchain 상태를 조회하지 못했습니다.',
      },
    });
  });
  it('sanitizes contract failures', async () => {
    const { client, service } = setup();
    const error = new BaseError('secret');
    error.name = 'ContractFunctionExecutionError';
    client.readContract.mockRejectedValue(error);
    await expect(service.getAccountState(address)).rejects.toMatchObject({
      response: { code: 'BLOCKCHAIN_CONTRACT_READ_FAILED' },
    });
  });
  it('maps ProposalNotFound revert', async () => {
    const { client, service } = setup();
    const error = new ContractFunctionRevertedError({
      abi: [
        {
          type: 'error',
          name: 'ProposalNotFound',
          inputs: [{ name: 'proposalId', type: 'uint256' }],
        },
      ],
      functionName: 'getProposal',
      data: '0x',
    });
    Object.defineProperty(error, 'data', {
      value: { errorName: 'ProposalNotFound' },
    });
    client.readContract.mockImplementation(({ functionName }) =>
      functionName === 'isMoaAccount'
        ? Promise.resolve(true)
        : Promise.reject(error),
    );
    await expect(service.getProposalState(address, '0')).rejects.toMatchObject({
      response: { code: 'PROPOSAL_NOT_FOUND' },
    });
  });
  it('rejects invalid addresses, non-accounts and invalid uint256 ids', async () => {
    const { client, service } = setup();
    await expect(service.getAccountState('invalid')).rejects.toMatchObject({
      status: 400,
    });
    for (const id of ['-1', '01', 'abc', '1.0', (1n << 256n).toString()])
      await expect(service.getProposalState(address, id)).rejects.toMatchObject(
        { response: { code: 'INVALID_PROPOSAL_ID' } },
      );
    client.readContract.mockResolvedValue(false);
    await expect(service.getAccountState(address)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_FOUND' },
    });
  });
});
