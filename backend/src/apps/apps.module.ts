import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { DeployModule } from '../deploy/deploy.module';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [ChallengeModule, AccountModule, DeployModule, GithubModule],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService], // ManagedDbModule ใช้ setEnvVar/deleteEnvVar ตอน attach/detach DB
})
export class AppsModule {}
