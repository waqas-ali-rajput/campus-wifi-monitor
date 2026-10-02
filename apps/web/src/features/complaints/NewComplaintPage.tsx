import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Paperclip } from 'lucide-react';
import { COMPLAINT_TYPES, COMPLAINT_TYPE_LABELS, complaintCreateSchema, type ComplaintType, type SpeedTestDTO } from '@campus/shared';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useLocations } from '../../api/hooks';
import { LocationPicker } from '../../components/LocationPicker';
import { Button, Card, Field, PageHeader, StatusBadge, cx } from '../../components/ui';
import { fmtAgo, fmtMbps, fmtMs, fmtPct, fmtTime } from '../../lib/format';
import { pushToast } from '../notifications/Toasts';

type Form = z.input<typeof complaintCreateSchema>;

export function NewComplaintPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const locs = useLocations();
  const [attach, setAttach] = useState(true);
  const [touchedType, setTouchedType] = useState(false);
  const [suggestion, setSuggestion] = useState<{ category: ComplaintType; confidence: number } | null>(null);
  const f = useForm<Form>({
    resolver: zodResolver(complaintCreateSchema),
    defaultValues: { location_id: sp.get('location') ?? '', complaint_type: 'slow_internet', description: '' },
  });
  const locationId = f.watch('location_id');
  const description = f.watch('description');
  const type = f.watch('complaint_type');

  const attachable = useQuery({
    queryKey: ['complaints', 'attachable', locationId],
    enabled: !!locationId,
    queryFn: () => api<{ test: SpeedTestDTO | null }>(`/complaints/attachable?location_id=${locationId}`),
  });
  const test = attachable.data?.test ?? null;

  // live AI classification while typing (debounced)
  useEffect(() => {
    if ((description ?? '').trim().length < 6) {
      setSuggestion(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ category: ComplaintType; confidence: number }>('/complaints/classify', { method: 'POST', json: { description } });
        if (r.category !== 'other') {
          setSuggestion(r);
          if (!touchedType) f.setValue('complaint_type', r.category);
        } else setSuggestion(null);
      } catch {
        /* suggestion is optional */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [description, touchedType, f]);

  const create = useApiMutation((v: Form) => api<any>('/complaints', { method: 'POST', json: v }), [['complaints'], ['dashboard'], ['locations']]);
  const submit = f.handleSubmit(async (v) => {
    try {
      const out = await create.mutateAsync({ ...v, related_test_id: attach && test ? test.test_id : null });
      pushToast({ title: 'Complaint submitted', body: `${COMPLAINT_TYPE_LABELS[out.complaint_type as ComplaintType]} at ${out.location_name}. IT support has been notified.`, tone: 'ok' });
      if (out.new_outage) pushToast({ title: out.new_outage.message, body: 'Several people reported the same problem here.', tone: 'danger' });
      nav(`/complaints/${out.complaint_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [k, m] of Object.entries(e.details)) f.setError(k as keyof Form, { message: m[0] });
      else f.setError('root', { message: e instanceof Error ? e.message : 'Could not submit' });
    }
  });

  const len = (description ?? '').length;
  return (
    <>
      <PageHeader title="Report a Wi-Fi problem" subtitle="Tell IT support what's wrong. Attaching your latest speed test gives them real numbers to work with." />
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" noValidate>
        <Card>
          <div className="space-y-5">
            <Field label="Location" error={f.formState.errors.location_id?.message} htmlFor="c-loc">
              <Controller control={f.control} name="location_id" render={({ field }) => <LocationPicker id="c-loc" locations={locs.data?.items ?? []} value={field.value || null} onChange={field.onChange} />} />
            </Field>

            <Field label="What's happening?" htmlFor="c-desc" error={f.formState.errors.description?.message} hint={<span className="num">{len} / 1000</span>}>
              <textarea id="c-desc" rows={5} className="input resize-y" placeholder="e.g. Wi-Fi disconnects every few minutes in Lab 3" maxLength={1000} {...f.register('description')} />
            </Field>

            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="label mb-0">Category</span>
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => { f.setValue('complaint_type', suggestion.category); setTouchedType(false); }}
                    className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', type === suggestion.category ? 'bg-accent-soft text-accent-ink' : 'border border-accent/40 text-accent')}
                    title="Suggested from your description"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Suggested: {COMPLAINT_TYPE_LABELS[suggestion.category]} ({Math.round(suggestion.confidence * 100)}%)
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Category">
                {COMPLAINT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => { f.setValue('complaint_type', t); setTouchedType(true); }}
                    className={cx('rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors', type === t ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-line-strong bg-white hover:border-ink-4')}
                  >
                    {COMPLAINT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            {f.formState.errors.root && <p className="text-sm text-st-critical">{f.formState.errors.root.message}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="lg" loading={create.isPending}>Submit complaint</Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Attach a speed test" subtitle="Your latest test at this location from the last 24 hours.">
            {!locationId ? (
              <p className="text-sm text-ink-3">Choose a location to see your latest test there.</p>
            ) : test ? (
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1f62c4]" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4" /> Attach my latest test at this location</span>
                  <span className={cx('mt-2 block rounded-lg border p-3 text-[13px] transition-opacity', attach ? 'border-line bg-paper/60' : 'border-dashed border-line opacity-50')}>
                    <span className="flex items-center justify-between">
                      <span className="font-medium">{test.location_name}</span>
                      <StatusBadge status={test.health_status} score={test.health_score} size="sm" />
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-ink-2">
                      <span>Download: <b className="num">{fmtMbps(test.download_speed)} Mbps</b></span>
                      <span>Upload: <b className="num">{fmtMbps(test.upload_speed)} Mbps</b></span>
                      <span>Ping: <b className="num">{fmtMs(test.ping)} ms</b></span>
                      <span>Packet loss: <b className="num">{fmtPct(test.packet_loss)}</b></span>
                    </span>
                    <span className="mt-1 block text-[12px] text-ink-4">Tested {fmtTime(test.tested_at)} · {fmtAgo(test.tested_at)}</span>
                  </span>
                </span>
              </label>
            ) : (
              <div className="text-sm text-ink-3">
                No recent test at this location.{' '}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => nav(`/?location=${locationId}`)}>Run one first</button> for faster help.
              </div>
            )}
          </Card>
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
            If several people report the same problem in the same place within 30 minutes, the system raises an outage warning for IT automatically.
          </p>
        </div>
      </form>
    </>
  );
}
