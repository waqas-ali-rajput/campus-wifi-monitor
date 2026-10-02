import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { locationCreateSchema, type LocationDTO } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useLocations } from '../../api/hooks';
import { Button, Card, Field, Modal, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { fmtAgo } from '../../lib/format';
import { Heatmap } from '../status/Heatmap';
import { pushToast } from '../notifications/Toasts';

type F = z.input<typeof locationCreateSchema>;

export function LocationsAdminPage() {
  const q = useLocations();
  const [edit, setEdit] = useState<LocationDTO | 'new' | null>(null);
  const [confirm, setConfirm] = useState<LocationDTO | null>(null);
  const del = useApiMutation((id: string) => api(`/locations/${id}`, { method: 'DELETE' }), [['locations'], ['dashboard']]);
  return (
    <>
      <PageHeader title="Campus locations" subtitle="Monitoring locations people can test from. Removing a location hides it but keeps its history." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Add location</Button>} />
      <Card pad={false}>
        <QueryState q={q}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Location</th><th>Building</th><th>Floor</th><th>Status</th><th>Coordinates</th><th>Last test</th><th /></tr></thead>
              <tbody>
                {q.data?.items.map((l) => (
                  <tr key={l.location_id}>
                    <td><div className="font-medium">{l.location_name}</div><div className="max-w-[260px] truncate text-[12px] text-ink-3">{l.description}</div></td>
                    <td>{l.building}</td>
                    <td className="num">{l.floor ?? '–'}</td>
                    <td><StatusBadge status={l.current_status} score={l.current_score} size="sm" /></td>
                    <td className="num text-ink-3">{l.latitude != null && l.longitude != null ? `${l.latitude}, ${l.longitude}` : 'Not pinned'}</td>
                    <td className="text-ink-3">{fmtAgo(l.last_tested_at)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(l)} aria-label={`Edit ${l.location_name}`} />
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(l)} aria-label={`Remove ${l.location_name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Card>
      {edit && <LocationForm loc={edit === 'new' ? null : edit} all={q.data?.items ?? []} onClose={() => setEdit(null)} />}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Remove location">
        <p className="text-sm text-ink-2">Remove <b>{confirm?.location_name}</b> from monitoring? Its tests and complaints stay in the history.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={async () => { await del.mutateAsync(confirm!.location_id); pushToast({ title: `${confirm!.location_name} removed`, tone: 'info' }); setConfirm(null); }}>Remove location</Button>
        </div>
      </Modal>
    </>
  );
}

function LocationForm({ loc, all, onClose }: { loc: LocationDTO | null; all: LocationDTO[]; onClose: () => void }) {
  const f = useForm<F>({
    resolver: zodResolver(locationCreateSchema),
    defaultValues: loc ? { location_name: loc.location_name, building: loc.building, floor: loc.floor, description: loc.description, map_x: loc.map_x, map_y: loc.map_y, latitude: loc.latitude, longitude: loc.longitude } : { location_name: '', building: '', floor: 1, description: '', map_x: 50, map_y: 50, latitude: null, longitude: null },
  });
  const save = useApiMutation((v: F) => (loc ? api(`/locations/${loc.location_id}`, { method: 'PATCH', json: v }) : api('/locations', { method: 'POST', json: v })), [['locations'], ['dashboard']]);
  const mx = f.watch('map_x');
  const my = f.watch('map_y');
  const name = f.watch('location_name');
  const preview: LocationDTO[] = [
    ...all.filter((l) => l.location_id !== loc?.location_id),
    { ...(loc ?? all[0] ?? ({} as LocationDTO)), location_id: '__preview', location_name: name || 'New location', building: f.watch('building') || 'New building', map_x: Number(mx), map_y: Number(my), current_status: 'unknown', current_score: null, active_outage: false, active_maintenance: false, today: { tests: 0, avg_download: null, avg_upload: null, avg_ping: null, complaints: 0 } } as LocationDTO,
  ];
  const submit = f.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, floor: v.floor === null || (v.floor as unknown) === '' ? null : Number(v.floor), map_x: Number(v.map_x), map_y: Number(v.map_y), latitude: v.latitude === null || v.latitude === undefined || Number.isNaN(v.latitude) ? null : Number(v.latitude), longitude: v.longitude === null || v.longitude === undefined || Number.isNaN(v.longitude) ? null : Number(v.longitude) });
      pushToast({ title: loc ? 'Location updated' : 'Location added', tone: 'ok' });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [k, m] of Object.entries(e.details)) f.setError(k as keyof F, { message: m[0] });
      else f.setError('root', { message: e instanceof Error ? e.message : 'Could not save' });
    }
  });
  const buildings = [...new Set(all.map((l) => l.building))];
  return (
    <Modal open onClose={onClose} title={loc ? `Edit ${loc.location_name}` : 'Add location'} wide>
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2" noValidate>
        <div className="space-y-4">
          <Field label="Location name" error={f.formState.errors.location_name?.message}><input className="input" {...f.register('location_name')} /></Field>
          <Field label="Building" error={f.formState.errors.building?.message}>
            <input className="input" list="buildings" {...f.register('building')} />
            <datalist id="buildings">{buildings.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
          <Field label="Floor"><input type="number" className="input" {...f.register('floor', { valueAsNumber: true })} /></Field>
          <Field label="Description"><textarea rows={2} className="input" {...f.register('description')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Verified latitude" error={f.formState.errors.latitude?.message}>
              <input type="number" step="any" min="-90" max="90" inputMode="decimal" className="input" {...f.register('latitude', { setValueAs: (value) => value === '' ? null : Number(value) })} />
            </Field>
            <Field label="Verified longitude" error={f.formState.errors.longitude?.message}>
              <input type="number" step="any" min="-180" max="180" inputMode="decimal" className="input" {...f.register('longitude', { setValueAs: (value) => value === '' ? null : Number(value) })} />
            </Field>
          </div>
          <p className="text-[12px] text-ink-3">Enter both coordinates from a trusted GPS/map source. Locations without coordinates will not be pinned.</p>
        </div>
        <div>
          <span className="label">Schematic grid position</span>
          <p className="mb-2 text-[12.5px] text-ink-3">These sliders affect only the legacy preview, not the geographic map pin.</p>
          <Heatmap locations={preview} selectedId="__preview" compact />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={`Across (${Math.round(Number(mx))})`}><input type="range" min={3} max={97} className="w-full accent-[#1f62c4]" {...f.register('map_x', { valueAsNumber: true })} /></Field>
            <Field label={`Down (${Math.round(Number(my))})`}><input type="range" min={3} max={97} className="w-full accent-[#1f62c4]" {...f.register('map_y', { valueAsNumber: true })} /></Field>
          </div>
        </div>
        {f.formState.errors.root && <p className="text-sm text-st-critical md:col-span-2">{f.formState.errors.root.message}</p>}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{loc ? 'Save changes' : 'Add location'}</Button>
        </div>
      </form>
    </Modal>
  );
}
