import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ActivityType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from '../account/account.service';
import { ProposalService } from '../proposal/proposal.service';
import { normalizeAddress, TX_HASH } from '../common/input';
import { ActivityQuery } from './activity.dto';
// Internal boundary for verified Contract logs only; no public ingestion endpoint or indexer.
export interface ConfirmedActivity {
  accountAddress: string;
  proposalId?: string;
  type: ActivityType;
  actor?: string;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  metadata?: Prisma.InputJsonValue;
}
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
    private readonly proposals: ProposalService,
  ) {}
  async list(address: string, query: ActivityQuery, proposalId?: string) {
    if (proposalId !== undefined)
      await this.proposals.requireMetadata(address, proposalId);
    else await this.accounts.requireMetadata(address);
    const cursor = query.cursor ? BigInt(query.cursor) : undefined;
    if (cursor !== undefined && cursor > 9223372036854775807n)
      throw new BadRequestException(
        'cursor가 PostgreSQL BigInt 범위를 초과했습니다.',
      );
    const rows = await this.prisma.activity.findMany({
      where: {
        accountAddress: normalizeAddress(address),
        ...(proposalId !== undefined ? { proposalId } : {}),
        ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.size + 1,
    });
    const items = rows.slice(0, query.size);
    return {
      source: 'indexed_activity',
      blockchain: { status: 'not_configured' },
      items,
      nextCursor:
        rows.length > query.size ? items[items.length - 1].id.toString() : null,
    };
  }
  // TODO: call only from ingestion after actual Contract event definitions are confirmed.
  async storeConfirmedEvent(event: ConfirmedActivity) {
    if (
      !TX_HASH.test(event.txHash) ||
      !Number.isSafeInteger(event.logIndex) ||
      event.logIndex < 0 ||
      event.logIndex > 2147483647 ||
      event.blockNumber < 0n ||
      event.blockNumber > 9223372036854775807n
    )
      throw new BadRequestException('유효한 Contract 로그 정보가 필요합니다.');
    const accountAddress = normalizeAddress(event.accountAddress);
    await this.accounts.requireMetadata(accountAddress);
    const txHash = event.txHash.toLowerCase();
    const data = {
      ...event,
      accountAddress,
      txHash,
      actor: event.actor ? normalizeAddress(event.actor) : null,
    };
    return this.prisma.activity.upsert({
      where: { txHash_logIndex: { txHash, logIndex: event.logIndex } },
      create: data,
      update: {},
    });
  }
}
