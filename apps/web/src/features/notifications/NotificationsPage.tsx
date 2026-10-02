import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardCheck, MessageSquarePlus, TrendingDown, UserCheck, Wrench, BellRing } from 'lucide-react';
import { api } from '../../api/client';
import { useApiMutation, useNotifications } from '../../api/hooks';
import { Button, Card, EmptyState, PageHeader, QueryState, Segmented, cx } from '../../components/ui';
import { fmtAgo, fmtDateTime } from '../../lib/format';
import { notificationTarget } from './NotificationBell';

export function NotificationIcon({ type }: { type: string }) {
  const map: Record<string, [JSX.Element, string]> = {
    complaint_submitted: [<MessageSquarePlus key="i" />, 'text-accent bg-accent-soft'],
    complaint_assigned: [<UserCheck key="i" />, 'text-accent bg-accent-soft'],
    complaint_resolved: [<ClipboardCheck key="i" />, 'text-st-excellent bg-[#e6f6ec]'],
    location_degraded: [<TrendingDown key="i" />, 'text-st-poor bg-[#fdeaea]'],
    outage_detected: [<AlertTriangle key="i" />, 'text-st-critical bg-[#fdeaea]'],
    maintenance_scheduled: [<Wrench key="i" />, 'text-[#7a5d00] bg-[#fff6dc]'],
    network_recovered: [<CheckCircle2 key="i" />, 'text-st-excellent bg-[#e6f6ec]'],
  };
  const [icon, cls] = map[type] ?? [<BellRing key="i" />, 'text-ink-3 bg-paper'];
  return <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:h-4 [&_svg]:w-4', cls)}>{icon}</span>;
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const q = useNotifications(100, filter === 'unread');
  const nav = useNavigate();
  const readAll = useApiMutation(() => api('/notifications/read-all', { method: 'POST' }), [['notifications']]);
  const readOne = useApiMutation((id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), [['notifications']]);
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Complaint updates, outages, maintenance and recovery alerts."
        actions={
          <>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread (${q.data?.unread ?? 0})` }]} />
            <Button variant="secondary" onClick={() => readAll.mutate(undefined)} disabled={!q.data?.unread}>
              Mark all read
            </Button>
          </>
        }
      />
      <Card pad={false}>
        <QueryState q={q} empty={!q.data?.items.length && <EmptyState title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} />}>
          <ul>
            {q.data?.items.map((n) => (
              <li key={n.notification_id} className={cx('flex items-start gap-3 border-b border-line/70 px-4 py-3.5 last:border-0', !n.is_read && 'bg-accent-soft/30')}>
                <NotificationIcon type={n.type} />
                <div className="min-w-0 flex-1">
                  <div className={cx('text-sm', !n.is_read && 'font-medium')}>{n.title}</div>
                  {n.body && <div className="text-[13px] text-ink-3">{n.body}</div>}
                  <div className="mt-0.5 text-[12px] text-ink-4" title={fmtDateTime(n.created_at)}>{fmtAgo(n.created_at)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {notificationTarget(n) && (
                    <Button size="sm" variant="quiet" onClick={() => { if (!n.is_read) readOne.mutate(n.notification_id); nav(notificationTarget(n)!); }}>
                      Open
                    </Button>
                  )}
                  {!n.is_read && (
                    <Button size="sm" variant="ghost" onClick={() => readOne.mutate(n.notification_id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </QueryState>
      </Card>
    </>
  );
}
