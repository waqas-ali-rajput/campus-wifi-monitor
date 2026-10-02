import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine } from 'recharts';
import { Clock, Users } from 'lucide-react';
import { COMPLAINT_TYPES, COMPLAINT_TYPE_LABELS, STATUS_COLORS, type LocationStatus } from '@campus/shared';
import { useAnalytics, useLocations, usePredictions } from '../../api/hooks';
import { AXIS, Card, ChartFrame, ChartTooltip, GRID, LegendItem, PageHeader, QueryState, Segmented, StatusBadge } from '../../components/ui';
import { fmtDay, fmtMbps, fmtMs, hourLabel } from '../../lib/format';
import { Recommendations } from '../dashboard/InsightsPanel';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];

export function AnalyticsPage() {
  const locs = useLocations();
  const [days, setDays] = useState('14');
  const [building, setBuilding] = useState('');
  const [locationId, setLocationId] = useState('');
  const f = { days, building: building || undefined, location_id: locationId || undefined };
  const byLoc = useAnalytics<{ items: any[] }>('by-location', f);
  const byHour = useAnalytics<{ items: any[] }>('by-hour', f);
  const byDay = useAnalytics<{ items: any[] }>('by-day', f);
  const cbb = useAnalytics<{ rows: any[] }>('complaints-by-building', f);
  const peaks = useAnalytics<any>('peak-periods', f);
  const pred = usePredictions(locationId || undefined);
  const [trendMetric, setTrendMetric] = useState<'avg_score' | 'avg_download' | 'avg_ping'>('avg_score');

  const locRows = (byLoc.data?.items ?? []).filter((r) => r.tests > 0);
  const speedRows = [...locRows].sort((a, b) => b.avg_download - a.avg_download);
  const pingRows = [...locRows].sort((a, b) => a.avg_ping - b.avg_ping);
  const hours = (byHour.data?.items ?? []).map((h) => ({ ...h, h: hourLabel(h.hour) }));
  const daysRows = (byDay.data?.items ?? []).map((d) => ({ ...d, d: fmtDay(d.day) }));
  const usedTypes = COMPLAINT_TYPES.filter((t) => (cbb.data?.rows ?? []).some((r) => r[t]));
  const forecast = (pred.data?.campus?.rows ?? []).map((r: any) => ({ ...r, h: hourLabel(r.hour) }));

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Speed, latency and complaints across locations and time. Every chart has a table view."
        actions={
          <>
            <Segmented label="Range" value={days} onChange={setDays} options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
            <select className="input h-10 w-auto" value={building} onChange={(e) => { setBuilding(e.target.value); setLocationId(''); }} aria-label="Building">
              <option value="">All buildings</option>
              {locs.data?.buildings.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select className="input h-10 w-auto" value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
              <option value="">All locations</option>
              {locs.data?.items.filter((l) => !building || l.building === building).map((l) => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
            </select>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title="Speed by location"
          subtitle="Average download and upload"
          legend={<><LegendItem color={SERIES[0]!} label="Download" /><LegendItem color={SERIES[1]!} label="Upload" /></>}
          table={{ columns: ['Location', 'Tests', 'Download (Mbps)', 'Upload (Mbps)'], rows: speedRows.map((r) => [r.location_name, r.tests, fmtMbps(r.avg_download), fmtMbps(r.avg_upload)]) }}
          height={Math.max(240, speedRows.length * 30)}
        >
          <QueryState q={byLoc}>
            <ResponsiveContainer>
              <BarChart data={speedRows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barGap={2} barCategoryGap={8}>
                <CartesianGrid stroke="#e6eaf0" horizontal={false} />
                <XAxis type="number" {...AXIS} unit="" />
                <YAxis type="category" dataKey="location_name" {...AXIS} width={128} tick={{ fill: '#3d4a60', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip fmt={(v: number) => `${fmtMbps(v)} Mbps`} />} cursor={{ fill: '#eef2f6' }} />
                <Bar dataKey="avg_download" name="Download" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
                <Bar dataKey="avg_upload" name="Upload" fill={SERIES[1]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </QueryState>
        </ChartFrame>

        <ChartFrame
          title="Ping by location"
          subtitle="Average latency; bar colour is the location's current status"
          table={{ columns: ['Location', 'Avg ping (ms)', 'Avg loss (%)', 'Status'], rows: pingRows.map((r) => [r.location_name, fmtMs(r.avg_ping), r.avg_loss, r.current_status]) }}
          height={Math.max(240, pingRows.length * 30)}
        >
          <ResponsiveContainer>
            <BarChart data={pingRows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barCategoryGap={8}>
              <CartesianGrid stroke="#e6eaf0" horizontal={false} />
              <XAxis type="number" {...AXIS} />
              <YAxis type="category" dataKey="location_name" {...AXIS} width={128} tick={{ fill: '#3d4a60', fontSize: 12 }} />
              <Tooltip content={<ChartTooltip fmt={(v: number) => `${fmtMs(v)} ms`} />} cursor={{ fill: '#eef2f6' }} />
              <Bar dataKey="avg_ping" name="Average ping" radius={[0, 4, 4, 0]}>
                {pingRows.map((r) => <Cell key={r.location_id} fill={STATUS_COLORS[r.current_status as LocationStatus]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Performance by hour"
          subtitle="Average health score and test volume per hour of day"
          legend={<><LegendItem color={SERIES[0]!} label="Average score" /></>}
          table={{ columns: ['Hour', 'Tests', 'Avg score', 'Download', 'Ping'], rows: (byHour.data?.items ?? []).map((h) => [h.label, h.tests, h.avg_score ?? '–', fmtMbps(h.avg_download), fmtMs(h.avg_ping)]) }}
        >
          <ResponsiveContainer>
            <BarChart data={hours} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="h" {...AXIS} interval={2} />
              <YAxis domain={[0, 100]} {...AXIS} />
              <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef2f6' }} />
              <Bar dataKey="avg_score" name="Average score" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Performance by day"
          subtitle="Historical performance trend"
          actions={<Segmented size="sm" label="Metric" value={trendMetric} onChange={setTrendMetric} options={[{ value: 'avg_score', label: 'Score' }, { value: 'avg_download', label: 'Down' }, { value: 'avg_ping', label: 'Ping' }]} />}
          legend={<LegendItem color={trendMetric === 'avg_ping' ? SERIES[2]! : SERIES[0]!} label={trendMetric === 'avg_score' ? 'Average score' : trendMetric === 'avg_download' ? 'Average download (Mbps)' : 'Average ping (ms)'} line />}
          table={{ columns: ['Day', 'Tests', 'Score', 'Download', 'Ping', 'Poor tests', 'Complaints'], rows: daysRows.map((d) => [d.d, d.tests, d.avg_score ?? '–', fmtMbps(d.avg_download), fmtMs(d.avg_ping), d.poor_tests, d.complaints]) }}
        >
          <ResponsiveContainer>
            <LineChart data={daysRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="d" {...AXIS} minTickGap={16} />
              <YAxis {...AXIS} domain={trendMetric === 'avg_score' ? [0, 100] : ['auto', 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey={trendMetric} name={trendMetric === 'avg_score' ? 'Score' : trendMetric === 'avg_download' ? 'Download' : 'Ping'} stroke={trendMetric === 'avg_ping' ? SERIES[2] : SERIES[0]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Complaints by building"
          subtitle="Stacked by complaint category"
          legend={usedTypes.map((t) => <LegendItem key={t} color={SERIES[COMPLAINT_TYPES.indexOf(t)]!} label={COMPLAINT_TYPE_LABELS[t]} />)}
          table={{ columns: ['Building', 'Total', ...usedTypes.map((t) => COMPLAINT_TYPE_LABELS[t])], rows: (cbb.data?.rows ?? []).map((r) => [r.building, r.total, ...usedTypes.map((t) => r[t] ?? 0)]) }}
        >
          <ResponsiveContainer>
            <BarChart data={cbb.data?.rows ?? []} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
              <CartesianGrid {...GRID} />
              <XAxis dataKey="building" {...AXIS} interval={0} tick={{ fontSize: 11, fill: '#66728a' }} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef2f6' }} />
              {usedTypes.map((t, i) => (
                <Bar key={t} dataKey={t} name={COMPLAINT_TYPE_LABELS[t]} stackId="a" fill={SERIES[COMPLAINT_TYPES.indexOf(t)]} stroke="#fff" strokeWidth={1} radius={i === usedTypes.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <Recommendations limit={8} />

        <Card title="Peak usage periods" subtitle="When the network is busiest and slowest">
          <QueryState q={peaks}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-2"><Users className="h-4 w-4" /> Busiest hours (tests)</div>
                <ol className="space-y-1.5">
                  {peaks.data?.busiest.map((h: any) => (
                    <li key={h.hour} className="flex items-center justify-between rounded-lg bg-paper/70 px-3 py-2 text-[13.5px]"><span>{h.label}–{String((h.hour + 1) % 24).padStart(2, '0')}:00</span><b className="num">{h.tests}</b></li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-2"><Clock className="h-4 w-4" /> Slowest hours (score)</div>
                <ol className="space-y-1.5">
                  {peaks.data?.slowest.map((h: any) => (
                    <li key={h.hour} className="flex items-center justify-between rounded-lg bg-paper/70 px-3 py-2 text-[13.5px]"><span>{h.label}–{String((h.hour + 1) % 24).padStart(2, '0')}:00</span><b className="num">{h.avg_score}</b></li>
                  ))}
                </ol>
              </div>
            </div>
          </QueryState>
        </Card>

        <ChartFrame
          title="Next 24 hours forecast"
          subtitle={pred.data?.campus?.dips?.length ? `Likely dips: ${pred.data.campus.dips.map((d: any) => d.label).join(', ')}` : 'Expected health score by hour (from the same hour on previous weeks)'}
          legend={<><LegendItem color={SERIES[0]!} label="Expected score" /><LegendItem color="#ef4444" label="Predicted dip" /></>}
          table={{ columns: ['Hour', 'Expected score', 'Expected download', 'Samples', 'Dip'], rows: forecast.map((r: any) => [r.h, r.expectedScore ?? '–', fmtMbps(r.expectedDownload), r.samples, r.isDip ? 'yes' : '']) }}
        >
          <ResponsiveContainer>
            <BarChart data={forecast} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="h" {...AXIS} interval={2} />
              <YAxis domain={[0, 100]} {...AXIS} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef2f6' }} />
              <Bar dataKey="expectedScore" name="Expected score" radius={[4, 4, 0, 0]}>
                {forecast.map((r: any, i: number) => <Cell key={i} fill={r.isDip ? '#ef4444' : SERIES[0]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <Card title="Location summary" className="mt-5" pad={false}>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Location</th><th>Building</th><th>Status now</th><th className="text-right">Tests</th><th className="text-right">Download</th><th className="text-right">Upload</th><th className="text-right">Ping</th><th className="text-right">Loss</th><th className="text-right">Avg score</th><th className="text-right">Complaints</th></tr></thead>
            <tbody>
              {(byLoc.data?.items ?? []).map((r) => (
                <tr key={r.location_id}>
                  <td className="font-medium">{r.location_name}</td><td className="text-ink-2">{r.building}</td>
                  <td><StatusBadge status={r.current_status} size="sm" /></td>
                  <td className="num text-right">{r.tests}</td><td className="num text-right">{fmtMbps(r.avg_download)}</td><td className="num text-right">{fmtMbps(r.avg_upload)}</td>
                  <td className="num text-right">{fmtMs(r.avg_ping)}</td><td className="num text-right">{r.avg_loss ?? '–'}%</td><td className="num text-right">{r.avg_score ?? '–'}</td><td className="num text-right">{r.complaints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
