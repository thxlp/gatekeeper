import { Module } from '@nestjs/common';
import { GithubController } from './github.controller';
import { GithubApiService } from './github-api.service';
import { GithubTokenStore } from './github-token.store';
import { ChallengeModule } from '../challenge/challenge.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [ChallengeModule, AccountModule],
  controllers: [GithubController],
  providers: [GithubApiService, GithubTokenStore],
  exports: [GithubApiService, GithubTokenStore],
})
export class GithubModule {}
