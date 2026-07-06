'use client';
import Link from 'next/link';
import { Rocket, Share2 } from 'lucide-react';

// tab หลักของแอป: Projects (หน้า deploy แบบ Railway) กับ Plugins (กราฟ plugin เดิม)
export default function NavTabs({ active }: { active: 'projects' | 'plugins' }) {
  const base = 'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-colors';
  const on = 'bg-surface border border-border text-text';
  const off = 'text-sub hover:text-text border border-transparent';
  return (
    <nav className="flex items-center gap-1">
      <Link href="/" className={`${base} ${active === 'projects' ? on : off}`}>
        <Rocket size={12} /> Projects
      </Link>
      <Link href="/plugins" className={`${base} ${active === 'plugins' ? on : off}`}>
        <Share2 size={12} /> Plugins
      </Link>
    </nav>
  );
}
