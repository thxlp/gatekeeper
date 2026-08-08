import { Module } from '@nestjs/common';
import { GitCredentialsController } from './git-credentials.controller';
import { GitCredentialApiService } from './git-credential-api.service';
import { GitCredentialStore } from './git-credential.store';
import { CloneAuthResolver } from './clone-auth.resolver';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [ChallengeModule, AccountModule, GithubModule],
  controllers: [GitCredentialsController],
  providers: [GitCredentialApiService, GitCredentialStore, CloneAuthResolver],
  exports: [GitCredentialStore, CloneAuthResolver],
})
export class GitCredentialsModule {}
