import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseIdentity {
  id: string;
  email: string;
}

/**
 * ตรวจ access token ที่ frontend ได้มาจาก Supabase Auth (email/password, GitHub, Google
 * ล้วนออก token แบบเดียวกันหมด — ฝั่งเราไม่ต้องสนใจว่า login มาทางไหน) โดยยิงกลับไปถาม
 * Supabase เอง (supabase.auth.getUser) แทนที่จะ decode/verify JWT เอง — ไม่ต้องมี JWT secret/JWKS
 * มาเก็บฝั่ง backend เลย ใช้แค่ anon key เดียวกับที่ frontend มีก็พอ
 */
@Injectable()
export class SupabaseAuthService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
    );
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseIdentity | null> {
    if (!accessToken) return null;
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data?.user?.id || !data.user.email) return null;
    return { id: data.user.id, email: data.user.email };
  }
}
