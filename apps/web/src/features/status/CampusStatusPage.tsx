import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, LayoutGrid, Map as MapIcon, MessageSquareWarning, Search, Wrench } from 'lucide-react';
import { COMPLAINT_TYPE_LABELS, STATUS_LABELS, type LocationDTO, type LocationStatus } from '@campus/shared';
import { useCampusStatus } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader, QueryState, Segmented, StatusBadge, StatusDot, cx } from '../../components/ui';
import { fmtAgo, fmtMbps, fmtMs } from '../../lib/format';
const OsmCampusMap = lazy(() => import('./OsmCampusMap').then((module) => ({ default: module.OsmCampusMap })));

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const ORDER: Record<LocationStatus, number> = { critical: 0, poor: 1, fair: 2, good: 3, excellent: 4, unknown: 5 };

export function CampusStatusPage() {
  const q = useCampusStatus();
  const { can } = useAuth();
  const nav = useNavigate();
  const [view, setView] = useState<'map' | 'grid'>('map');
  const [building, setBuilding] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'status' | 'name'>('status');
  const locs = q.data?.locations ?? [];
  const buildings = [...new Set(locs.map((l) => l.building))].sort();
  const filtered = useMemo(
    () =>
      locs
        .filter((l) => !building || l.building === building)
        .filter((l) => !search || l.location_name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (sort === 'name' ? a.location_name.localeCompare(b.location_name) : ORDER[a.current_status] - ORDER[b.current_status] || (a.current_score ?? 0) - (b.current_score ?? 0))),
    [locs, building, search, sort],
  );
  const counts = locs.reduce<Record<string, number>>((m, l) => ((m[l.current_status] = (m[l.current_status] ?? 0) + 1), m), {});
  const open = (l: LocationDTO) => (can('dashboard.view') ? nav(`/it/locations/${l.location_id}`) : nav(`/?location=${l.location_id}`));

  return (
    <>
      <PageHeader
        title="Campus network status"
        subtitle="Live health of every monitored location, from the latest speed tests and complaints."
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'map', label: <span className="inline-flex items-center gap-1.5"><MapIcon className="h-4 w-4" />Map</span> },
              { value: 'grid', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" />Grid</span> },
            ]}
          />
        }
      />
      <QueryState q={q}>
        {(q.data?.outages ?? []).length > 0 && (
          <div className="mb-4 space-y-2">
            {(q.data?.outages ?? []).map((o) => (
              <div key={o.outage_id} className="flex items-center gap-3 rounded-xl border border-[#f3b7b7] bg-[#fdf3f3] px-4 py-3 text-[14px] text-[#7f1515]" role="alert">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span className="flex-1"><b>{o.message}</b> {o.location_name} · since {fmtAgo(o.detected_at)}</span>
                <Link to="/outages" className="font-medium underline">Details</Link>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
            <input className="input h-9 w-[220px] pl-9 text-sm" placeholder="Find a location" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a location" />
          </div>
          <select className="input h-9 w-auto py-0 text-sm" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building">
            <option value="">All buildings</option>
            {buildings.map((b) => <option key={b}>{b}</option>)}
          </select>
          {view === 'grid' && (
            <select className="input h-9 w-auto py-0 text-sm" value={sort} onChange={(e) => setSort(e.target.value as 'status' | 'name')} aria-label="Sort">
              <option value="status">Worst first</option>
              <option value="name">By name</option>
            </select>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(['critical', 'poor', 'fair', 'good', 'excellent'] as LocationStatus[]).filter((s) => counts[s]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12.5px]">
                <StatusDot status={s} size={8} /> <b className="num">{counts[s]}</b> {STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>

        {view === 'map' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card title="MUET campus map" subtitle="Pins show locations with manually verified coordinates. Select a pin to inspect network status or open its details." actions={null}>
              <MapErrorBoundary fallback={<div className="grid min-h-[360px] place-items-center rounded-lg border border-line bg-paper p-5 text-center text-sm text-ink-3" role="alert">The OpenStreetMap view could not be loaded. Switch to Grid to view all campus locations.</div>}>
                <Suspense fallback={<div className="grid min-h-[360px] place-items-center rounded-lg border border-line bg-paper text-sm text-ink-3" role="status">Loading campus map…</div>}>
                  <OsmCampusMap locations={filtered} onSelect={open} />
                </Suspense>
              </MapErrorBoundary>
            </Card>
            <RecentStatus items={(q.data?.recent ?? [])} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((l) => <LocationCard key={l.location_id} l={l} onOpen={() => open(l)} />)}
          </div>
        )}
      </QueryState>
    </>
  );
}

export function LocationCard({ l, onOpen }: { l: LocationDTO; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card group flex flex-col p-4 text-left transition-shadow hover:shadow-pop focus-visible:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold group-hover:text-accent">{l.location_name}</div>
          <div className="text-[12.5px] text-ink-3">{l.building}{l.floor != null ? ` · Floor ${l.floor}` : ''}</div>
        </div>
        <StatusBadge status={l.current_status} score={l.current_score} size="sm" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-ink-3">
        <div><div className="font-cond text-[19px] font-semibold text-ink num">{fmtMbps(l.today.avg_download)}</div>Mbps avg</div>
        <div><div className="font-cond text-[19px] font-semibold text-ink num">{fmtMs(l.today.avg_ping)}</div>ms ping</div>
        <div><div className="font-cond text-[19px] font-semibold text-ink num">{l.today.tests}</div>tests today</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12.5px] text-ink-3">
        <span>Latest: {l.latest ? `${fmtMbps(l.latest.download_speed)} Mbps · ${fmtMs(l.latest.ping)} ms` : 'no tests'}</span>
        <span className="inline-flex items-center gap-1"><MessageSquareWarning className="h-3.5 w-3.5" />{l.today.complaints} today</span>
        {l.active_outage && <span className="font-medium text-st-critical">Outage</span>}
        {l.active_maintenance && <span className="inline-flex items-center gap-1 text-[#7a5d00]"><Wrench className="h-3.5 w-3.5" />Maintenance</span>}
        {!!l.current_stale && <span title="No tests in the last 2 hours">Last tested {fmtAgo(l.last_tested_at)}</span>}
      </div>
    </button>
  );
}

function RecentStatus({ items }: { items: any[] }) {
  return (
    <Card title="Recent network status" subtitle="The latest tests, outages and reports across campus." pad={false}>
      <ul>
        {items.map((e) => (
          <li key={e.kind + e.id} className="flex items-start gap-3 border-b border-line/70 px-4 py-2.5 text-[13.5px] last:border-0">
            <span className="mt-1.5">
              {e.kind === 'test' ? <StatusDot status={e.status} /> : e.kind === 'outage' ? <AlertTriangle className="h-4 w-4 text-st-critical" /> : e.kind === 'recovered' ? <StatusDot status="good" /> : <MessageSquareWarning className="h-4 w-4 text-ink-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{e.location_name}</span>{' '}
              <span className={cx('text-ink-3', e.kind === 'outage' && 'text-st-critical')}>
                {e.kind === 'test' ? `${STATUS_LABELS[e.status as LocationStatus]} — ${e.detail}` : e.kind === 'complaint' ? `complaint: ${COMPLAINT_TYPE_LABELS[e.detail as keyof typeof COMPLAINT_TYPE_LABELS] ?? e.detail}` : e.detail}
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-ink-4">{fmtAgo(e.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
