'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Card, CardHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { GithubStatus } from '@/types';

function PrefRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-center justify-between opacity-60">
      <div>
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[11px] text-muted">{desc}</div>
      </div>
      <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[10px] font-semibold text-muted">
        เร็วๆ นี้
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [gh, setGh] = useState<GithubStatus | null>(null);
  const [plan, setPlan] = useState('free');

  useEffect(() => {
    api.github.status().then(setGh).catch(() => setGh({ connected: false }));
    setPlan(localStorage.getItem('gk_plan') || 'free');
  }, []);

  const disconnectGithub = async () => {
    if (!confirm('ยกเลิกการเชื่อมต่อ GitHub?')) return;
    await api.github.disconnect().catch(() => undefined);
    setGh({ connected: false });
  };

  return (
    <>
      <TopBar variant="title" title="Settings" titleIcon="ph ph-sliders" />

      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          {/* preferences — no backend endpoint for these yet, shown as coming soon */}
          <Card>
            <CardHeader title="Preferences" subtitle="ตั้งค่าการแสดงผลและพฤติกรรมของระบบ" />
            <div className="flex flex-col gap-4">
              <PrefRow title="Email Notifications" desc="รับการแจ้งเตือนเมื่อ pipeline รันล้มเหลว หรือถูกบล็อก" />
              <PrefRow title="Auto-deploy (GitHub)" desc="เปิดอยู่เสมอเมื่อเชื่อม repo ผ่าน picker — ยังไม่มีสวิตช์แยกปิด" />
            </div>
          </Card>

          {/* plan */}
          <Card>
            <CardHeader
              title="Current Plan"
              subtitle="รายละเอียดแพ็กเกจที่คุณกำลังใช้งาน"
              divider={false}
              right={
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.12)] px-3 py-[5px] text-[11.5px] font-bold text-allow-text">
                  <i className="ph-fill ph-star" /> {plan.toUpperCase()}
                </span>
              }
            />
            <div className="mt-4 border-t border-[#F0EDE6] pt-3.5">
              <div className="mb-[7px] text-[11.5px] text-muted">Allowed Runtimes</div>
              <div className="text-[13px] font-semibold">Node.js, Static</div>
            </div>
          </Card>

          {/* connected accounts */}
          <Card>
            <CardHeader title="Connected Accounts" subtitle="จัดการบัญชีผู้ให้บริการภายนอก · token เข้ารหัส AES-256-GCM" />
            {!gh && <p className="text-[12.5px] text-muted">กำลังตรวจสอบ…</p>}
            {gh && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="ph-fill ph-github-logo text-[30px]" />
                  <div>
                    <div className="text-[13px] font-semibold">GitHub</div>
                    <div className="text-[11.5px] text-muted">
                      {gh.connected ? (
                        <>Connected as <span className="font-semibold text-ink">{gh.username}</span></>
                      ) : (
                        'ยังไม่ได้เชื่อมต่อ'
                      )}
                    </div>
                  </div>
                </div>
                {gh.connected ? (
                  <button onClick={disconnectGithub} className="rounded-[7px] border border-[rgba(214,109,82,.35)] bg-surface px-3.5 py-2 text-xs font-medium text-danger-text">
                    Disconnect
                  </button>
                ) : (
                  <a href="/deploy" className="rounded-[7px] border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft">
                    เชื่อมต่อ
                  </a>
                )}
              </div>
            )}
          </Card>

          {/* security — no 2FA backend support today */}
          <Card>
            <CardHeader title="Security" subtitle="เพิ่มระดับความปลอดภัยด้วยการยืนยันตัวตนสองขั้นตอน" />
            <div className="flex items-center justify-between opacity-60">
              <div>
                <div className="text-[12.5px] font-semibold">Two-Factor Authentication (2FA)</div>
                <div className="text-[11px] text-muted">ป้องกันการเข้าถึงที่ไม่ได้รับอนุญาต แม้รหัสผ่านจะถูกขโมย</div>
              </div>
              <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[10px] font-semibold text-muted">เร็วๆ นี้</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
