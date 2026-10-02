import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Sparkles } from 'lucide-react';
import { COMPLAINT_STATUSES, COMPLAINT_STATUS_LABELS, COMPLAINT_TYPES, COMPLAINT_TYPE_LABELS, HEALTH_STATUSES, STATUS_LABELS } from '@campus/shared';
import { useComplaints, useLocations, useStaff } from '../../api/hooks';
import { Button, Card, EmptyState, PageHeader, Pagination, QueryState, StatusDot } from '../../components/ui';
import { fmtAgo, fmtDateTime } from '../../lib/format';
import { StatusStepper } from './StatusStepper';

export function ComplaintListPage({ mode }: { mode: 'mine' | 'queue' }) {
  const nav = useNavigate();
  const queue = mode === 'queue';
  const locs = useLocations();
  const staff = useStaff(queue);
  const [f, setF] = useState({
    status: queue ? 'open' : '', complaint_type: '', location_id: '', building: '', network_status: '', assigned_staff: '', q: '', from: '', to: '', page: 1, pageSize: 20,
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v, page: 1 }));
  const q = useComplaints({
    ...f,
    mine: queue ? undefined : 1,
    from: f.from ? new Date(f.from).toISOString() : undefined,
    to: f.to ? new Date(f.to + 'T23:59:59').toISOString() : undefined,
  });

  return (
    <>
      <PageHeader
        title={queue ? 'Complaint queue' : 'My complaints'}
        subtitle={queue ? 'Review, assign and resolve Wi-Fi complaints. Filters combine.' : 'Track what happened to the problems you reported.'}
        actions={!queue && <Link to="/complaints/new"><Button icon={<Plus className="h-4 w-4" />}>Report a problem</Button></Link>}
      />
      <div className="card mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {queue && (
            <div className="sm:col-span-2">
              <label className="label">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
                <input className="input pl-9" placeholder="Description, location or reporter" value={f.q} onChange={(e) => set('q', e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <label className="label">Complaint status</label>
            <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="open">Open (not resolved)</option>
              {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{COMPLAINT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Complaint type</label>
            <select className="input" value={f.complaint_type} onChange={(e) => set('complaint_type', e.target.value)}>
              <option value="">Any type</option>
              {COMPLAINT_TYPES.map((s) => <option key={s} value={s}>{COMPLAINT_TYPE_LABELS[s]}</option>)}
            </select>
          </div>
          {queue && (
            <>
              <div>
                <label className="label">Location</label>
                <select className="input" value={f.location_id} onChange={(e) => set('location_id', e.target.value)}>
                  <option value="">All locations</option>
                  {locs.data?.items.map((l) => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Building</label>
                <select className="input" value={f.building} onChange={(e) => set('building', e.target.value)}>
                  <option value="">All buildings</option>
                  {locs.data?.buildings.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Network status now</label>
                <select className="input" value={f.network_status} onChange={(e) => set('network_status', e.target.value)}>
                  <option value="">Any</option>
                  {HEALTH_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assignee</label>
                <select className="input" value={f.assigned_staff} onChange={(e) => set('assigned_staff', e.target.value)}>
                  <option value="">Anyone</option>
                  <option value="unassigned">Unassigned</option>
                  {staff.data?.items.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">From</label>
                <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <Card pad={false}>
        <QueryState
          q={q}
          empty={
            !q.data?.items.length && (
              <EmptyState
                title={queue ? 'No complaints match these filters' : "You haven't reported any problems"}
                body={queue ? 'Clear a filter to see more.' : 'If the Wi-Fi is misbehaving, run a speed test and report it with the result attached.'}
                action={!queue && <Link to="/complaints/new"><Button>Report a problem</Button></Link>}
              />
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th className="min-w-[220px]">Description</th>
                  {queue && <th>Reporter</th>}
                  {queue && <th>Assignee</th>}
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.items.map((c) => (
                  <tr key={c.complaint_id} className="clickable" onClick={() => nav(`/complaints/${c.complaint_id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/complaints/${c.complaint_id}`)}>
                    <td className="whitespace-nowrap" title={fmtDateTime(c.created_at)}>{fmtAgo(c.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{COMPLAINT_TYPE_LABELS[c.complaint_type]}</div>
                      {queue && c.ai_category && c.ai_category !== c.complaint_type && c.ai_category !== 'other' && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-accent"><Sparkles className="h-3 w-3" /> AI: {COMPLAINT_TYPE_LABELS[c.ai_category]}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5">{c.location_status && <StatusDot status={c.location_status} size={8} />}{c.location_name}</div>
                      <div className="text-[12px] text-ink-3">{c.building}</div>
                    </td>
                    <td className="text-ink-2"><span className="line-clamp-2">{c.description}</span></td>
                    {queue && <td className="whitespace-nowrap text-ink-2">{c.user_name}</td>}
                    {queue && <td className="whitespace-nowrap text-ink-2">{c.assigned_name ?? <span className="text-ink-4">—</span>}</td>}
                    <td><StatusStepper status={c.status} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={f.page} pageSize={f.pageSize} total={q.data?.total ?? 0} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
        </QueryState>
      </Card>
    </>
  );
}
