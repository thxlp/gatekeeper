import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';
import { UsageStatsService } from './usage-stats.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [ChallengeModule, AccountModule, DeployModule],
  controllers: [UsageController],
  providers: [UsageStatsService],
})
export class UsageModule {}
