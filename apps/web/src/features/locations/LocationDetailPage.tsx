import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COMPLAINT_TYPE_LABELS, OUTAGE_RULE_LABELS } from '@campus/shared';
import { useLocationDetail, usePredictions } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { AXIS, Badge, Button, Card, ChartFrame, ChartTooltip, EmptyState, ErrorPanel, GRID, LegendItem, PageHeader, Segmented, Spinner, StatusBadge } from '../../components/ui';
import { fmtAgo, fmtDateTime, fmtMbps, fmtMs, fmtPct, fmtTime, hourLabel } from '../../lib/format';
import { InsightItem } from '../dashboard/InsightsPanel';
import { StatusStepper } from '../complaints/StatusStepper';
import { MaintenanceModal } from '../outages/OutagesPage';

type Metric = 'score' | 'download' | 'ping';
const METRIC: Record<Metric, { label: string; color: string; unit: string }> = {
  score: { label: 'Health score', color: '#2a78d6', unit: '' },
  download: { label: 'Download (Mbps)', color: '#2a78d6', unit: 'Mbps' },
  ping: { label: 'Ping (ms)', color: '#1baf7a', unit: 'ms' },
};

export function LocationDetailPage() {
  const { id } = useParams();
  const q = useLocationDetail(id);
  const pred = usePredictions(id);
  const { can } = useAuth();
  const [metric, setMetric] = useState<Metric>('score');
  const [maint, setMaint] = useState(false);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorPanel error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const l = d.location;
  const series = d.series24h.map((p: any) => ({ ...p, t: fmtTime(p.at) }));
  const hours = d.byHour.map((h: any) => ({ ...h, h: hourLabel(h.hour) }));
  const risk = pred.data?.risks?.[0];
  const m = METRIC[metric];

  return (
    <>
      <Link to="/it" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
      <PageHeader
        title={l.location_name}
        subtitle={`${l.building}${l.floor != null ? ` · Floor ${l.floor}` : ''}${l.description ? ` · ${l.description}` : ''}`}
        actions={
          <>
            <StatusBadge status={l.current_status} score={l.current_score} stale={!!l.current_stale} />
            {can('maintenance.manage') && <Button variant="secondary" size="sm" icon={<Wrench className="h-4 w-4" />} onClick={() => setMaint(true)}>Schedule maintenance</Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Current score', l.current_score != null ? Math.round(l.current_score) : '–', '/ 100'],
          ['Avg download today', fmtMbps(l.today.avg_download), 'Mbps'],
          ['Avg upload today', fmtMbps(l.today.avg_upload), 'Mbps'],
          ['Avg ping today', fmtMs(l.today.avg_ping), 'ms'],
          ['Tests · complaints today', `${l.today.tests} · ${l.today.complaints}`, ''],
        ].map(([k, v, u]) => (
          <div key={k as string} className="card p-3.5">
            <div className="text-[12px] text-ink-3">{k}</div>
            <div className="font-cond text-[24px] font-semibold num">{v}<span className="ml-1 font-sans text-[12px] font-normal text-ink-3">{u}</span></div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartFrame
          title="Last 24 hours"
          subtitle={`${series.length} tests`}
          actions={<Segmented size="sm" label="Metric" value={metric} onChange={setMetric} options={[{ value: 'score', label: 'Score' }, { value: 'download', label: 'Download' }, { value: 'ping', label: 'Ping' }]} />}
          legend={<LegendItem color={m.color} label={m.label} line />}
          table={{ columns: ['Time', 'Score', 'Download', 'Upload', 'Ping', 'Loss'], rows: d.series24h.map((p: any) => [fmtTime(p.at), p.score, fmtMbps(p.download), fmtMbps(p.upload), fmtMs(p.ping), fmtPct(p.loss)]) }}
        >
          {series.length ? (
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" {...AXIS} minTickGap={28} />
                <YAxis {...AXIS} domain={metric === 'score' ? [0, 100] : ['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey={metric} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No tests in the last 24 hours" />
          )}
        </ChartFrame>
        <div className="space-y-5">
          <Card title="Outage prediction" subtitle="Trend, failures, complaints and anomalies over the last few hours.">
            {risk ? (
              <div>
                <div className="flex items-end gap-3">
                  <span className="font-cond text-[40px] font-semibold leading-none num">{risk.risk}</span>
                  <Badge tone={risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warn' : 'ok'}>{risk.level} risk</Badge>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full" style={{ width: `${risk.risk}%`, background: risk.level === 'high' ? '#ef4444' : risk.level === 'medium' ? '#eab308' : '#22c55e' }} />
                </div>
                <p className="mt-2 text-[13px] text-ink-2">{risk.message}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-3">Calculating…</p>
            )}
          </Card>
          <Card title="Insights for this location" pad={false}>
            {d.insights?.length ? <ul>{d.insights.map((i: any) => <InsightItem key={i.insight_id} i={i} />)}</ul> : <EmptyState title="Nothing unusual detected" />}
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title="Performance by hour of day"
          subtitle="Average health score, last 14 days"
          height={220}
          legend={<LegendItem color="#2a78d6" label="Average score" />}
          table={{ columns: ['Hour', 'Tests', 'Avg score', 'Avg download', 'Avg ping'], rows: d.byHour.map((h: any) => [`${h.label}`, h.tests, h.avg_score ?? '–', fmtMbps(h.avg_download), fmtMs(h.avg_ping)]) }}
        >
          <ResponsiveContainer>
            <BarChart data={hours} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="h" {...AXIS} interval={2} />
              <YAxis domain={[0, 100]} {...AXIS} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef2f6' }} />
              <Bar dataKey="avg_score" name="Average score" fill="#2a78d6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <Card title="Latest tests" pad={false}>
          <div className="max-h-[300px] overflow-auto">
            <table className="table-base">
              <thead><tr><th>Time</th><th>User</th><th className="text-right">Down</th><th className="text-right">Ping</th><th className="text-right">Loss</th><th>Status</th></tr></thead>
              <tbody>
                {d.latest_tests.map((t: any) => (
                  <tr key={t.test_id}>
                    <td className="whitespace-nowrap">{fmtAgo(t.tested_at)}</td>
                    <td className="text-ink-2">{t.user_name}</td>
                    <td className="num text-right">{fmtMbps(t.download_speed)}</td>
                    <td className="num text-right">{fmtMs(t.ping)}</td>
                    <td className="num text-right">{fmtPct(t.packet_loss)}</td>
                    <td><StatusBadge status={t.health_status} score={t.health_score} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Open complaints" pad={false}>
          {d.open_complaints?.length ? (
            <ul>
              {d.open_complaints.map((c: any) => (
                <li key={c.complaint_id}>
                  <Link to={`/complaints/${c.complaint_id}`} className="block border-b border-line/70 px-4 py-2.5 hover:bg-paper/60">
                    <div className="text-[13.5px] font-medium">{COMPLAINT_TYPE_LABELS[c.complaint_type as keyof typeof COMPLAINT_TYPE_LABELS]}</div>
                    <div className="truncate text-[12.5px] text-ink-3">{c.description}</div>
                    <div className="mt-1"><StatusStepper status={c.status} compact /></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No open complaints" />}
        </Card>
        <Card title="Outages" pad={false}>
          {d.outages?.length ? (
            <ul>
              {d.outages.map((o: any) => (
                <li key={o.outage_id} className="border-b border-line/70 px-4 py-2.5 text-[13.5px]">
                  <div className="flex items-center justify-between"><span className="font-medium">{fmtDateTime(o.detected_at)}</span><Badge tone={o.status === 'active' ? 'danger' : 'neutral'}>{o.status}</Badge></div>
                  <div className="text-[12.5px] text-ink-3">{o.explanation || OUTAGE_RULE_LABELS[o.cause_rule]}</div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No outages recorded" />}
        </Card>
        <Card title="Maintenance notes" pad={false}>
          {d.maintenance?.length ? (
            <ul>
              {d.maintenance.map((m: any) => (
                <li key={m.maintenance_id} className="border-b border-line/70 px-4 py-2.5 text-[13.5px]">
                  <div className="font-medium">{m.title}</div>
                  <div className="text-[12.5px] text-ink-3">{fmtDateTime(m.starts_at)} – {fmtDateTime(m.ends_at)}</div>
                  {m.notes && <div className="text-[12.5px] text-ink-2">{m.notes}</div>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No maintenance scheduled" />}
        </Card>
      </div>
      <MaintenanceModal open={maint} onClose={() => setMaint(false)} locationId={l.location_id} />
    </>
  );
}
