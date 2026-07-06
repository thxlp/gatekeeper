import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { GitAppStore } from '../apps/git-app.store';

@Module({
  controllers: [LiveController],
  providers: [GitAppStore],
})
export class LiveModule {}
