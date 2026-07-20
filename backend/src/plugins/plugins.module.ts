import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';
import { PluginStore } from './plugin.store';
import { PluginEntity } from './plugin.entity';
import { ScannerService } from '../scanner/scanner.service';
import { DependencyAuditService } from '../scanner/dependency-audit.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { AuditService } from '../audit/audit.service';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
@Module({
  imports: [ChallengeModule, AccountModule, TypeOrmModule.forFeature([PluginEntity])],
  controllers: [PluginsController],
  providers: [PluginsService, PluginStore, ScannerService, DependencyAuditService, RiskEngineService, AuditService],
  exports: [PluginsService, AuditService],
})
export class PluginsModule {}
