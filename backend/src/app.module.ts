import { Module } from '@nestjs/common';
import { PluginsModule } from './plugins/plugins.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { ChallengeModule } from './challenge/challenge.module';
@Module({
  imports: [PluginsModule, AuditModule, HealthModule, ChallengeModule],
})
export class AppModule {}
