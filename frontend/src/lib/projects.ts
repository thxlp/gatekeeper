import { GitAppSummary } from '@/types';

// "โปรเจกต์" ในระบบตอนนี้คือทุก app ที่ลงทะเบียนไว้ (จาก /apps) ไม่ว่าจะมาจาก git webhook หรือ
// manual zip upload — ทั้งสองแบบมี id จริงของตัวเองแล้ว (ต่างจากเดิมที่ manual deploy ยังไม่มี
// identity ต่อการ upload แต่ละครั้ง เลยเคยรวมเป็น "โปรเจกต์" คงที่อันเดียวแทน)
export interface ProjectOption {
  id: string;
  label: string;
}

export function buildProjectOptions(gitApps: GitAppSummary[]): ProjectOption[] {
  return gitApps.map((a) => ({
    id: a.id,
    label: a.sourceType === 'git' ? a.repoFullName || a.id : `📦 ${a.projectName || a.id}`,
  }));
}
