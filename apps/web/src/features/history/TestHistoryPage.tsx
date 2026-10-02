import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { HEALTH_STATUSES, STATUS_LABELS } from '@campus/shared';
import { useLocations, useTests } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { AXIS, Badge, Card, ChartFrame, ChartTooltip, EmptyState, GRID, LegendItem, PageHeader, Pagination, QueryState, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtMbps, fmtMs, fmtPct, fmtDate } from '../../lib/format';
import { Link } from 'react-router-dom';

export function TestHistoryPage() {
  const { can } = useAuth();
  const all = can('tests.viewAll');
  const locs = useLocations();
  const [f, setF] = useState({ location_id: '', building: '', status: '', from: '', to: '', page: 1, pageSize: 25 });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v, page: 1 }));
  const params = { ...f, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(f.to + 'T23:59:59').toISOString() : undefined };
  const q = useTests(params);
  const trendQ = useTests({ ...params, page: 1, pageSize: 60 });
  const trend = useMemo(
    () => (trendQ.data?.items ?? []).slice().reverse().map((t) => ({ at: fmtDateTime(t.tested_at), score: t.health_score, download: t.download_speed })),
    [trendQ.data],
  );
  const buildings = locs.data?.buildings ?? [];

  return (
    <>
      <PageHeader
        title={all ? 'Speed test results' : 'My test history'}
        subtitle={all ? 'Every stored measurement across campus.' : 'Every speed test you have run, with its health score.'}
      />
      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
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
            {buildings.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Network status</label>
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            {HEALTH_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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
      </div>

      {trend.length > 1 && (
        <div className="mb-5">
          <ChartFrame
            title="Health score trend"
            subtitle={`Last ${trend.length} results matching the filters`}
            height={200}
            legend={<LegendItem color="#2a78d6" label="Health score" line />}
            table={{ columns: ['Tested', 'Score', 'Download (Mbps)'], rows: trend.map((t) => [t.at, t.score, fmtMbps(t.download)]) }}
          >
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="at" {...AXIS} hide />
                <YAxis domain={[0, 100]} {...AXIS} ticks={[0, 30, 50, 70, 90, 100]} />
                <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="score" name="Health score" stroke="#2a78d6" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      )}

      <Card pad={false}>
        <QueryState
          q={q}
          empty={!q.data?.items.length && <EmptyState title="No tests match these filters" body="Run a speed test or widen the filters." action={<Link to="/" className="font-medium text-accent">Run a speed test</Link>} />}
        >
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Location</th>
                  {all && <th>User</th>}
                  <th className="text-right">Down</th>
                  <th className="text-right">Up</th>
                  <th className="text-right">Ping</th>
                  <th className="text-right">Loss</th>
                  <th className="text-right">Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.items.map((t) => (
                  <tr key={t.test_id}>
                    <td className="whitespace-nowrap">{fmtDateTime(t.tested_at)}</td>
                    <td>
                      <div className="font-medium">{t.location_name}</div>
                      <div className="text-[12px] text-ink-3">{t.building}</div>
                    </td>
                    {all && <td className="text-ink-2">{t.user_name}</td>}
                    <td className="num text-right">{fmtMbps(t.download_speed)}</td>
                    <td className="num text-right">{fmtMbps(t.upload_speed)}</td>
                    <td className="num text-right">{fmtMs(t.ping)} ms</td>
                    <td className="num text-right">{fmtPct(t.packet_loss)}</td>
                    <td className="num text-right font-medium">{Math.round(t.health_score)}</td>
                    <td>
                      <StatusBadge status={t.health_status} size="sm" />
                      {!!t.during_maintenance && <Badge tone="warn" className="ml-1">maint.</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={f.page} pageSize={f.pageSize} total={q.data?.total ?? 0} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
        </QueryState>
      </Card>
      <p className="mt-3 text-[12.5px] text-ink-4">Dates shown in campus time. {fmtDate(new Date().toISOString())}.</p>
    </>
  );
}
