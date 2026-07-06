import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';
import { ApiKey } from './api-key.entity';
import { AccountsService } from './accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, ApiKey])],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountModule {}
