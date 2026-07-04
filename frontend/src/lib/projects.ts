import { GitAppSummary } from '@/types';

// "โปรเจกต์" ในระบบมี 2 แบบ: Git App ที่ลงทะเบียน auto-deploy ผ่าน webhook (จาก /apps)
// กับ manual deploy ผ่านหน้า /deploy (v1 pipeline) ที่ไม่มี identity ต่อการ upload แต่ละครั้ง
// เลยนับรวมเป็น "โปรเจกต์" คงที่อันเดียวแทน ไม่ใช่ list แบบ dynamic เหมือน Git App
export const MANUAL_DEPLOY_PROJECT_ID = 'manual-deploy';

export interface ProjectOption {
  id: string;
  label: string;
}

export function buildProjectOptions(gitApps: GitAppSummary[]): ProjectOption[] {
  return [
    ...gitApps.map((a) => ({ id: a.id, label: a.repoFullName })),
    { id: MANUAL_DEPLOY_PROJECT_ID, label: '🚀 Manual Deploy (/deploy)' },
  ];
}
