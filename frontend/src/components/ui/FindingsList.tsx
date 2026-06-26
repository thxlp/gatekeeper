'use client';
import { Finding } from '@/types';

const sevColor: Record<string, string> = {
  LOW:      'text-sub      bg-muted/30  border-muted',
  MEDIUM:   'text-yellow   bg-yellow/10 border-yellow/30',
  HIGH:     'text-red      bg-red/10    border-red/30',
  CRITICAL: 'text-red font-bold bg-red/20 border-red',
};

export default function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings?.length) return (
    <p className="text-sub text-sm font-mono">ไม่พบ finding</p>
  );
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <li key={i} className={`rounded-lg border px-3 py-2 text-xs font-mono ${sevColor[f.severity] || sevColor.LOW}`}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold">[{f.severity}]</span>
            <span className="opacity-70">{f.rule_id}</span>
            <span className="ml-auto opacity-50">{f.file}</span>
          </div>
          <div className="opacity-80">{f.description}</div>
        </li>
      ))}
    </ul>
  );
}
