import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountModule } from '../account/account.module';
import { ProposalModule } from '../proposal/proposal.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
@Module({
  imports: [PrismaModule, AccountModule, ProposalModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
