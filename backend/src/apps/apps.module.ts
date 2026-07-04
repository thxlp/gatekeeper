import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { GitAppStore } from './git-app.store';
import { AuditService } from '../audit/audit.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [ChallengeModule, AccountModule],
  controllers: [AppsController],
  providers: [AppsService, GitAppStore, AuditService],
})
export class AppsModule {}
