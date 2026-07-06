import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [ChallengeModule, AccountModule, DeployModule],
  controllers: [AppsController],
  providers: [AppsService],
})
export class AppsModule {}
