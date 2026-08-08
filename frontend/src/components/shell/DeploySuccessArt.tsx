'use client';

import { useLang } from '@/lib/i18n';

// ASCII wordmark "DEPLOYED" โผล่ตอน pipeline success — reveal ทีละบรรทัดให้มีลูกเล่น
// เข้าธีม terminal ที่มีอยู่ (mono + blinking cursor + สีเขียว allow-text = success)

const ART = [
  '███  ████ ███  █    ████ █  █ ████ ███ ',
  '█  █ █    █  █ █    █  █ █  █ █    █  █',
  '█  █ ███  ███  █    █  █  ██  ███  █  █',
  '█  █ █    █    █    █  █  █   █    █  █',
  '███  ████ █    ████ ████  █   ████ ███ ',
];

export default function DeploySuccessArt() {
  const { t } = useLang();
  return (
    <div className="gk-deploy-art mt-6 overflow-hidden rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.06)] px-5 py-[18px]">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[1.5px] text-allow-text">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-allow-dot pulse-green" />
        deploy complete
      </div>

      <div className="overflow-x-auto">
        <pre aria-hidden className="w-fit select-none font-mono text-[9.5px] leading-[1.1] text-allow-text sm:text-[12.5px]">
          {ART.map((line, i) => (
            <span key={i} className="gk-art-line block" style={{ animationDelay: `${i * 85}ms` }}>
              {line}
            </span>
          ))}
        </pre>
      </div>

      <div className="mt-3 font-mono text-[12.5px] text-muted">
        <span className="mr-1.5 text-allow-text">$</span>shipped to production
        <span className="gk-cursor" />
      </div>

      <span className="sr-only">{t('deployArt.srSuccess')}</span>
    </div>
  );
}
