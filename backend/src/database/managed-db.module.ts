import { Module } from '@nestjs/common';
import { ManagedDbController } from './managed-db.controller';
import { ManagedDbService } from './managed-db.service';
import { ManagedDbStore } from './managed-db.store';
import { DbQueryService } from './db-query.service';
import { RedisConsoleService } from './redis-console.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { DeployModule } from '../deploy/deploy.module';
import { AppsModule } from '../apps/apps.module';

// DeployModule → DockerRuntimeService + AuditService, AppsModule → AppsService (attach env)
// ChallengeModule/AccountModule → guards (เหมือน AppsModule)
@Module({
  imports: [ChallengeModule, AccountModule, DeployModule, AppsModule],
  controllers: [ManagedDbController],
  providers: [ManagedDbService, ManagedDbStore, DbQueryService, RedisConsoleService],
})
export class ManagedDbModule {}
