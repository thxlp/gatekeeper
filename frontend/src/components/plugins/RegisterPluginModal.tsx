'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CertifiedService, PluginEndpoint } from '@/types';
import { Plus, Trash2, X, Shield } from 'lucide-react';

interface Props {
  certified: CertifiedService[];
  onClose: () => void;
  onCreated: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export default function RegisterPluginModal({ certified, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    base_url: '',
    auth_type: 'bearer' as 'bearer' | 'api_key' | 'basic' | 'none',
    auth_header: '',
  });
  const [endpoints, setEndpoints] = useState<PluginEndpoint[]>([{ method: 'GET', path: '/', description: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useCertified, setUseCertified] = useState<CertifiedService | null>(null);

  const fillFromCertified = (svc: CertifiedService) => {
    setUseCertified(svc);
    setForm(f => ({
      ...f,
      name: svc.name,
      base_url: svc.base_url_template,
      auth_type: svc.auth_type as any,
    }));
  };

  const addEndpoint = () =>
    setEndpoints(e => [...e, { method: 'GET', path: '/', description: '' }]);

  const removeEndpoint = (i: number) =>
    setEndpoints(e => e.filter((_, j) => j !== i));

  const updateEndpoint = (i: number, field: keyof PluginEndpoint, value: string) =>
    setEndpoints(e => e.map((ep, j) => j === i ? { ...ep, [field]: value } : ep));

  const submit = async () => {
    setError('');
    if (!form.name || !form.base_url) { setError('ต้องกรอก Name และ Base URL'); return; }
    setLoading(true);
    try {
      await api.registerPlugin({ ...form, endpoints });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm p-4">
      <div className="bg-panel border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base">Register Plugin / API</h2>
          <button onClick={onClose} className="text-sub hover:text-text"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Step 1: certified shortcuts */}
          <div>
            <p className="text-xs text-sub font-mono mb-2 uppercase tracking-wider">Certified Services (Step 1)</p>
            <div className="flex flex-wrap gap-2">
              {certified.map(s => (
                <button key={s.id} onClick={() => fillFromCertified(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors
                    ${useCertified?.id === s.id
                      ? 'border-green/50 bg-green/10 text-green'
                      : 'border-border text-sub hover:border-muted hover:text-text'}`}>
                  <Shield size={10} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* basic info */}
          <div className="space-y-3">
            <Input label="Plugin Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="My API" />
            <Input label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="อธิบาย plugin นี้" />
            <Input label="Base URL *" value={form.base_url} onChange={v => setForm(f => ({ ...f, base_url: v }))} placeholder="https://api.example.com/v1" mono />
          </div>

          {/* auth */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-sub font-mono block mb-1">Auth Type</label>
              <select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: e.target.value as any }))}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                {['bearer', 'api_key', 'basic', 'none'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.auth_type !== 'none' && (
              <Input label="Auth Header (optional)" value={form.auth_header}
                onChange={v => setForm(f => ({ ...f, auth_header: v }))}
                placeholder="Authorization" mono />
            )}
          </div>

          {/* endpoints */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-sub font-mono uppercase tracking-wider">Endpoints</p>
              <button onClick={addEndpoint} className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-mono">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {endpoints.map((ep, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface rounded-lg p-2 border border-border">
                  <select value={ep.method} onChange={e => updateEndpoint(i, 'method', e.target.value)}
                    className="bg-transparent text-xs font-mono text-accent focus:outline-none w-16 shrink-0">
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input value={ep.path} onChange={e => updateEndpoint(i, 'path', e.target.value)}
                    placeholder="/path"
                    className="flex-1 bg-transparent text-xs font-mono text-text focus:outline-none min-w-0" />
                  <input value={ep.description || ''} onChange={e => updateEndpoint(i, 'description', e.target.value)}
                    placeholder="desc"
                    className="w-24 bg-transparent text-xs text-sub focus:outline-none" />
                  <button onClick={() => removeEndpoint(i)} className="text-muted hover:text-red shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between">
          <p className="text-[10px] text-sub font-mono">ระบบจะสแกนอัตโนมัติหลัง register (Step 3)</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-sub hover:text-text border border-border rounded-lg font-mono">
              Cancel
            </button>
            <button onClick={submit} disabled={loading}
              className="px-4 py-2 text-sm bg-accent text-surface rounded-lg font-mono font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors">
              {loading ? 'Registering…' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-sub font-mono block mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent placeholder:text-muted ${mono ? 'font-mono' : ''}`} />
    </div>
  );
}
