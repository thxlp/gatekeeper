import { Module } from '@nestjs/common';
import { DomainController } from './domain.controller';
import { DomainProxyController } from './domain-proxy.controller';
import { DomainService } from './domain.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { DeployModule } from '../deploy/deploy.module';

// DeployModule → GitAppStore + DockerRuntimeService + AuditService
// ChallengeModule/AccountModule → guards (เฉพาะ DomainController; DomainProxyController เป็น public)
@Module({
  imports: [ChallengeModule, AccountModule, DeployModule],
  controllers: [DomainController, DomainProxyController],
  providers: [DomainService],
})
export class DomainModule {}
