import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { ManagedDbService } from './managed-db.service';
import { DbQueryService } from './db-query.service';
import { RedisConsoleService } from './redis-console.service';
import { AttachDbDto, CreateManagedDbDto, RedisCommandDto, RunQueryDto } from './managed-db.dto';

@Controller('databases')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class ManagedDbController {
  constructor(
    private svc: ManagedDbService,
    private query: DbQueryService,
    private redis: RedisConsoleService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.list(getAccount(req));
  }

  @Post()
  create(@Body() dto: CreateManagedDbDto, @Req() req: any) {
    return this.svc.create(dto, getAccount(req));
  }

  // connection string เต็ม (มี password) — endpoint แยก ไม่ปนกับ list
  @Get(':id/connection')
  connection(@Param('id') id: string, @Req() req: any) {
    return this.svc.connection(id, getAccount(req));
  }

  @Post(':id/attach')
  attach(@Param('id') id: string, @Body() dto: AttachDbDto, @Req() req: any) {
    return this.svc.attach(id, dto.appId, getAccount(req));
  }

  @Post(':id/detach')
  detach(@Param('id') id: string, @Body() dto: AttachDbDto, @Req() req: any) {
    return this.svc.detach(id, dto.appId, getAccount(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, getAccount(req));
  }

  // ===== SQL console / table browser =====

  /** รัน SQL หนึ่งคำสั่ง — คำสั่งที่เขียนข้อมูลต้องส่ง confirm=true รอบสองถึงจะ commit */
  @Post(':id/query')
  runQuery(@Param('id') id: string, @Body() dto: RunQueryDto, @Req() req: any) {
    return this.query.runSql(id, getAccount(req), dto.sql, dto.confirm === true);
  }

  @Get(':id/tables')
  tables(@Param('id') id: string, @Req() req: any) {
    return this.query.listTables(id, getAccount(req));
  }

  // ===== redis console =====

  @Get(':id/keys')
  keys(@Param('id') id: string, @Query('cursor') cursor: string, @Query('match') match: string, @Req() req: any) {
    return this.redis.listKeys(id, getAccount(req), cursor || '0', match || '*');
  }

  @Get(':id/key')
  keyValue(@Param('id') id: string, @Query('key') key: string, @Req() req: any) {
    return this.redis.getValue(id, getAccount(req), key);
  }

  @Post(':id/redis')
  redisCommand(@Param('id') id: string, @Body() dto: RedisCommandDto, @Req() req: any) {
    return this.redis.runCommand(id, getAccount(req), dto.command, dto.confirm === true);
  }
}
