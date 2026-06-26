import { Controller, Post, Body, Req, UseGuards, Get } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { DeployService, DeployDto } from './deploy.service';

@Controller()
export class DeployController {
  constructor(private svc: DeployService) {}

  @Post('deploy')
  @UseGuards(AuthGuard)
  deploy(@Body() dto: DeployDto, @Req() req: any) {
    return this.svc.handleDeploy(dto, getAccount(req));
  }
}
