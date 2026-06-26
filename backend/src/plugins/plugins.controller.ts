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
import { PluginsService } from './plugins.service';
import { RegisterPluginDto, ProxyCallDto } from './plugin.dto';

@Controller('plugins')
@UseGuards(AuthGuard)
export class PluginsController {
  constructor(private svc: PluginsService) {}

  // Step 1
  @Get('certified')
  getCertified() {
    return this.svc.getCertifiedServices();
  }

  // list all owned plugins
  @Get()
  getAll(@Req() req: any) {
    return this.svc.getAll(getAccount(req));
  }

  // get single
  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.svc.getOne(id, getAccount(req));
  }

  // Step 2: register
  @Post()
  register(@Body() dto: RegisterPluginDto, @Req() req: any) {
    return this.svc.register(dto, getAccount(req));
  }

  // Step 3: re-trigger screening manually
  @Post(':id/screen')
  screen(@Param('id') id: string, @Req() req: any) {
    return this.svc.runScreening(id, getAccount(req));
  }

  // Step 6: verify integrity
  @Get(':id/verify')
  verify(@Param('id') id: string, @Req() req: any) {
    return this.svc.verifyIntegrity(id, getAccount(req));
  }

  // Step 7: test handshake
  @Post(':id/handshake')
  handshake(@Param('id') id: string, @Req() req: any) {
    return this.svc.testHandshake(id, getAccount(req));
  }

  // Step 8: secure proxy call
  @Post(':id/proxy')
  proxy(@Param('id') id: string, @Body() dto: ProxyCallDto, @Req() req: any) {
    return this.svc.proxyCall(id, getAccount(req), dto);
  }

  // Step 9: revoke
  @Delete(':id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @Req() req: any) {
    return this.svc.revoke(id, getAccount(req));
  }

  // Step 10: audit logs
  @Get(':id/logs')
  logs(@Param('id') id: string, @Req() req: any) {
    return this.svc.getAuditLogs(id, getAccount(req));
  }
}
