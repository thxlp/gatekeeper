import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from '../common/types';
import { DATA_DIR } from '../common/paths';

@Injectable()
export class PluginStore {
  private storePath: string;
  private plugins: Map<string, Plugin> = new Map();

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.storePath = path.join(DATA_DIR, 'plugins.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
      for (const p of raw) this.plugins.set(p.id, p);
    } catch {
      // ยังไม่มีไฟล์ — เริ่มจาก empty store
    }
  }

  private persist(): void {
    fs.writeFileSync(this.storePath, JSON.stringify([...this.plugins.values()], null, 2), 'utf8');
  }

  findAll(accountId?: string): Plugin[] {
    const all = [...this.plugins.values()];
    return accountId ? all.filter((p) => p.owner_account_id === accountId) : all;
  }

  findById(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  save(plugin: Plugin): Plugin {
    plugin.updated_at = new Date().toISOString();
    this.plugins.set(plugin.id, plugin);
    this.persist();
    return plugin;
  }

  delete(id: string): boolean {
    const existed = this.plugins.has(id);
    this.plugins.delete(id);
    this.persist();
    return existed;
  }
}
