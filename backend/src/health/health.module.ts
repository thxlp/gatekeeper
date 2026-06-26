import { Module, Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return { status: 'ok', version: '0.2.0', ts: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
