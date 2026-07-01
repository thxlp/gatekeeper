import { Module } from '@nestjs/common';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { GitAppRegistryService } from './git-app-registry.service';
import { GitAutomatorService } from './git-automator.service';
import { GitAppStore } from '../apps/git-app.store';
import { ScannerService } from '../scanner/scanner.service';
import { DependencyAuditService } from '../scanner/dependency-audit.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';

@Module({
  controllers: [GithubWebhookController],
  providers: [
    GithubWebhookService,
    GitAppRegistryService,
    GitAutomatorService,
    GitAppStore,
    ScannerService,
    DependencyAuditService,
    RiskEngineService,
    TicketService,
    AuditService,
    UsageCollectorService,
  ],
})
export class WebhookModule {}
