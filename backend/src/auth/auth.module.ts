import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { AccountModule } from '../account/account.module';
import { ChallengeModule } from '../challenge/challenge.module';

@Module({
  imports: [AccountModule, ChallengeModule],
  controllers: [AuthController],
  providers: [SupabaseAuthService],
})
export class AuthModule {}
