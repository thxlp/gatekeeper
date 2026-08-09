'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';

// เก็บ log ในหน่วยความจำไม่เกินจำนวนนี้ (ตัดหัวทิ้ง) — กัน DOM/หน่วยความจำบวมตอน tail นานๆ
const MAX_LINES = 3000;
const TAIL_OPTIONS = [200, 500, 1000, 2000];

export default function LogsTab({ appId }: { appId: string }) {
  const { t } = useLang();
  const [lines, setLines] = useState<string[]>([]);
  const [live, setLive] = useState(true);
  const [tail, setTail] = useState(500);
  const [pending, setPending] = useState(false); // ยังไม่มี container (ยังไม่เคย deploy สำเร็จ)
  const [streamErr, setStreamErr] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  // bump = สั่ง restart stream (ปุ่มรีเฟรชตอน pause / เปลี่ยน tail)
  const [epoch, setEpoch] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const appendLines = useCallback((incoming: string[]) => {
    setLines((prev) => {
      const next = prev.concat(incoming);
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  // live stream: fetch แบบ ReadableStream แล้วอ่านทีละ chunk ตัดเป็นบรรทัด
  useEffect(() => {
    if (!live) return;
    const ctrl = new AbortController();
    let bytes = 0;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    setStreamErr('');
    setPending(false);

    (async () => {
      let res: Response;
      try {
        res = await api.logs.stream(appId, tail, ctrl.signal);
      } catch {
        return; // ถูก abort ตอน cleanup
      }
      if (!res.ok) {
        setStreamErr(t('logs.loadFailed', { status: res.status }));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch {
          break; // aborted
        }
        if (chunk.done) break;
        bytes += chunk.value.length;
        buf += dec.decode(chunk.value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        if (parts.length) appendLines(parts);
      }
      if (buf) appendLines([buf]);
      if (ctrl.signal.aborted) return; // pause/unmount — ไม่ต้องทำอะไรต่อ
      if (bytes === 0) {
        // stream ปิดทันทีโดยไม่มีข้อมูลเลย = ยังไม่มี container (ไม่ reconnect รัวๆ)
        setPending(true);
      } else {
        // stream หลุดกลางคัน (proxy timeout / container restart) — ต่อใหม่แบบไม่ล้างจอ
        reconnect = setTimeout(() => setEpoch((e) => e + 1), 1000);
      }
    })();

    return () => {
      ctrl.abort();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [appId, tail, live, epoch, appendLines, t]);

  // autoscroll ลงล่างสุดเมื่อมีบรรทัดใหม่ (ถ้าเปิด)
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const download = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* แถบควบคุม */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* สถานะ live (จุดกระพริบ) */}
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(115,169,140,.12)] px-2.5 py-1.5 text-[13px] font-semibold text-allow-text">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-allow-dot/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-allow-dot" />
            </span>
            {t('logs.live')}
          </span>
        )}
        {/* ปุ่มหลัก: สลับ live/pause */}
        <button
          onClick={() => {
            if (!live) setLines([]); // resume = เริ่มดึงใหม่ ล้างจอกันบรรทัดซ้ำจาก tail history
            setLive(!live);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
        >
          {live ? (
            <>
              <i className="ph-fill ph-pause" /> {t('logs.pause')}
            </>
          ) : (
            <>
              <i className="ph-fill ph-play" /> {t('logs.resume')}
            </>
          )}
        </button>
        {!live && (
          <button
            onClick={() => {
              setLines([]);
              setLive(true);
              setEpoch((e) => e + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
          >
            <i className="ph ph-arrow-clockwise" /> {t('logs.refresh')}
          </button>
        )}

        <div className="mx-1 h-5 w-px bg-border-alt" />

        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          {t('logs.tail')}
          <select
            value={tail}
            onChange={(e) => {
              setLines([]); // เปลี่ยนขนาดหน้าต่าง = เริ่มดึงชุดใหม่ ล้างจอกันปนของเก่า
              setTail(Number(e.target.value));
            }}
            className="rounded-md border border-border-alt bg-surface px-2 py-1 text-[13px] text-ink"
          >
            {TAIL_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          {t('logs.autoScroll')}
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setLines([])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
          >
            <i className="ph ph-eraser" /> {t('logs.clear')}
          </button>
          <button
            onClick={download}
            disabled={lines.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ph ph-download-simple" /> {t('logs.download')}
          </button>
        </div>
      </div>

      {streamErr && (
        // ลองใหม่ = เปิด stream รอบใหม่ (เหมือนกดปุ่มรีเฟรช) ไม่ต้องรีโหลดทั้งหน้า
        <ErrorBanner
          className="mb-2"
          message={streamErr}
          onRetry={() => {
            setLines([]);
            setLive(true);
            setEpoch((e) => e + 1);
          }}
        />
      )}

      {/* console — มืดทั้งสองธีม (แบบ terminal) เพื่ออ่าน log ง่ายที่สุด */}
      <div
        ref={scrollRef}
        className="h-[60vh] overflow-auto rounded-xl border border-[#33302b] bg-[#1a1917] p-4 font-mono text-[12.5px] leading-[1.55] text-[#d6d2c8]"
      >
        {pending ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[#8a857a]">
            <i className="ph ph-cloud-slash text-3xl" />
            <div className="text-[13.5px]">{t('logs.pending')}</div>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[#8a857a]">
            {live ? t('logs.waiting') : t('logs.empty')}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words">{lines.join('\n')}</pre>
        )}
      </div>

      <div className="mt-2 text-[12.5px] text-muted-3">
        {t('logs.footnote', { max: MAX_LINES.toLocaleString() })}
      </div>
    </div>
  );
}
