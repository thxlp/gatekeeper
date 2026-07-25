'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Card, CardHeader } from '@/components/ui/primitives';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <div className="rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] text-muted">{value}</div>
    </div>
  );
}

export default function AccountPage() {
  const { logout } = useAuth();
  const [email, setEmail] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    setEmail(localStorage.getItem('gk_email') || '');
    setKeyPrefix(localStorage.getItem('gk_key_prefix') || '');
  }, []);

  const updatePassword = async () => {
    setPwError('');
    setPwSuccess(false);
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      setPwError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('รหัสผ่านไม่ตรงกัน');
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPwSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setPwError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      <TopBar
        variant="title"
        title="Account Profile"
        titleIcon="ph ph-user-circle"
        right={
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[14.5px] font-medium text-danger-text"
          >
            <i className="ph ph-sign-out" /> Logout
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <Card>
            <CardHeader title="Account" subtitle="ข้อมูลบัญชีของคุณ · sync กับ Supabase Auth" />
            <ReadonlyField label="Email Address" value={email} />
          </Card>

          <Card>
            <CardHeader title="Change Password" subtitle="อัปเดตรหัสผ่านเพื่อความปลอดภัยของบัญชี" />
            <div className="mb-3.5 grid grid-cols-2 gap-3.5">
              <div>
                <div className="mb-1.5 text-xs font-semibold">New Password</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold">Confirm Password</div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            {pwError && (
              <div className="mb-3.5 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14px] text-danger-text">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="mb-3.5 rounded-md border border-allow-dot/30 bg-[rgba(115,169,140,.08)] px-3 py-2 text-[14px] text-allow-text">
                อัปเดตรหัสผ่านสำเร็จ
              </div>
            )}
            <button
              onClick={updatePassword}
              disabled={pwLoading || !newPassword}
              className="flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[14.5px] font-semibold text-ink disabled:opacity-50"
            >
              <i className="ph ph-key" /> {pwLoading ? 'กำลังอัปเดต…' : 'Update Password'}
            </button>
          </Card>

          {/* api key — เห็นได้แค่ prefix ของอุปกรณ์นี้ (ค่าเต็มไปทาง httpOnly cookie เท่านั้น
              ไม่มี endpoint แสดงรายการ key ทั้งหมดของบัญชี ณ ตอนนี้) */}
          <Card>
            <CardHeader title="API Key" subtitle="ใช้เชื่อมต่อ/deploy ผ่าน CLI · ระบบเก็บเป็น SHA-256 hash เท่านั้น" />
            <div className="flex items-center justify-between rounded-lg border border-border bg-page-alt px-3 py-[9px]">
              <span className="font-mono text-xs text-ink-soft">{keyPrefix || '—'}••••••••••••••••••••••••</span>
              <span className="rounded-[5px] bg-[rgba(74,144,226,.08)] px-1.5 py-0.5 text-[11.5px] font-bold text-primary">อุปกรณ์นี้</span>
            </div>
          </Card>

          {/* danger zone — ไม่มี endpoint ลบบัญชีในระบบตอนนี้ */}
          <Card className="border-[rgba(214,109,82,.35)]">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5 text-danger-text">
                  <i className="ph ph-warning" /> Danger Zone
                </span>
              }
              subtitle="การตั้งค่าที่อาจส่งผลกระทบอย่างถาวรต่อบัญชี"
            />
            <div className="flex items-center justify-between opacity-60">
              <div>
                <div className="text-[14.5px] font-semibold">Delete Account</div>
                <div className="text-[13px] text-muted">ลบโปรเจกต์และข้อมูลทั้งหมดอย่างถาวร ไม่สามารถกู้คืนได้</div>
              </div>
              <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[12px] font-semibold text-muted">เร็วๆ นี้</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
