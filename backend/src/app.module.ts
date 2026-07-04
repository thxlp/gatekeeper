import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginsModule } from './plugins/plugins.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { ChallengeModule } from './challenge/challenge.module';
import { WebhookModule } from './webhook/webhook.module';
import { AppsModule } from './apps/apps.module';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { databaseConfig } from './common/database.config';
@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    PluginsModule,
    AuditModule,
    HealthModule,
    ChallengeModule,
    WebhookModule,
    AppsModule,
    AccountModule,
    AuthModule,
  ],
})
export class AppModule {}
