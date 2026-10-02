import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationDTO } from '@campus/shared';
import { api } from '../../api/client';
import { useApiMutation, useNotifications } from '../../api/hooks';
import { fmtAgo } from '../../lib/format';
import { cx } from '../../components/ui';
import { NotificationIcon } from './NotificationsPage';

export function notificationTarget(n: NotificationDTO): string | null {
  if (n.entity_type === 'complaint') return `/complaints/${n.entity_id}`;
  if (n.entity_type === 'outage' || n.entity_type === 'maintenance') return '/outages';
  if (n.entity_type === 'location') return `/it/locations/${n.entity_id}`;
  return null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const q = useNotifications(10);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const readAll = useApiMutation(() => api('/notifications/read-all', { method: 'POST' }), [['notifications']]);
  const readOne = useApiMutation((id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), [['notifications']]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = q.data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-ink-2 hover:bg-ink/5"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-st-poor px-1 text-[11px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(380px,calc(100vw-24px))] animate-rise overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline disabled:opacity-50" disabled={!unread} onClick={() => readAll.mutate(undefined)}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {q.data?.items.length ? (
              q.data.items.map((n) => (
                <li key={n.notification_id}>
                  <button
                    className={cx('flex w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left hover:bg-paper', !n.is_read && 'bg-accent-soft/40')}
                    onClick={() => {
                      if (!n.is_read) readOne.mutate(n.notification_id);
                      const t = notificationTarget(n);
                      if (t) nav(t);
                      setOpen(false);
                    }}
                  >
                    <NotificationIcon type={n.type} />
                    <div className="min-w-0 flex-1">
                      <div className={cx('text-[13.5px]', !n.is_read && 'font-medium')}>{n.title}</div>
                      {n.body && <div className="line-clamp-2 text-[12.5px] text-ink-3">{n.body}</div>}
                      <div className="mt-0.5 text-[12px] text-ink-4">{fmtAgo(n.created_at)}</div>
                    </div>
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-ink-3">You're all caught up.</li>
            )}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-accent hover:bg-paper">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
