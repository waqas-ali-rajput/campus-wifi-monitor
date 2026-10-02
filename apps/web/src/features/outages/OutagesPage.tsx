import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2, Wrench } from 'lucide-react';
import { OUTAGE_RULE_LABELS, maintenanceSchema } from '@campus/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useLocations, useMaintenance, useOutages } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, QueryState } from '../../components/ui';
import { fmtAgo, fmtDateTime, toLocalInput } from '../../lib/format';
import { pushToast } from '../notifications/Toasts';

function duration(from: string, to: string | null) {
  const m = Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function OutagesPage() {
  const { can, user } = useAuth();
  const active = useOutages('active');
  const resolved = useOutages('resolved');
  const maint = useMaintenance();
  const [open, setOpen] = useState(false);
  const resolve = useApiMutation((id: string) => api(`/outages/${id}/resolve`, { method: 'POST' }), [['outages'], ['dashboard'], ['locations']]);
  const del = useApiMutation((id: string) => api(`/maintenance/${id}`, { method: 'DELETE' }), [['maintenance'], ['locations']]);
  const staff = can('outages.resolve');

  return (
    <>
      <PageHeader
        title="Outages & maintenance"
        subtitle="Outage warnings are raised automatically when many people report the same problem in one place, tests keep failing, or results stay critical."
        actions={can('maintenance.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Schedule maintenance</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Active outages" pad={false}>
            <QueryState q={active} empty={!active.data?.items.length && <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-st-excellent" />} title="No active outages" body="Every location is reachable right now." />}>
              <ul>
                {active.data?.items.map((o) => (
                  <li key={o.outage_id} className="flex flex-wrap items-start gap-3 border-b border-line/70 px-4 py-4 last:border-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fdeaea] text-st-critical"><AlertTriangle className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#7f1515]">{o.message}</div>
                      <div className="text-[13.5px] text-ink-2">{o.location_name} · since {fmtDateTime(o.detected_at)} ({duration(o.detected_at, null)})</div>
                      {o.explanation && <div className="mt-1 text-[13px] text-ink-3">Why: {o.explanation}.</div>}
                      {o.cause_rule && <Badge className="mt-2">{OUTAGE_RULE_LABELS[o.cause_rule]}</Badge>}
                    </div>
                    {staff && (
                      <Button size="sm" variant="secondary" loading={resolve.isPending} onClick={async () => { await resolve.mutateAsync(o.outage_id); pushToast({ title: `Outage at ${o.location_name} resolved`, tone: 'ok' }); }}>
                        Mark resolved
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </QueryState>
          </Card>
          <Card title="Resolved outages" pad={false}>
            <QueryState q={resolved} empty={!resolved.data?.items.length && <EmptyState title="No past outages" />}>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Location</th><th>Detected</th><th>Duration</th>{staff && <th>Cause</th>}{staff && <th>Resolved by</th>}</tr></thead>
                  <tbody>
                    {resolved.data?.items.map((o) => (
                      <tr key={o.outage_id}>
                        <td><div className="font-medium">{o.location_name}</div><div className="text-[12px] text-ink-3">{o.building}</div></td>
                        <td className="whitespace-nowrap">{fmtDateTime(o.detected_at)}</td>
                        <td className="num whitespace-nowrap">{duration(o.detected_at, o.resolved_at)}</td>
                        {staff && <td className="text-ink-2">{o.explanation || OUTAGE_RULE_LABELS[o.cause_rule ?? 'manual']}</td>}
                        {staff && <td className="text-ink-2">{o.resolved_by_name ?? 'Automatic recovery'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryState>
          </Card>
        </div>
        <Card title="Maintenance windows" subtitle="Planned work. New outages are not raised while maintenance covers a location." pad={false}>
          <QueryState q={maint} empty={!maint.data?.items.length && <EmptyState icon={<Wrench className="h-5 w-5" />} title="No maintenance planned" />}>
            <ul>
              {maint.data?.items.map((m) => (
                <li key={m.maintenance_id} className="border-b border-line/70 px-4 py-3.5 last:border-0">
                  <div className="flex items-start gap-2">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c00]" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-[13px] text-ink-2">{m.location_name ?? 'Whole campus'}</div>
                      <div className="text-[12.5px] text-ink-3">{fmtDateTime(m.starts_at)} – {fmtDateTime(m.ends_at)}</div>
                      {m.notes && <div className="mt-1 text-[13px] text-ink-3">{m.notes}</div>}
                    </div>
                    {m.is_active ? <Badge tone="warn">In progress</Badge> : Date.parse(m.ends_at) < Date.now() ? <Badge>Ended</Badge> : <Badge tone="accent">{fmtAgo(m.starts_at)}</Badge>}
                    {staff && (m.created_by === user?.user_id || can('locations.manage')) && (
                      <button className="rounded p-1 text-ink-4 hover:bg-paper hover:text-st-critical" aria-label={`Delete ${m.title}`} onClick={() => del.mutate(m.maintenance_id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </QueryState>
        </Card>
      </div>
      <MaintenanceModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type MForm = z.input<typeof maintenanceSchema>;
export function MaintenanceModal({ open, onClose, locationId }: { open: boolean; onClose: () => void; locationId?: string }) {
  const locs = useLocations();
  const now = new Date();
  const f = useForm<MForm>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { location_id: locationId ?? '', title: '', notes: '', starts_at: toLocalInput(new Date(now.getTime() + 3600000)), ends_at: toLocalInput(new Date(now.getTime() + 3 * 3600000)) },
  });
  const create = useApiMutation((v: MForm) => api('/maintenance', { method: 'POST', json: v }), [['maintenance'], ['locations'], ['notifications']]);
  const submit = f.handleSubmit(async (v) => {
    try {
      await create.mutateAsync({ ...v, location_id: v.location_id || null, starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString() });
      pushToast({ title: 'Maintenance scheduled', body: 'Everyone has been notified.', tone: 'ok' });
      f.reset();
      onClose();
    } catch (e) {
      f.setError('root', { message: e instanceof ApiError ? e.message : 'Could not save' });
    }
  });
  return (
    <Modal open={open} onClose={onClose} title="Schedule maintenance">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Location">
          <select className="input" {...f.register('location_id')}>
            <option value="">Whole campus</option>
            {locs.data?.items.map((l) => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
          </select>
        </Field>
        <Field label="Title" error={f.formState.errors.title?.message}>
          <input className="input" placeholder="Access point firmware upgrade" {...f.register('title')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" error={f.formState.errors.starts_at?.message}><input type="datetime-local" className="input" {...f.register('starts_at')} /></Field>
          <Field label="Ends" error={f.formState.errors.ends_at?.message}><input type="datetime-local" className="input" {...f.register('ends_at')} /></Field>
        </div>
        <Field label="Maintenance notes"><textarea rows={3} className="input" {...f.register('notes')} /></Field>
        {f.formState.errors.root && <p className="text-sm text-st-critical">{f.formState.errors.root.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Schedule and notify</Button>
        </div>
      </form>
    </Modal>
  );
}
