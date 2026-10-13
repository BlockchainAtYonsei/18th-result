import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountModule } from '../account/account.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';
@Module({
  imports: [PrismaModule, AccountModule, BlockchainModule],
  controllers: [ProposalController],
  providers: [ProposalService],
  exports: [ProposalService],
})
export class ProposalModule {}
