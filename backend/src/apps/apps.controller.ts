import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AppsService } from './apps.service';
import { RegisterGitAppDto } from './register-git-app.dto';
import { RegisterGithubAppDto } from './register-github-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { ManualDeployDto } from './manual-deploy.dto';
import { RollbackDto } from './rollback.dto';
import { ImportEnvDto, LogQueryDto, SetEnvVarDto } from './env-var.dto';

// tail จาก query (string) → จำนวนบรรทัด (default 200) ให้เซอร์วิส clamp เพดานต่ออีกที
function parseTail(raw: string | undefined, fallback = 200): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

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

  // กดกลับไป release เดิม (safety net ตอน deploy ใหม่พัง) — รัน image เดิมจาก history ไม่ rebuild
  // ต้องประกาศหลัง 'manual/deploy' ด้วยเหตุผลเดียวกับ ':id/deploy' ข้างบน
  @Post(':id/rollback')
  rollback(@Param('id') id: string, @Body() dto: RollbackDto, @Req() req: any) {
    return this.svc.rollback(id, dto.releaseId, getAccount(req));
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

  // ===== Environment variables / secrets manager =====
  // คืนแค่ key (+updatedAt) ไม่เคยส่งค่าจริงกลับ — ค่าเข้ารหัสเก็บใน store, มีผลตอน deploy ถัดไป

  @Get(':id/env')
  listEnv(@Param('id') id: string, @Req() req: any) {
    return this.svc.listEnv(id, getAccount(req));
  }

  // เพิ่ม/แก้ทีละตัว (upsert) — ตัวอื่นค่าเดิมคงอยู่ (เพราะค่าไม่เคย echo กลับ update รวมไม่ได้)
  @Post(':id/env')
  setEnv(@Param('id') id: string, @Body() dto: SetEnvVarDto, @Req() req: any) {
    return this.svc.setEnvVar(id, dto.key, dto.value, getAccount(req));
  }

  // import จากข้อความ .env ที่วางมา (merge ทับของเดิม)
  @Put(':id/env')
  importEnv(@Param('id') id: string, @Body() dto: ImportEnvDto, @Req() req: any) {
    return this.svc.importEnv(id, dto.raw, getAccount(req));
  }

  @Delete(':id/env/:key')
  deleteEnv(@Param('id') id: string, @Param('key') key: string, @Req() req: any) {
    return this.svc.deleteEnvVar(id, key, getAccount(req));
  }

  // ===== Live logs =====

  // snapshot log ล่าสุด (ไม่ follow) — { pending:true } ถ้ายังไม่มี container
  @Get(':id/logs')
  getLogs(@Param('id') id: string, @Query() q: LogQueryDto, @Req() req: any) {
    return this.svc.getLogs(id, parseTail(q.tail), getAccount(req));
  }

  // live tail — chunked text/plain ที่เปิดค้าง (follow) ปิด stream ต้นทางเมื่อ client ตัด
  @Get(':id/logs/stream')
  async logStream(
    @Param('id') id: string,
    @Query() q: LogQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // ownership check เกิดใน openLogStream (ก่อนแตะ res) — throw จะถูก exception filter จัดการปกติ
    const stream = await this.svc.openLogStream(id, parseTail(q.tail), getAccount(req as any));
    if (!stream) {
      res.status(200).type('text/plain; charset=utf-8').send('');
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // กัน nginx buffer live stream ไว้จนไม่ไหล
    res.flushHeaders?.();

    stream.text.pipe(res);
    stream.text.on('end', () => res.end());
    stream.text.on('error', () => res.end());
    // client ปิด tab / กด pause → ปิด stream กับ docker daemon กัน connection ค้าง
    req.on('close', () => stream.close());
  }
}
