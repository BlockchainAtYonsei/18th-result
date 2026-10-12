import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { normalizeAddress } from '../common/input';
import { CreateAccountDto, UpdateAccountDto } from './account.dto';
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
  ) {}
  async list(owner?: string) {
    const addresses =
      owner === undefined
        ? undefined
        : (
            await this.blockchain.findAccountAddressesByOwner(
              normalizeAddress(owner),
            )
          ).map(normalizeAddress);
    const items = await this.prisma.accountMetadata.findMany({
      where: addresses ? { address: { in: addresses } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { address: 'asc' }],
    });
    if (addresses === undefined)
      return { ...this.blockchain.metadataContext(), items };
    return {
      ...this.blockchain.readContext(),
      items: await Promise.all(
        addresses.map(async (address) => {
          const metadata =
            items.find((item) => item.address === address) ?? null;
          const state = await this.blockchain.getAccountState(address);
          return { ...metadata, address, metadata, state };
        }),
      ),
    };
  }
  async requireMetadata(address: string) {
    const metadata = await this.prisma.accountMetadata.findUnique({
      where: { address: normalizeAddress(address) },
    });
    if (!metadata)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '공동계좌 metadata를 찾을 수 없습니다.',
      });
    return metadata;
  }
  async get(address: string) {
    return {
      ...this.blockchain.readContext(),
      state: await this.blockchain.getAccountState(address),
      metadata:
        (await this.prisma.accountMetadata.findUnique({
          where: { address: normalizeAddress(address) },
        })) ?? null,
    };
  }
  async create(dto: CreateAccountDto) {
    const data = {
      name: dto.name,
      address: normalizeAddress(dto.address),
      creator: normalizeAddress(dto.creator),
      creationTxHash: dto.creationTxHash?.toLowerCase() ?? null,
    };
    const existing = await this.prisma.accountMetadata.findUnique({
      where: { address: data.address },
    });
    if (existing) {
      if (
        existing.name === data.name &&
        existing.creator === data.creator &&
        existing.creationTxHash === data.creationTxHash
      )
        return { ...this.blockchain.metadataContext(), metadata: existing };
      throw new ConflictException({
        code: 'ACCOUNT_METADATA_CONFLICT',
        message: '다른 공동계좌 metadata가 이미 등록되어 있습니다.',
      });
    }
    return {
      ...this.blockchain.metadataContext(),
      metadata: await this.prisma.accountMetadata.create({ data }),
    };
  }
  async update(address: string, dto: UpdateAccountDto) {
    await this.requireMetadata(address);
    return {
      ...this.blockchain.metadataContext(),
      metadata: await this.prisma.accountMetadata.update({
        where: { address: normalizeAddress(address) },
        data: { name: dto.name },
      }),
    };
  }
}
