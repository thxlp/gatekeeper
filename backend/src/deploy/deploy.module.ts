import { Module } from '@nestjs/common';
import { DeployPipelineService } from './deploy-pipeline.service';
import { DockerRuntimeService } from './docker-runtime.service';
import { GitAutomatorService } from '../webhook/git-automator.service';
import { GitAppStore } from '../apps/git-app.store';
import { ScannerService } from '../scanner/scanner.service';
import { DependencyAuditService } from '../scanner/dependency-audit.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';

// รวม provider ของ pipeline หลักไว้ที่เดียว ใช้ร่วมกันทั้ง WebhookModule (git push) และ
// AppsModule (manual zip upload) — กัน provider ซ้ำซ้อนระหว่างสองทางที่ยิงเข้า pipeline เดียวกัน
@Module({
  providers: [
    DeployPipelineService,
    DockerRuntimeService,
    GitAutomatorService,
    GitAppStore,
    ScannerService,
    DependencyAuditService,
    RiskEngineService,
    TicketService,
    AuditService,
    UsageCollectorService,
  ],
  exports: [DeployPipelineService, DockerRuntimeService, GitAutomatorService, GitAppStore, AuditService],
})
export class DeployModule {}
