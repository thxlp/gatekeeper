'use client';
import { createContext, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
    router.push('/login');
  }, [router]);

  return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
}
