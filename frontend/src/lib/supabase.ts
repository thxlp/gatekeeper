import { createClient } from '@supabase/supabase-js';

// browser client เดียวใช้ทั้งแอป — supabase-js จัดการ session (access/refresh token)
// เก็บใน localStorage เองและ auto-detect session จาก URL ตอนกลับมาจาก OAuth redirect
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
