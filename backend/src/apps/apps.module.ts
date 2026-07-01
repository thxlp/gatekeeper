import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { GitAppStore } from './git-app.store';
import { AuditService } from '../audit/audit.service';
import { ChallengeModule } from '../challenge/challenge.module';

@Module({
  imports: [ChallengeModule],
  controllers: [AppsController],
  providers: [AppsService, GitAppStore, AuditService],
})
export class AppsModule {}
