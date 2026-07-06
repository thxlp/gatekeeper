'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * ต้อง login ก่อนถึงจะเข้า dashboard ได้ — ถ้ามี key เก็บไว้แล้วใช้เลย ถ้าไม่มีลองกู้ session
 * จาก Supabase ก่อน (เช่นเพิ่งกลับมาจาก OAuth redirect ที่ supabase-js auto-detect ให้จาก URL)
 * แล้วแลกเป็น gatekeeper api_key ผ่าน /auth/session ถ้ายังไม่มี session เลยค่อย redirect ไป /login
 * (แยกออกมาเป็น hook เพราะใช้ทั้งหน้า Projects และหน้า Plugins)
 */
export function useApiKey() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const k = localStorage.getItem('gk_api_key') || '';
    if (k) {
      setApiKey(k);
      setAuthChecked(true);
      return;
    }
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          router.replace('/login');
          return;
        }
        const res = await api.auth.syncSession(data.session.access_token);
        localStorage.setItem('gk_api_key', res.apiKey);
        setApiKey(res.apiKey);
        setAuthChecked(true);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  return { apiKey, authChecked };
}
