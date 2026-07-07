'use client';
import { createContext, useCallback, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Idle timeout ฝั่ง UI — ต้องตรงกับ SESSION_IDLE_MINUTES ฝั่ง backend (default 15 นาที)
// backend เป็นตัวบังคับจริง (key หมดอายุใน DB) ตัวนี้แค่พาออกจากหน้า dashboard ทันทีที่ครบเวลา
// ไม่ต้องรอให้ request ถัดไปโดน 401 ก่อน
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
// เก็บเวลาใช้งานล่าสุดใน localStorage (ไม่ใช่ ref) ให้ทุก tab แชร์กัน — tab ที่เปิดทิ้งไว้
// เฉยๆ จะไม่เตะ user ออกทั้งที่อีก tab ยังใช้งานอยู่
const LAST_ACTIVITY_KEY = 'gk_last_activity';

interface AuthContextValue {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ logout: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const logout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined);
    localStorage.removeItem('gk_api_key');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    router.push('/login');
  }, [router]);

  useEffect(() => {
    const isLoggedIn = () => !!localStorage.getItem('gk_api_key');
    const idleFor = () => Date.now() - Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());

    const idleLogout = async () => {
      await supabase.auth.signOut().catch(() => undefined);
      localStorage.removeItem('gk_api_key');
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      router.push('/login?reason=idle');
    };

    // เปิดหน้าใหม่หลังทิ้งไว้นาน: stamp เดิมค้างเกิน 15 นาที = หมดอายุแล้ว (backend ก็จะปฏิเสธ
    // key นี้อยู่ดี) เตะออกเลยแทนที่จะ stamp ทับแล้วปล่อยให้ request แรกพัง
    if (isLoggedIn() && localStorage.getItem(LAST_ACTIVITY_KEY) && idleFor() > IDLE_TIMEOUT_MS) {
      void idleLogout();
      return;
    }
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    // stamp กิจกรรมแบบ throttle — mousemove ยิงถี่มาก เขียน storage ทุกครั้งไม่จำเป็น
    let lastStamp = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastStamp < 10_000) return;
      lastStamp = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // เช็คเป็นรอบๆ แทน setTimeout ยาวๆ — เบราว์เซอร์ throttle timer ใน background tab
    // และ visibilitychange ช่วยเช็คทันทีตอนสลับกลับมาที่ tab
    const check = () => {
      if (isLoggedIn() && idleFor() > IDLE_TIMEOUT_MS) void idleLogout();
    };
    const interval = setInterval(check, IDLE_CHECK_INTERVAL_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
}
