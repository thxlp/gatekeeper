import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account, ManagedDatabase } from '../common/types';
import { ManagedDbStore } from './managed-db.store';
import {
  DockerRuntimeService,
  managedDbConnectionInfo,
  managedDbContainerName,
} from '../deploy/docker-runtime.service';
import { AppsService } from '../apps/apps.service';
import { AuditService } from '../audit/audit.service';
import { CreateManagedDbDto } from './managed-db.dto';

@Injectable()
export class ManagedDbService {
  private readonly logger = new Logger(ManagedDbService.name);

  constructor(
    private store: ManagedDbStore,
    private docker: DockerRuntimeService,
    private apps: AppsService,
    private audit: AuditService,
  ) {}

  /** รายการ managed DB ของบัญชี พร้อมสถานะสด (inspect container) — ไม่ส่ง password */
  async list(account: Account) {
    const dbs = this.store.findAll(account.id);
    return Promise.all(dbs.map((db) => this.toClient(db)));
  }

  /** สร้าง DB ใหม่ — provision แบบ background (Railway-style) แล้วให้ UI poll สถานะต่อ */
  create(dto: CreateManagedDbDto, account: Account) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('ต้องตั้งชื่อ database');
    const now = new Date().toISOString();
    const db: ManagedDatabase = {
      id: `db_${crypto.randomBytes(8).toString('hex')}`,
      accountId: account.id,
      name,
      engine: dto.engine,
      password: crypto.randomBytes(18).toString('hex'),
      status: 'provisioning',
      attachedAppIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(db);
    this.auditLog(account, 'db:create', `${db.engine} ${name}`);
    void this.provisionInBackground(db.id);
    return this.toClient(db);
  }

  /** ลบ DB — detach จากทุกแอปก่อน (เอา env ออก) แล้วลบ container + volume (ข้อมูลหายถาวร) */
  async remove(id: string, account: Account) {
    const db = this.getOwnedOrThrow(id, account);
    for (const appId of db.attachedAppIds || []) {
      await this.removeInjectedEnv(appId, db, account).catch(() => undefined);
    }
    await this.docker.removeManagedDb(db);
    this.store.delete(db.id);
    this.auditLog(account, 'db:delete', `${db.engine} ${db.name}`);
    return { ok: true };
  }

  /** connection string เต็ม (มี password) — เจ้าของเท่านั้น, internal เท่านั้น (host = ชื่อ container) */
  connection(id: string, account: Account) {
    const db = this.getOwnedOrThrow(id, account);
    const info = managedDbConnectionInfo(db);
    return {
      url: info.url,
      host: info.host,
      port: info.port,
      envKey: info.envKey,
      username: info.username,
      dbName: info.dbName,
    };
  }

  /** attach DB กับแอป — inject connection url เป็น env (มีผล deploy ถัดไป) */
  async attach(id: string, appId: string, account: Account) {
    const db = this.getOwnedOrThrow(id, account);
    const info = managedDbConnectionInfo(db);

    // กัน env key ชนกัน: แอปเดียว attach DB engine เดียวกันได้ตัวเดียว (envKey เท่ากัน)
    const clash = this.store
      .findAll(account.id)
      .some((d) => d.id !== db.id && d.engine === db.engine && (d.attachedAppIds || []).includes(appId));
    if (clash) {
      throw new BadRequestException(
        `แอปนี้ attach ${db.engine} ตัวอื่นอยู่แล้ว (env ${info.envKey} ชนกัน) — detach ตัวเดิมก่อน`,
      );
    }

    // setEnvVar เช็ค ownership ของแอปด้วย account เดียวกัน (โยน 403/404 ถ้าไม่ใช่ของ user)
    this.apps.setEnvVar(appId, info.envKey, info.url, account);

    const set = new Set(db.attachedAppIds || []);
    set.add(appId);
    db.attachedAppIds = [...set];
    db.updatedAt = new Date().toISOString();
    this.store.save(db);
    this.auditLog(account, 'db:attach', `${db.name} → app ${appId}`);
    return this.toClient(db);
  }

  /** detach DB จากแอป — เอา env ที่ inject ไว้ออก (ถ้ายังตรงกับ url ของ DB นี้) */
  async detach(id: string, appId: string, account: Account) {
    const db = this.getOwnedOrThrow(id, account);
    await this.removeInjectedEnv(appId, db, account);
    db.attachedAppIds = (db.attachedAppIds || []).filter((a) => a !== appId);
    db.updatedAt = new Date().toISOString();
    this.store.save(db);
    this.auditLog(account, 'db:detach', `${db.name} ✕ app ${appId}`);
    return this.toClient(db);
  }

  // ===== helpers =====

  private async provisionInBackground(id: string): Promise<void> {
    try {
      const db = this.store.findById(id);
      if (!db) return;
      const res = await this.docker.provisionManagedDb(db);
      const fresh = this.store.findById(id);
      if (!fresh) return; // ถูกลบระหว่าง provision
      fresh.status = res.ok ? 'running' : 'error';
      fresh.lastError = res.ok ? undefined : res.reason;
      fresh.updatedAt = new Date().toISOString();
      this.store.save(fresh);
      if (!res.ok) this.logger.warn(`managed db ${id} provision failed: ${res.reason}`);
    } catch (err: any) {
      this.logger.warn(`managed db ${id} provision threw: ${err?.message}`);
    }
  }

  // เอา env ที่ attach ไว้ออก — best-effort (แอปอาจถูกลบ / env ถูกแก้เอง)
  private async removeInjectedEnv(appId: string, db: ManagedDatabase, account: Account): Promise<void> {
    const { envKey } = managedDbConnectionInfo(db);
    try {
      this.apps.deleteEnvVar(appId, envKey, account);
    } catch {
      /* ไม่มี env / ไม่ใช่ของ user แล้ว — ข้าม */
    }
  }

  private async toClient(db: ManagedDatabase) {
    const info = managedDbConnectionInfo(db);
    const state = await this.docker.inspectContainerState(managedDbContainerName(db.id));
    const running = state?.running ?? false;
    let status = db.status || 'provisioning';
    if (running) status = 'running';
    else if (state && !running) status = 'stopped';
    return {
      id: db.id,
      name: db.name,
      engine: db.engine,
      status,
      running,
      lastError: db.lastError,
      attachedAppIds: db.attachedAppIds || [],
      // connection แบบไม่มี password (ปุ่ม copy string เต็มเรียก endpoint แยก)
      connection: { host: info.host, port: info.port, envKey: info.envKey, username: info.username, dbName: info.dbName },
      createdAt: db.createdAt,
    };
  }

  private getOwnedOrThrow(id: string, account: Account): ManagedDatabase {
    const db = this.store.findById(id);
    if (!db) throw new NotFoundException(`managed_db_not_found:${id}`);
    if (db.accountId !== account.id) throw new ForbiddenException('not_your_database');
    return db;
  }

  private auditLog(account: Account, stage: string, detail: string): void {
    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'managed-db',
      decision: 'INFO',
      reason: `${stage}: ${detail}`,
    });
  }
}
