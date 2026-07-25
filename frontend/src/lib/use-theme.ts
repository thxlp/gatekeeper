'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gk_theme';

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}

function apply(pref: ThemePref) {
  document.documentElement.classList.toggle('dark', resolve(pref) === 'dark');
}

// Mirrors the inline no-flash script in layout.tsx — keep both in sync.
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) || 'system';
    setPref(stored);
    setResolved(resolve(stored));

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) || 'system';
      if (current === 'system') {
        apply('system');
        setResolved(resolve('system'));
      }
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  const setTheme = useCallback((next: ThemePref) => {
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setPref(next);
    setResolved(resolve(next));
  }, []);

  return { theme: pref, resolved, setTheme };
}
