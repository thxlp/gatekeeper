'use client';

import { Finding } from '@/types';
import { Pill } from './primitives';
import { useLang } from '@/lib/i18n';

const sevKind: Record<Finding['severity'], 'allow' | 'warn' | 'danger'> = {
  LOW: 'allow',
  MEDIUM: 'warn',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export default function FindingsList({ findings }: { findings: Finding[] }) {
  const { t } = useLang();
  if (!findings?.length) return <p className="text-sm text-muted">{t('findings.none')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {findings.map((f, i) => (
        <li key={i} className="rounded-lg border border-border bg-page-alt px-3 py-2 text-xs">
          <div className="mb-0.5 flex items-center gap-2">
            <Pill kind={sevKind[f.severity]}>{f.severity}</Pill>
            <span className="font-mono text-muted-3">{f.rule_id}</span>
            <span className="ml-auto font-mono text-muted-3">{f.file}</span>
          </div>
          <div className="text-ink-soft">{f.description}</div>
        </li>
      ))}
    </ul>
  );
}
