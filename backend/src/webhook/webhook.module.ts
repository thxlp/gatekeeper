import { Module } from '@nestjs/common';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { GitAppRegistryService } from './git-app-registry.service';
import { DeployModule } from '../deploy/deploy.module';
import { GithubModule } from '../github/github.module';
import { GitCredentialsModule } from '../git-credentials/git-credentials.module';

@Module({
  imports: [DeployModule, GithubModule, GitCredentialsModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService, GitAppRegistryService],
})
export class WebhookModule {}
