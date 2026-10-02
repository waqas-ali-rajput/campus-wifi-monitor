import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, ClipboardList, FileBarChart, Gauge, History, LayoutDashboard, LogOut, Map, Menu,
  MessageSquareWarning, QrCode, Settings2, ShieldAlert, Users, X, Wifi, WifiOff, Building2, KeyRound,
} from 'lucide-react';
import { ROLE_LABELS, type NotificationDTO, type Permission } from '@campus/shared';
import { useAuth } from '../auth/AuthProvider';
import { useEventStream } from '../realtime/useEventStream';
import { onReachability } from '../api/client';
import { useAppConfig } from '../api/hooks';
import { setCampusTz } from '../lib/format';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { ToastHost, pushToast } from '../features/notifications/Toasts';
import { ChangePasswordModal } from '../features/auth/ChangePasswordModal';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  perm?: Permission;
  end?: boolean;
}
const groups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'My Wi-Fi',
    items: [
      { to: '/', label: 'Internet speed test', icon: <Gauge />, end: true },
      { to: '/campus-test', label: 'Campus Wi-Fi test', icon: <Wifi /> },
      { to: '/status', label: 'Campus status', icon: <Map /> },
      { to: '/history', label: 'Campus test history', icon: <History /> },
      { to: '/complaints', label: 'My complaints', icon: <MessageSquareWarning />, end: true },
      { to: '/outages', label: 'Outages & maintenance', icon: <ShieldAlert /> },
    ],
  },
  {
    title: 'IT operations',
    items: [
      { to: '/it', label: 'Dashboard', icon: <LayoutDashboard />, perm: 'dashboard.view', end: true },
      { to: '/it/complaints', label: 'Complaint queue', icon: <ClipboardList />, perm: 'complaints.viewAll' },
      { to: '/analytics', label: 'Analytics', icon: <BarChart3 />, perm: 'analytics.view' },
      { to: '/reports', label: 'Compare & reports', icon: <FileBarChart />, perm: 'analytics.compare' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/manage/locations', label: 'Locations', icon: <Building2 />, perm: 'locations.manage' },
      { to: '/admin/users', label: 'Users & roles', icon: <Users />, perm: 'users.manage' },
      { to: '/admin/thresholds', label: 'Health thresholds', icon: <Settings2 />, perm: 'settings.read' },
      { to: '/admin/activity', label: 'Activity log', icon: <Activity />, perm: 'activity.view' },
      { to: '/admin/server', label: 'Share on Wi-Fi', icon: <QrCode />, perm: 'server.info' },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#ffffff14" />
        <path d="M6 13a14 14 0 0 1 20 0" stroke="#7fb3f0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M10 17.5a8.5 8.5 0 0 1 12 0" stroke="#7fb3f0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="22.5" r="2.6" fill="#22c55e" />
      </svg>
      <div className="leading-tight">
        <div className="font-cond text-[17px] font-semibold tracking-tight text-white">Campus Wi-Fi</div>
        <div className="text-[12px] text-[#9fb0c9]">Network health monitor</div>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can, user, logout } = useAuth();
  const [pw, setPw] = useState(false);
  return (
    <div className="flex h-full flex-col bg-ink text-[#c9d4e5]">
      <Brand />
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        {groups.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.title} className="mt-4 first:mt-1">
              <div className="px-3 pb-1 text-[12px] font-medium text-[#7d8ca6]">{g.title}</div>
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors [&_svg]:h-[18px] [&_svg]:w-[18px]',
                      isActive ? 'bg-white/10 font-medium text-white' : 'hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  {i.icon}
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      {user && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-1">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-bright/25 font-cond text-sm font-semibold text-white">
              {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="truncate text-[12px] text-[#8e9cb5]">{ROLE_LABELS[user.role]}</div>
            </div>
            <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => setPw(true)} aria-label="Change password" title="Change password">
              <KeyRound className="h-4 w-4" />
            </button>
            <button className="rounded-md p-1.5 hover:bg-white/10" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <ChangePasswordModal open={pw} onClose={() => setPw(false)} />
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [reachable, setReachable] = useState(true);
  const loc = useLocation();
  const nav = useNavigate();
  const cfg = useAppConfig();
  if (cfg.data?.tz) setCampusTz(cfg.data.tz);
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    const off = onReachability(setReachable);
    return () => void off();
  }, []);
  useEffect(() => setDrawer(false), [loc.pathname]);

  const live = useEventStream(!!user && !cfg.data?.disableEventStream, (n: NotificationDTO) =>
    pushToast({
      title: n.title,
      body: n.body,
      tone: n.type === 'outage_detected' || n.type === 'location_degraded' ? 'danger' : n.type === 'network_recovered' || n.type === 'complaint_resolved' ? 'ok' : 'info',
      onClick: n.entity_type === 'complaint' ? () => navRef.current(`/complaints/${n.entity_id}`) : n.entity_type === 'outage' ? () => navRef.current('/outages') : undefined,
    }),
  );

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <SideNav />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-rise">
            <SideNav onNavigate={() => setDrawer(false)} />
          </div>
          <button className="absolute right-3 top-3 rounded-full bg-white p-2" onClick={() => setDrawer(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
        <button className="-ml-1 rounded-md p-1.5 hover:bg-ink/5 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-cond text-[16px] font-semibold lg:hidden">Campus Wi-Fi</span>
        <div className="flex-1" />
        {cfg.data?.disableEventStream ? <span className="rounded-full border border-[#e9cf83] bg-[#fff8e5] px-2.5 py-1 text-[12px] font-medium text-[#674f0b]" title="Live updates need a long-running server connection">Demo · refresh for updates</span> : <LiveIndicator state={live} />}
        <NotificationBell />
      </header>
      {cfg.data?.disableEventStream && (
        <div className="border-b border-[#e9cf83] bg-[#fff8e5] px-4 py-2 text-[13px] text-[#674f0b] sm:px-6" role="status">
          Vercel disposable demo: SQLite data can reset or differ between requests. Do not enter real or sensitive information.
        </div>
      )}
      {!reachable && (
        <div className="flex items-center gap-2 bg-st-critical px-4 py-2 text-sm text-white sm:px-6" role="alert">
          <WifiOff className="h-4 w-4" /> Cannot reach the server. Check your Wi-Fi connection.
        </div>
      )}
      <main className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}

function LiveIndicator({ state }: { state: 'connecting' | 'live' | 'offline' }) {
  const label = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting' : 'Reconnecting';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink-2" title="Live updates via server-sent events">
      {state === 'live' ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full bg-st-good" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-st-good" />
        </span>
      ) : (
        <Wifi className="h-3.5 w-3.5 text-ink-4" />
      )}
      {label}
    </span>
  );
}
