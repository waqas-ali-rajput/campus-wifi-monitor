import { useState } from 'react';
import { useActivity } from '../../api/hooks';
import { Card, PageHeader, Pagination, QueryState, Badge } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { ROLE_LABELS, type Role } from '@campus/shared';

const ENTITIES = ['complaint', 'outage', 'maintenance', 'location', 'user', 'setting'];

function describe(a: any): string {
  let meta: any = {};
  try { meta = JSON.parse(a.meta_json || '{}'); } catch { /* ignore */ }
  const map: Record<string, string> = {
    'complaint.create': `filed a complaint${meta.location ? ` at ${meta.location}` : ''}`,
    'complaint.reviewed': 'reviewed a complaint',
    'complaint.assigned': 'assigned a complaint',
    'complaint.in_progress': 'started investigating a complaint',
    'complaint.resolved': 'resolved a complaint',
    'complaint.note': `added a note: “${meta.note ?? ''}”`,
    'outage.detected': `system detected an outage${meta.location ? ` at ${meta.location}` : ''} (${meta.rule ?? ''})`,
    'outage.resolve': `resolved an outage${meta.location ? ` at ${meta.location}` : ''}`,
    'outage.auto_resolve': `outage at ${meta.location ?? 'a location'} recovered automatically`,
    'maintenance.create': `scheduled maintenance “${meta.title ?? ''}”`,
    'maintenance.delete': `removed maintenance “${meta.title ?? ''}”`,
    'location.create': `added location ${meta.location_name ?? ''}`,
    'location.update': 'edited a location',
    'location.delete': `removed location ${meta.name ?? ''}`,
    'user.create': `created a ${meta.role ? ROLE_LABELS[meta.role as Role] : ''} account for ${meta.email ?? ''}`,
    'user.update': `updated a user (${Object.keys(meta).join(', ')})`,
    'user.register': 'registered',
    'settings.update': `changed ${a.entity_id}`,
    'auth.login': 'signed in',
    'auth.change_password': 'changed their password',
  };
  return map[a.action] ?? a.action;
}

export function ActivityLogPage() {
  const [f, setF] = useState({ entity_type: '', page: 1, pageSize: 40 });
  const q = useActivity(f);
  return (
    <>
      <PageHeader title="Activity log" subtitle="Every IT staff, manager and admin action, plus system events." actions={
        <select className="input h-10 w-auto" value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value, page: 1 })} aria-label="Entity">
          <option value="">Everything</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e[0]!.toUpperCase() + e.slice(1)}s</option>)}
        </select>
      } />
      <Card pad={false}>
        <QueryState q={q} empty={!q.data?.items.length}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Type</th></tr></thead>
              <tbody>
                {q.data?.items.map((a: any) => (
                  <tr key={a.log_id}>
                    <td className="whitespace-nowrap text-ink-3">{fmtDateTime(a.created_at)}</td>
                    <td className="whitespace-nowrap">{a.actor_name ? <><div className="font-medium">{a.actor_name}</div><div className="text-[12px] text-ink-3">{ROLE_LABELS[a.actor_role as Role]}</div></> : <span className="text-ink-3">System</span>}</td>
                    <td className="text-ink-2">{describe(a)}</td>
                    <td><Badge>{a.entity_type}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={f.page} pageSize={f.pageSize} total={q.data?.total ?? 0} onPage={(p) => setF({ ...f, page: p })} />
        </QueryState>
      </Card>
    </>
  );
}
