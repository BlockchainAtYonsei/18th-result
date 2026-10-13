import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseError, ContractFunctionRevertedError, type Address } from 'viem';
import { normalizeAddress } from '../common/input';
import {
  BLOCKCHAIN_CLIENT,
  type BlockchainConnection,
} from './blockchain.client';
import { MoaFactoryAbi } from './abi/MoaFactory';
import { MoaAccountAbi } from './abi/MoaAccount';

@Injectable()
export class BlockchainService {
  private readonly verifiedAccounts = new Set<string>();
  private chainCheck?: Promise<void>;
  constructor(
    @Inject(BLOCKCHAIN_CLIENT)
    private readonly connection: BlockchainConnection,
  ) {}

  metadataContext() {
    return {
      source: 'offchain_metadata',
      blockchain: {
        status: this.connection.client ? 'configured' : 'not_configured',
      },
    };
  }
  readContext() {
    return {
      source: 'onchain_with_metadata',
      blockchain: {
        status: 'read',
        chainId: 11155111,
        factoryAddress: this.connection.factory,
      },
    };
  }
  private async ready() {
    const { client, factory, error } = this.connection;
    if (!client || !factory)
      throw new ServiceUnavailableException({
        code: error ?? 'BLOCKCHAIN_NOT_CONFIGURED',
        message: 'Blockchain 조회 설정을 확인해주세요.',
      });
    this.chainCheck ??= this.read(async () => {
      if ((await client.getChainId()) !== 11155111)
        throw new ServiceUnavailableException({
          code: 'BLOCKCHAIN_INVALID_CONFIG',
          message: 'Sepolia RPC 설정이 필요합니다.',
        });
    }).catch((error: unknown) => {
      this.chainCheck = undefined;
      throw error;
    });
    await this.chainCheck;
    return { client, factory };
  }
  private async read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const revert =
        error instanceof BaseError
          ? error.walk((item) => item instanceof ContractFunctionRevertedError)
          : undefined;
      if (
        revert instanceof ContractFunctionRevertedError &&
        revert.data?.errorName === 'ProposalNotFound'
      ) {
        throw new NotFoundException({
          code: 'PROPOSAL_NOT_FOUND',
          message: '온체인 지출 제안을 찾을 수 없습니다.',
        });
      }
      const contractFailure =
        error instanceof BaseError &&
        error.walk(
          (item) =>
            item instanceof BaseError &&
            [
              'ContractFunctionExecutionError',
              'ContractFunctionRevertedError',
              'ContractFunctionZeroDataError',
            ].includes(item.name),
        );
      throw new ServiceUnavailableException({
        code:
          contractFailure instanceof BaseError &&
          [
            'ContractFunctionExecutionError',
            'ContractFunctionRevertedError',
            'ContractFunctionZeroDataError',
          ].includes(contractFailure.name)
            ? 'BLOCKCHAIN_CONTRACT_READ_FAILED'
            : 'BLOCKCHAIN_RPC_FAILED',
        message: 'Blockchain 상태를 조회하지 못했습니다.',
      });
    }
  }
  private address(value: string): Address {
    return normalizeAddress(value) as Address;
  }
  proposalId(value: string): bigint {
    if (
      !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
      BigInt(value) > (1n << 256n) - 1n
    ) {
      throw new BadRequestException({
        code: 'INVALID_PROPOSAL_ID',
        message: 'proposalId는 uint256 십진수여야 합니다.',
      });
    }
    return BigInt(value);
  }
  async findAccountAddressesByOwner(owner: string): Promise<string[]> {
    const normalized = this.address(owner);
    const { client, factory } = await this.ready();
    const addresses = await this.read(() =>
      client.readContract({
        address: factory,
        abi: MoaFactoryAbi,
        functionName: 'accountsOf',
        args: [normalized],
      }),
    );
    return addresses.map((address) => {
      const normalized = this.address(address);
      if (this.verifiedAccounts.size >= 10_000) this.verifiedAccounts.clear();
      this.verifiedAccounts.add(normalized);
      return normalized;
    });
  }
  private async account(value: string) {
    const address = this.address(value);
    const { client, factory } = await this.ready();
    if (!this.verifiedAccounts.has(address)) {
      const valid = await this.read(() =>
        client.readContract({
          address: factory,
          abi: MoaFactoryAbi,
          functionName: 'isMoaAccount',
          args: [address],
        }),
      );
      if (!valid)
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Factory에서 생성된 MoaAccount를 찾을 수 없습니다.',
        });
      // Factory registrations are immutable. Bound memory without caching negative results.
      if (this.verifiedAccounts.size >= 10_000) this.verifiedAccounts.clear();
      this.verifiedAccounts.add(address);
    }
    return { client, address };
  }
  async getAccountState(value: string) {
    const { client, address } = await this.account(value);
    const [owners, threshold, balance, proposalCount] = await this.read(() =>
      Promise.all([
        client.readContract({
          address,
          abi: MoaAccountAbi,
          functionName: 'owners',
        }),
        client.readContract({
          address,
          abi: MoaAccountAbi,
          functionName: 'THRESHOLD',
        }),
        client.getBalance({ address }),
        client.readContract({
          address,
          abi: MoaAccountAbi,
          functionName: 'proposalCount',
        }),
      ]),
    );
    return {
      address,
      owners: owners.map(normalizeAddress),
      threshold,
      balance,
      proposalCount,
    };
  }
  async getProposalState(value: string, id: string) {
    const proposalId = this.proposalId(id);
    const { client, address } = await this.account(value);
    const proposal = await this.read(() =>
      client.readContract({
        address,
        abi: MoaAccountAbi,
        functionName: 'getProposal',
        args: [proposalId],
      }),
    );
    const status = (['Pending', 'Executed', 'Cancelled'] as const)[
      proposal.status
    ];
    if (status === undefined)
      throw new ServiceUnavailableException({
        code: 'BLOCKCHAIN_INVALID_STATE',
        message: '알 수 없는 Contract 제안 상태입니다.',
      });
    return {
      accountAddress: address,
      proposalId: id,
      ...proposal,
      proposer: normalizeAddress(proposal.proposer),
      target: normalizeAddress(proposal.target),
      status,
    };
  }
  async getProposalApprovals(
    value: string,
    id: string,
    owners?: readonly string[],
  ) {
    const proposalId = this.proposalId(id);
    const { client, address } = await this.account(value);
    const accountOwners =
      owners ?? (await this.getAccountState(address)).owners;
    return this.read(() =>
      Promise.all(
        accountOwners.map(async (owner) => ({
          owner: normalizeAddress(owner),
          approved: await client.readContract({
            address,
            abi: MoaAccountAbi,
            functionName: 'hasApproved',
            args: [proposalId, this.address(owner)],
          }),
        })),
      ),
    );
  }
  async getProposalSecurity(address: string, proposalId: string) {
    this.proposalId(proposalId);
    const account = await this.getAccountState(address);
    const proposal = await this.getProposalState(address, proposalId);
    return {
      ...this.readContext(),
      approvalCount: proposal.approvalCount,
      threshold: account.threshold,
      thresholdReached: proposal.approvalCount >= account.threshold,
      intentHash: proposal.intentHash,
      status: proposal.status,
      approvedPayload: {
        target: proposal.target,
        value: proposal.value,
        data: proposal.data,
      },
      owners: account.owners,
      approvals: await this.getProposalApprovals(
        address,
        proposalId,
        account.owners,
      ),
    };
  }
}
