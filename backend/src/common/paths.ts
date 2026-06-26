import * as path from 'path';

/** Monorepo root (gatekeeper/) — parent of backend/ */
export const ROOT = process.env.GATEKEEPER_ROOT
  ? path.resolve(process.env.GATEKEEPER_ROOT)
  : path.resolve(process.cwd(), '..');

export const DATA_DIR = path.join(ROOT, 'data');
export const CONFIGS_DIR = path.join(ROOT, 'configs');
