import { Module } from '@nestjs/common';
import { PluginsModule } from './plugins/plugins.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PluginsModule, AuditModule, HealthModule],
})
export class AppModule {}
