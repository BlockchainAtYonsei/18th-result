import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from '../account/account.service';
import { ProposalService } from '../proposal/proposal.service';
import { ActivityType } from '../../generated/prisma/client';
describe('Activity event storage boundary', () => {
  it('normalizes verified log keys and uses idempotent upsert without overwriting', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 1n });
    const requireMetadata = jest.fn().mockResolvedValue({});
    const service = new ActivityService(
      { activity: { upsert } } as unknown as PrismaService,
      { requireMetadata } as unknown as AccountService,
      {} as ProposalService,
    );
    const event = {
      accountAddress: '0x' + 'AB'.repeat(20),
      actor: '0x' + 'CD'.repeat(20),
      txHash: '0x' + 'EF'.repeat(32),
      blockNumber: 1n,
      logIndex: 0,
      type: ActivityType.DEPOSIT,
    };
    await service.storeConfirmedEvent(event);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        txHash_logIndex: { txHash: event.txHash.toLowerCase(), logIndex: 0 },
      },
      create: {
        ...event,
        accountAddress: event.accountAddress.toLowerCase(),
        actor: event.actor.toLowerCase(),
        txHash: event.txHash.toLowerCase(),
      },
      update: {},
    });
    await expect(
      service.storeConfirmedEvent({ ...event, txHash: 'invalid' }),
    ).rejects.toThrow();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
