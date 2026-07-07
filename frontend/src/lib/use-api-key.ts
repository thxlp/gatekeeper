'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * ต้อง login ก่อนถึงจะเข้า dashboard ได้ — ถ้ามี flag "login แล้ว" เก็บไว้ก็ใช้เลย (key จริง
 * อยู่ใน httpOnly cookie แนบไปกับ fetch เองอัตโนมัติ ไม่มีให้ JS อ่าน) ถ้ายังไม่มีลองกู้ session
 * จาก Supabase ก่อน (เช่นเพิ่งกลับมาจาก OAuth redirect ที่ supabase-js auto-detect ให้จาก URL)
 * แล้วแลกเป็น gatekeeper api_key ผ่าน /auth/session ถ้ายังไม่มี session เลยค่อย redirect ไป /login
 * (แยกออกมาเป็น hook เพราะใช้ทั้งหน้า Projects และหน้า Plugins)
 */
export function useApiKey() {
  const router = useRouter();
  const [keyPrefix, setKeyPrefix] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('gk_authed')) {
      setKeyPrefix(localStorage.getItem('gk_key_prefix') || '');
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
        localStorage.setItem('gk_authed', '1');
        localStorage.setItem('gk_key_prefix', res.keyPrefix);
        setKeyPrefix(res.keyPrefix);
        setAuthChecked(true);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  return { keyPrefix, authChecked };
}
