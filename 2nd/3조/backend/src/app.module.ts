import { AccountModule } from './account/account.module';
import { ProposalModule } from './proposal/proposal.module';
import { ProfileModule } from './profile/profile.module';
import { ActivityModule } from './activity/activity.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [AccountModule, ProposalModule, ProfileModule, ActivityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
