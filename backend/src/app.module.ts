import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { ChallengeModule } from './challenge/challenge.module';
import { WebhookModule } from './webhook/webhook.module';
import { AppsModule } from './apps/apps.module';
import { GithubModule } from './github/github.module';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { LiveModule } from './live/live.module';
import { UsageModule } from './entitlement/usage.module';
import { NotificationModule } from './notification/notification.module';
import { ManagedDbModule } from './database/managed-db.module';
import { databaseConfig } from './common/database.config';
@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    AuditModule,
    HealthModule,
    ChallengeModule,
    WebhookModule,
    AppsModule,
    GithubModule,
    AccountModule,
    AuthModule,
    LiveModule,
    UsageModule,
    NotificationModule,
    ManagedDbModule,
  ],
})
export class AppModule {}
