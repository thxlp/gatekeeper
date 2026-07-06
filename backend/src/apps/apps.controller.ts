import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AppsService } from './apps.service';
import { RegisterGitAppDto } from './register-git-app.dto';
import { RegisterGithubAppDto } from './register-github-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { ManualDeployDto } from './manual-deploy.dto';

const MAX_ARCHIVE_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — เกินนี้ multer ปฏิเสธก่อน controller เห็นด้วยซ้ำ

@Controller('apps')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class AppsController {
  constructor(private svc: AppsService) {}

  @Post('register')
  register(@Body() dto: RegisterGitAppDto, @Req() req: any) {
    return this.svc.registerGitApp(dto, getAccount(req));
  }

  // Railway-style: เลือก repo จาก picker (ต้องเชื่อม GitHub ก่อน) → สร้าง webhook ให้อัตโนมัติ
  // ผ่าน GitHub API + ยิง first deploy ทันที — ตอบเร็ว ให้ UI poll GET /apps/:id ดูสถานะ pipeline
  @Post('register-github')
  registerGithub(@Body() dto: RegisterGithubAppDto, @Req() req: any) {
    return this.svc.registerFromGithub(dto, getAccount(req));
  }

  // Manual deploy — อัปโหลด .zip ตรงๆ (แทนที่ endpoint v0.1 เดิมที่รับเป็น base64 JSON) วิ่งผ่าน
  // pipeline เดียวกับ git-webhook deploy ทุกตัวอักษร (ดู DeployPipelineService)
  @Post('manual/deploy')
  @UseInterceptors(FileInterceptor('archive', { limits: { fileSize: MAX_ARCHIVE_UPLOAD_BYTES } }))
  deployManual(
    @Body() dto: ManualDeployDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('ต้องแนบไฟล์ archive (.zip) ในฟิลด์ "archive"');
    }
    return this.svc.deployManual(dto, file, getAccount(req));
  }

  // สั่ง deploy git app ทันทีโดยไม่ต้องรอ push ใหม่ (ปุ่ม Deploy now / Redeploy บนหน้าหลัก)
  // ต้องประกาศหลัง 'manual/deploy' — ':id/deploy' เป็น wildcard จะกิน POST /apps/manual/deploy ถ้าอยู่ก่อน
  @Post(':id/deploy')
  triggerDeploy(@Param('id') id: string, @Req() req: any) {
    return this.svc.triggerGitDeploy(id, getAccount(req));
  }

  @Get()
  list(@Req() req: any) {
    return this.svc.listMyApps(getAccount(req));
  }

  // ใช้ poll สถานะ 5-stage pipeline ระหว่าง deploy กำลังวิ่งอยู่ (ต่างจาก GET / ที่ไม่ส่ง pipelineStages)
  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.svc.getAppDetail(id, getAccount(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGitAppDto, @Req() req: any) {
    return this.svc.updateGitApp(id, dto, getAccount(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.removeGitApp(id, getAccount(req));
  }
}
