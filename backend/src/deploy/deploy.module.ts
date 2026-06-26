import { Module } from '@nestjs/common';
import { DeployController } from './deploy.controller';
import { DeployService } from './deploy.service';
import { ScannerService } from '../scanner/scanner.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { DependencyAuditService } from '../scanner/dependency-audit.service';

@Module({
  controllers: [DeployController],
  providers: [
    DeployService,
    ScannerService,
    DependencyAuditService,
    RiskEngineService,
    EntitlementService,
    UsageCollectorService,
    TicketService,
    AuditService,
  ],
})
export class DeployModule {}
