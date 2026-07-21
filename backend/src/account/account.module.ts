import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';
import { ApiKey } from './api-key.entity';
import { AccountsService } from './accounts.service';
import { AccountController } from './account.controller';
import { MailModule } from '../mail/mail.module';
import { ChallengeModule } from '../challenge/challenge.module';

@Module({
  imports: [TypeOrmModule.forFeature([Account, ApiKey]), MailModule, ChallengeModule],
  controllers: [AccountController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountModule {}
