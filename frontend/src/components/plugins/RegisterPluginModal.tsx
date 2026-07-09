'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CertifiedService, GitAppSummary, Plugin, PluginEndpoint } from '@/types';
import { buildProjectOptions } from '@/lib/projects';

interface Props {
  certified?: CertifiedService[];
  gitApps?: GitAppSummary[];
  plugin?: Plugin; // ถ้าส่งมา = edit mode, ไม่ส่ง = register mode ปกติ
  onClose: () => void;
  onCreated: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export default function RegisterPluginModal({ certified = [], gitApps = [], plugin, onClose, onCreated }: Props) {
  const isEdit = !!plugin;
  const projectOptions = buildProjectOptions(gitApps);
  const [form, setForm] = useState({
    name: plugin?.name || '',
    description: plugin?.description || '',
    base_url: plugin?.base_url || '',
    auth_type: (plugin?.auth_type || 'bearer') as 'bearer' | 'api_key' | 'basic' | 'none',
    auth_header: plugin?.auth_header || '',
    project_id: plugin?.project_id || '',
  });
  const [endpoints, setEndpoints] = useState<PluginEndpoint[]>(
    plugin?.endpoints?.length ? plugin.endpoints : [{ method: 'GET', path: '/', description: '' }],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useCertified, setUseCertified] = useState<CertifiedService | null>(null);

  const fillFromCertified = (svc: CertifiedService) => {
    setUseCertified(svc);
    setForm((f) => ({ ...f, name: svc.name, base_url: svc.base_url_template, auth_type: svc.auth_type as any }));
  };

  const addEndpoint = () => setEndpoints((e) => [...e, { method: 'GET', path: '/', description: '' }]);
  const removeEndpoint = (i: number) => setEndpoints((e) => e.filter((_, j) => j !== i));
  const updateEndpoint = (i: number, field: keyof PluginEndpoint, value: string) =>
    setEndpoints((e) => e.map((ep, j) => (j === i ? { ...ep, [field]: value } : ep)));

  const submit = async () => {
    setError('');
    if (!form.name || !form.base_url) { setError('ต้องกรอก Name และ Base URL'); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await api.updatePlugin(plugin!.id, { ...form, endpoints });
      } else {
        await api.registerPlugin({ ...form, endpoints });
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-auth">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-ink">{isEdit ? `Edit ${plugin!.name}` : 'Register Plugin / API'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink"><i className="ph ph-x text-lg" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {!isEdit && certified.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-bold tracking-[.8px] text-muted-3">CERTIFIED SERVICES</p>
              <div className="flex flex-wrap gap-2">
                {certified.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => fillFromCertified(s)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                      useCertified?.id === s.id
                        ? 'border-allow-dot/50 bg-[rgba(115,169,140,.1)] text-allow-text'
                        : 'border-border text-ink-soft hover:border-primary/40'
                    }`}
                  >
                    <i className="ph-fill ph-seal-check" /> {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Input label="Plugin Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="My API" />
            <Input label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="อธิบาย plugin นี้" />
            <Input label="Base URL *" value={form.base_url} onChange={(v) => setForm((f) => ({ ...f, base_url: v }))} placeholder="https://api.example.com/v1" mono />
            <div>
              <div className="mb-1.5 text-xs font-semibold">Project (optional)</div>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                className="w-full rounded-lg border border-border bg-page-alt px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— ไม่ผูกโปรเจกต์ —</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold">Auth Type</div>
              <select
                value={form.auth_type}
                onChange={(e) => setForm((f) => ({ ...f, auth_type: e.target.value as any }))}
                className="w-full rounded-lg border border-border bg-page-alt px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {['bearer', 'api_key', 'basic', 'none'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {form.auth_type !== 'none' && (
              <Input label="Auth Header (optional)" value={form.auth_header} onChange={(v) => setForm((f) => ({ ...f, auth_header: v }))} placeholder="Authorization" mono />
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] font-bold tracking-[.8px] text-muted-3">ENDPOINTS</p>
              <button onClick={addEndpoint} className="flex items-center gap-1 text-[12px] font-medium text-primary">
                <i className="ph ph-plus" /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {endpoints.map((ep, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-page-alt p-2">
                  <select
                    value={ep.method}
                    onChange={(e) => updateEndpoint(i, 'method', e.target.value)}
                    className="w-16 shrink-0 bg-transparent text-[12px] font-semibold text-primary focus:outline-none"
                  >
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input
                    value={ep.path}
                    onChange={(e) => updateEndpoint(i, 'path', e.target.value)}
                    placeholder="/path"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink focus:outline-none"
                  />
                  <input
                    value={ep.description || ''}
                    onChange={(e) => updateEndpoint(i, 'description', e.target.value)}
                    placeholder="desc"
                    className="w-24 bg-transparent text-[12px] text-muted focus:outline-none"
                  />
                  <button onClick={() => removeEndpoint(i)} className="shrink-0 text-muted hover:text-danger-text">
                    <i className="ph ph-trash" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12.5px] text-danger-text">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <p className="text-[10.5px] text-muted">
            {isEdit ? 'แก้ไขแล้วระบบจะสแกนใหม่อัตโนมัติ' : 'ระบบจะสแกนอัตโนมัติหลัง register'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-[13px] text-ink-soft">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? (isEdit ? 'Saving…' : 'Registering…') : isEdit ? 'Save Changes' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-page-alt px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
