import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { computeHealth, validateHealthConfig, STATUS_LABELS, STATUS_COLORS, type HealthConfig, type OutageConfig } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useSettings } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { pushToast } from '../notifications/Toasts';

function Num({ label, value, onChange, step = 1, disabled, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean; suffix?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input type="number" step={step} className="input num pr-12" value={Number.isFinite(value) ? value : ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-4">{suffix}</span>}
      </span>
    </label>
  );
}

export function ThresholdsPage() {
  const { can } = useAuth();
  const ro = !can('settings.write');
  const q = useSettings();
  const [h, setH] = useState<HealthConfig | null>(null);
  const [o, setO] = useState<OutageConfig | null>(null);
  const [sample, setSample] = useState({ d: 5.2, u: 1.8, p: 190, l: 10, c: 0, f: 0 });
  useEffect(() => {
    if (q.data && !h) {
      setH(structuredClone(q.data['health.config']));
      setO(structuredClone(q.data['outage.config']));
    }
  }, [q.data, h]);
  const saveH = useApiMutation((v: HealthConfig) => api('/admin/settings/health.config', { method: 'PUT', json: v }), [['admin', 'settings'], ['locations'], ['dashboard']]);
  const saveO = useApiMutation((v: OutageConfig) => api('/admin/settings/outage.config', { method: 'PUT', json: v }), [['admin', 'settings']]);

  if (!h || !o) return <QueryState q={q}><span /></QueryState>;
  const saved: HealthConfig = q.data['health.config'];
  const errors = validateHealthConfig(h);
  const metrics = { downloadMbps: sample.d, uploadMbps: sample.u, pingMs: sample.p, lossPct: sample.l };
  const ctx = { recentOpenComplaints: sample.c, recentFailures: sample.f };
  const draftR = errors.length ? null : computeHealth(metrics, ctx, h);
  const savedR = computeHealth(metrics, ctx, saved);
  const setW = (k: keyof HealthConfig['weights'], v: number) => setH({ ...h, weights: { ...h.weights, [k]: v } });
  const setB = (k: keyof HealthConfig['bands'], v: number) => setH({ ...h, bands: { ...h.bands, [k]: v } });
  const wsum = h.weights.download + h.weights.upload + h.weights.ping + h.weights.loss;

  return (
    <>
      <PageHeader
        title="Network health thresholds"
        subtitle="How raw measurements become a 0–100 score and a status, and when an outage warning is raised."
        actions={ro ? <Badge>Read only for your role</Badge> : <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setH(structuredClone(q.data.defaults['health.config'])); setO(structuredClone(q.data.defaults['outage.config'])); }}>Restore defaults</Button>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Score weights" subtitle={<span>Must add up to 1. Currently <b className={Math.abs(wsum - 1) > 0.001 ? 'text-st-critical' : 'text-st-excellent'}>{wsum.toFixed(2)}</b></span>}>
            <div className="space-y-3">
              {(['download', 'upload', 'ping', 'loss'] as const).map((k) => (
                <div key={k} className="grid grid-cols-[96px_1fr_70px] items-center gap-3">
                  <span className="text-sm capitalize text-ink-2">{k === 'loss' ? 'Packet loss' : k}</span>
                  <input type="range" min={0} max={0.6} step={0.05} value={h.weights[k]} disabled={ro} onChange={(e) => setW(k, Number(e.target.value))} className="accent-[#1f62c4]" aria-label={`${k} weight`} />
                  <span className="num text-right text-sm font-medium">{Math.round(h.weights[k] * 100)}%</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Status bands" subtitle="Minimum score for each status. Below Poor is Critical.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['excellent', 'good', 'fair', 'poor'] as const).map((k) => <Num key={k} label={STATUS_LABELS[k]} value={h.bands[k]} disabled={ro} onChange={(v) => setB(k, v)} />)}
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-hidden>
              {[['critical', h.bands.poor], ['poor', h.bands.fair - h.bands.poor], ['fair', h.bands.good - h.bands.fair], ['good', h.bands.excellent - h.bands.good], ['excellent', 100 - h.bands.excellent]].map(([s, w]) => (
                <span key={s as string} style={{ width: `${Math.max(0, w as number)}%`, background: STATUS_COLORS[s as keyof typeof STATUS_COLORS] }} />
              ))}
            </div>
          </Card>
          <Card title="Measurement ranges">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Num label="Download for 100 pts" suffix="Mbps" value={h.caps.downloadMbps} disabled={ro} onChange={(v) => setH({ ...h, caps: { ...h.caps, downloadMbps: v } })} />
              <Num label="Upload for 100 pts" suffix="Mbps" value={h.caps.uploadMbps} disabled={ro} onChange={(v) => setH({ ...h, caps: { ...h.caps, uploadMbps: v } })} />
              <Num label="Best ping" suffix="ms" value={h.ping.best} disabled={ro} onChange={(v) => setH({ ...h, ping: { ...h.ping, best: v } })} />
              <Num label="Worst ping" suffix="ms" value={h.ping.worst} disabled={ro} onChange={(v) => setH({ ...h, ping: { ...h.ping, worst: v } })} />
              <Num label="Worst packet loss" suffix="%" value={h.loss.worst} disabled={ro} onChange={(v) => setH({ ...h, loss: { ...h.loss, worst: v } })} />
              <Num label="Points per open complaint" value={h.penalty.perComplaint} step={0.5} disabled={ro} onChange={(v) => setH({ ...h, penalty: { ...h.penalty, perComplaint: v } })} />
              <Num label="Points per failed test" value={h.penalty.perFailure} step={0.5} disabled={ro} onChange={(v) => setH({ ...h, penalty: { ...h.penalty, perFailure: v } })} />
              <Num label="Location window" suffix="min" value={h.location.windowMinutes} disabled={ro} onChange={(v) => setH({ ...h, location: { ...h.location, windowMinutes: v } })} />
              <Num label="Stale after" suffix="h" value={h.location.staleHours} disabled={ro} onChange={(v) => setH({ ...h, location: { ...h.location, staleHours: v } })} />
            </div>
          </Card>
          {errors.length > 0 && <div className="rounded-lg border border-[#f3b7b7] bg-[#fdf3f3] px-4 py-3 text-sm text-[#7f1515]">{errors.map((e) => <p key={e}>{e}</p>)}</div>}
          {!ro && (
            <Button icon={<Save className="h-4 w-4" />} disabled={errors.length > 0} loading={saveH.isPending} onClick={async () => {
              try { await saveH.mutateAsync(h); pushToast({ title: 'Health thresholds saved', body: 'Location statuses were recalculated.', tone: 'ok' }); } catch (e) { pushToast({ title: 'Not saved', body: e instanceof ApiError ? e.message : undefined, tone: 'danger' }); }
            }}>Save health thresholds</Button>
          )}

          <Card title="Outage warning rules">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Num label="Users with same complaint" value={o.r1.minUsers} disabled={ro} onChange={(v) => setO({ ...o, r1: { ...o.r1, minUsers: v } })} />
              <Num label="…within" suffix="min" value={o.r1.windowMinutes} disabled={ro} onChange={(v) => setO({ ...o, r1: { ...o.r1, windowMinutes: v } })} />
              <Num label="Unreachable failures" value={o.r2.minFailures} disabled={ro} onChange={(v) => setO({ ...o, r2: { ...o.r2, minFailures: v } })} />
              <Num label="…within" suffix="min" value={o.r2.windowMinutes} disabled={ro} onChange={(v) => setO({ ...o, r2: { ...o.r2, windowMinutes: v } })} />
              <Num label="Consecutive critical tests" value={o.r3.consecutiveCritical} disabled={ro} onChange={(v) => setO({ ...o, r3: { consecutiveCritical: v } })} />
              <Num label="Good tests to recover" value={o.recovery.consecutiveGood} disabled={ro} onChange={(v) => setO({ ...o, recovery: { ...o.recovery, consecutiveGood: v } })} />
            </div>
            {!ro && (
              <Button className="mt-4" variant="secondary" icon={<Save className="h-4 w-4" />} loading={saveO.isPending} onClick={async () => {
                try { await saveO.mutateAsync(o); pushToast({ title: 'Outage rules saved', tone: 'ok' }); } catch (e) { pushToast({ title: 'Not saved', body: e instanceof ApiError ? e.message : undefined, tone: 'danger' }); }
              }}>Save outage rules</Button>
            )}
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card title="Test a sample input" subtitle="Uses the same scoring function as the server.">
            <div className="grid grid-cols-2 gap-3">
              <Num label="Download" suffix="Mbps" step={0.1} value={sample.d} onChange={(v) => setSample({ ...sample, d: v })} />
              <Num label="Upload" suffix="Mbps" step={0.1} value={sample.u} onChange={(v) => setSample({ ...sample, u: v })} />
              <Num label="Ping" suffix="ms" value={sample.p} onChange={(v) => setSample({ ...sample, p: v })} />
              <Num label="Packet loss" suffix="%" step={0.5} value={sample.l} onChange={(v) => setSample({ ...sample, l: v })} />
              <Num label="Open complaints" value={sample.c} onChange={(v) => setSample({ ...sample, c: v })} />
              <Num label="Recent failures" value={sample.f} onChange={(v) => setSample({ ...sample, f: v })} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[['Computer Lab 2', { d: 36, u: 14, p: 28, l: 1 }], ['Library Floor 2', { d: 5.2, u: 1.8, p: 190, l: 10 }], ['Fibre-like', { d: 100, u: 50, p: 10, l: 0 }]].map(([n, v]) => (
                <button key={n as string} className="rounded-full border border-line-strong px-2.5 py-0.5 text-[12.5px] hover:border-accent hover:text-accent" onClick={() => setSample({ ...sample, ...(v as object) })}>{n as string}</button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[['With your changes', draftR], ['Currently saved', savedR]].map(([label, r]) => (
                <div key={label as string} className="rounded-xl border border-line p-3 text-center">
                  <div className="text-[12px] text-ink-3">{label as string}</div>
                  {r ? (
                    <>
                      <div className="font-cond text-[40px] font-semibold leading-tight num">{(r as ReturnType<typeof computeHealth>).healthScore.toFixed(1)}</div>
                      <StatusBadge status={(r as ReturnType<typeof computeHealth>).status} />
                    </>
                  ) : <div className="py-6 text-[13px] text-st-critical">Fix the errors</div>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
