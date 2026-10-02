import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Gauge, MapPinOff, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { COMPLAINT_TYPE_LABELS } from '@campus/shared';
import { useCampusStatus, useComplaints, useSummary } from '../../api/hooks';
import { Card, QueryState, StatusDot, cx } from '../../components/ui';
import { fmtAgo, fmtMbps, fmtMs } from '../../lib/format';
import { Heatmap, StatusLegend } from '../status/Heatmap';
import { AiSummary, InsightsFeed, Recommendations } from './InsightsPanel';
import { StatusStepper } from '../complaints/StatusStepper';
import { useAuth } from '../../auth/AuthProvider';

function Kpi({ label, value, unit, icon, tone, to }: { label: string; value: ReactNode; unit?: string; icon: ReactNode; tone?: 'danger' | 'ok'; to?: string }) {
  const body = (
    <div className={cx('card flex h-full items-start gap-3 p-4 transition-shadow', to && 'hover:shadow-pop')}>
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg [&_svg]:h-[18px] [&_svg]:w-[18px]', tone === 'danger' ? 'bg-[#fdeaea] text-st-critical' : tone === 'ok' ? 'bg-[#e6f6ec] text-st-excellent' : 'bg-accent-soft text-accent')}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-3">{label}</div>
        <div className="font-cond text-[28px] font-semibold leading-none num">
          {value}
          {unit && <span className="ml-1 font-sans text-[13px] font-normal text-ink-3">{unit}</span>}
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function ItDashboardPage() {
  const s = useSummary();
  const status = useCampusStatus();
  const recent = useComplaints({ status: 'open', pageSize: 6 });
  const nav = useNavigate();
  const { user } = useAuth();
  const k = s.data;
  const hour = new Date().getHours();
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold sm:text-2xl">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {user?.name.split(' ')[0]}</h1>
          <p className="mt-1 text-[14px] text-ink-3">Today's network health across campus. Updates live as tests and complaints arrive.</p>
        </div>
      </div>
      <QueryState q={s}>
        {k && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Tests today" value={k.testsToday} icon={<Gauge />} to="/history" />
            <Kpi label="Average download" value={fmtMbps(k.avgDownload)} unit="Mbps" icon={<ArrowDown />} />
            <Kpi label="Average upload" value={fmtMbps(k.avgUpload)} unit="Mbps" icon={<ArrowUp />} />
            <Kpi label="Average ping" value={fmtMs(k.avgPing)} unit="ms" icon={<Timer />} />
            <Kpi label="Locations with poor health" value={k.poorLocations} icon={<MapPinOff />} tone={k.poorLocations ? 'danger' : 'ok'} to="/status" />
            <Kpi label="Open complaints" value={k.openComplaints} icon={<ClipboardList />} to="/it/complaints" />
            <Kpi label="Resolved complaints" value={k.resolvedComplaints} unit={k.resolvedToday ? `+${k.resolvedToday} today` : undefined} icon={<CheckCircle2 />} tone="ok" />
            <Kpi label="Current outages" value={k.currentOutages} icon={<AlertTriangle />} tone={k.currentOutages ? 'danger' : 'ok'} to="/outages" />
          </div>
        )}
      </QueryState>

      <div className="mt-5"><AiSummary /></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Campus heatmap" subtitle="Select a location to open its health detail." actions={<Link to="/status" className="text-[13px] font-medium text-accent hover:underline">Status board</Link>}>
          <QueryState q={status}>
            <Heatmap locations={status.data?.locations ?? []} onSelect={(l) => nav(`/it/locations/${l.location_id}`)} />
            <div className="mt-3"><StatusLegend /></div>
          </QueryState>
        </Card>
        <Recommendations />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <InsightsFeed />
        <Card title="Recent open complaints" actions={<Link to="/it/complaints" className="text-[13px] font-medium text-accent hover:underline">Open queue</Link>} pad={false}>
          <QueryState q={recent} empty={!recent.data?.items.length}>
            <ul>
              {recent.data?.items.map((c) => (
                <li key={c.complaint_id}>
                  <Link to={`/complaints/${c.complaint_id}`} className="flex items-start gap-3 border-b border-line/70 px-4 py-3 hover:bg-paper/60">
                    {c.location_status && <span className="mt-1.5"><StatusDot status={c.location_status} size={8} /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px]"><b className="font-medium">{COMPLAINT_TYPE_LABELS[c.complaint_type]}</b> <span className="text-ink-3">at {c.location_name}</span></div>
                      <div className="truncate text-[12.5px] text-ink-3">{c.description}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusStepper status={c.status} compact />
                      <span className="text-[11.5px] text-ink-4">{fmtAgo(c.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </QueryState>
        </Card>
      </div>
    </>
  );
}
