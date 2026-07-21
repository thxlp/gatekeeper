import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { AccountModule } from '../account/account.module';
import { ChallengeModule } from '../challenge/challenge.module';
import { MailModule } from '../mail/mail.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [AccountModule, ChallengeModule, MailModule, NotificationModule],
  controllers: [AuthController],
  providers: [SupabaseAuthService],
})
export class AuthModule {}
