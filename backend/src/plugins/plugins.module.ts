import { Module } from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';
import { PluginStore } from './plugin.store';
import { ScannerService } from '../scanner/scanner.service';
import { DependencyAuditService } from '../scanner/dependency-audit.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { ChallengeModule } from '../challenge/challenge.module';
@Module({
  imports: [ChallengeModule],
  controllers: [PluginsController],
  providers: [PluginsService, PluginStore, ScannerService, DependencyAuditService, RiskEngineService, TicketService, AuditService],
  exports: [PluginsService, AuditService],
})
export class PluginsModule {}
