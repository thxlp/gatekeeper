'use client';

import { useEffect } from 'react';

// หมวด template ตรงกับ runtime ที่ pipeline รองรับ (node/python/static/docker)
// zip ถูก generate จาก frontend/starters/ ด้วย scripts/build-starters.js
interface StarterCategory {
  key: string;
  icon: string;
  title: string;
  desc: string;
}

const categories: StarterCategory[] = [
  {
    key: 'node',
    icon: 'ph ph-file-js',
    title: 'Node.js (Express)',
    desc: 'เว็บ/API ด้วย JavaScript — ไม่ต้องเขียน Dockerfile เอง',
  },
  {
    key: 'python',
    icon: 'ph ph-file-py',
    title: 'Python (FastAPI)',
    desc: 'API ด้วย Python — มี main.py + requirements.txt ก็พอ',
  },
  {
    key: 'static',
    icon: 'ph ph-browser',
    title: 'Static site',
    desc: 'HTML/CSS/JS ธรรมดา หรือ SPA ที่ build แล้ว',
  },
  {
    key: 'docker',
    icon: 'ph ph-shipping-container',
    title: 'Docker',
    desc: 'มี Dockerfile เอง — ใช้ได้ทุกภาษา ทุกเฟรมเวิร์ก',
  },
];

export default function StarterFilesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ไฟล์เริ่มงาน"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <div className="text-sm font-bold text-ink">ไฟล์เริ่มงาน</div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-ink"
          >
            <i className="ph ph-x text-base" />
          </button>
        </div>
        <p className="mb-4 text-[13.5px] text-muted">
          เลือกประเภทงานแล้วโหลดไฟล์ตั้งต้น — <b>Starter</b> คือโปรเจคตัวอย่างที่ deploy
          ได้ทันที ส่วน <b>ไฟล์ deploy</b> คือชุดไฟล์สำหรับเอาไปใส่ในโปรเจคที่มีอยู่แล้ว
        </p>

        <div className="flex flex-col gap-2.5">
          {categories.map((c) => (
            <div key={c.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2.5">
                <i className={`${c.icon} text-xl text-primary`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold text-ink">{c.title}</div>
                  <div className="text-[13px] text-muted">{c.desc}</div>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                <a
                  href={`/starters/${c.key}-starter.zip`}
                  download
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[13.5px] font-semibold text-white hover:opacity-90"
                >
                  <i className="ph ph-download-simple" />
                  Starter เต็ม
                </a>
                <a
                  href={`/starters/${c.key}-deploy-files.zip`}
                  download
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13.5px] font-semibold text-ink hover:bg-[rgba(0,0,0,.04)]"
                >
                  <i className="ph ph-download-simple" />
                  ไฟล์ deploy
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
