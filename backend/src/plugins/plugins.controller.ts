import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { PluginsService } from './plugins.service';
import { RegisterPluginDto, ProxyCallDto } from './plugin.dto';
@Controller('plugins')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class PluginsController {
  constructor(private svc: PluginsService) {}
  @Get('certified')
  getCertified() {
    return this.svc.getCertifiedServices();
  }
  @Get()
  getAll(@Req() req: any) {
    return this.svc.getAll(getAccount(req));
  }
  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.svc.getOne(id, getAccount(req));
  }
  @Post()
  register(@Body() dto: RegisterPluginDto, @Req() req: any) {
    return this.svc.register(dto, getAccount(req));
  }
  @Post(':id/screen')
  screen(@Param('id') id: string, @Req() req: any) {
    return this.svc.runScreening(id, getAccount(req));
  }
  @Get(':id/verify')
  verify(@Param('id') id: string, @Req() req: any) {
    return this.svc.verifyIntegrity(id, getAccount(req));
  }
  @Post(':id/handshake')
  handshake(@Param('id') id: string, @Req() req: any) {
    return this.svc.testHandshake(id, getAccount(req));
  }
  @Post(':id/proxy')
  proxy(@Param('id') id: string, @Body() dto: ProxyCallDto, @Req() req: any) {
    return this.svc.proxyCall(id, getAccount(req), dto);
  }
  @Delete(':id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @Req() req: any) {
    return this.svc.revoke(id, getAccount(req));
  }
  @Get(':id/logs')
  logs(@Param('id') id: string, @Req() req: any) {
    return this.svc.getAuditLogs(id, getAccount(req));
  }
}
