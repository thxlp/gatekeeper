import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plugin } from '../common/types';
import { PluginEntity } from './plugin.entity';

@Injectable()
export class PluginStore {
  constructor(
    @InjectRepository(PluginEntity) private repo: Repository<PluginEntity>,
  ) {}

  async findAll(accountId?: string): Promise<Plugin[]> {
    const rows = await this.repo.find(
      accountId ? { where: { owner_account_id: accountId } } : {},
    );
    return rows.map((r) => this.toPlugin(r));
  }

  async findById(id: string): Promise<Plugin | undefined> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toPlugin(row) : undefined;
  }

  async save(plugin: Plugin): Promise<Plugin> {
    plugin.updated_at = new Date().toISOString();
    await this.repo.save(this.toEntity(plugin));
    return plugin;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  // undefined -> null ตรงนี้ตั้งใจ (ดูคอมเมนต์ใน plugin.entity.ts) ไม่งั้น field ที่ตั้งใจ
  // เคลียร์ (เช่น revoke() เซ็ต signature/connection_file = undefined) จะไม่ถูกเขียนทับใน DB จริง
  private toEntity(p: Plugin): PluginEntity {
    const e = new PluginEntity();
    e.id = p.id;
    e.name = p.name;
    e.description = p.description ?? null;
    e.base_url = p.base_url;
    e.auth_type = p.auth_type;
    e.auth_header = p.auth_header ?? null;
    e.endpoints = p.endpoints;
    e.owner_account_id = p.owner_account_id;
    e.project_id = p.project_id ?? null;
    e.status = p.status;
    e.risk_score = p.risk_score ?? null;
    e.findings = p.findings ?? null;
    e.signature = p.signature ?? null;
    e.connection_file = p.connection_file ?? null;
    e.created_at = p.created_at;
    e.updated_at = p.updated_at;
    e.last_verified_at = p.last_verified_at ?? null;
    e.last_handshake_at = p.last_handshake_at ?? null;
    return e;
  }

  private toPlugin(e: PluginEntity): Plugin {
    return {
      id: e.id,
      name: e.name,
      description: e.description ?? undefined,
      base_url: e.base_url,
      auth_type: e.auth_type,
      auth_header: e.auth_header ?? undefined,
      endpoints: e.endpoints,
      owner_account_id: e.owner_account_id,
      project_id: e.project_id ?? undefined,
      status: e.status,
      risk_score: e.risk_score ?? undefined,
      findings: e.findings ?? undefined,
      signature: e.signature ?? undefined,
      connection_file: e.connection_file ?? undefined,
      created_at: e.created_at,
      updated_at: e.updated_at,
      last_verified_at: e.last_verified_at ?? undefined,
      last_handshake_at: e.last_handshake_at ?? undefined,
    };
  }
}
