import { Module } from '@nestjs/common';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { GitAppRegistryService } from './git-app-registry.service';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [DeployModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService, GitAppRegistryService],
})
export class WebhookModule {}
