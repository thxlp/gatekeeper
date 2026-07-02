'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cpu, Github, ChevronDown } from 'lucide-react';

export default function DeployMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono border border-border rounded-lg px-2 py-1">
        <Cpu size={12}/> Deploy <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-panel border border-border rounded-lg shadow-lg py-1 z-20">
          <Link href="/deploy" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-sub hover:text-text hover:bg-surface">
            <Cpu size={12}/> Deploy App
          </Link>
          <Link href="/apps/register" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-sub hover:text-text hover:bg-surface">
            <Github size={12}/> Git Apps
          </Link>
        </div>
      )}
    </div>
  );
}
