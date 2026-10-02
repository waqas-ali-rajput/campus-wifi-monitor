import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Repeat } from 'lucide-react';
import { useAnalytics } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { AXIS, Badge, Button, Card, ChartFrame, ChartTooltip, EmptyState, GRID, LegendItem, PageHeader, QueryState, Segmented } from '../../components/ui';
import { fmtAgo, fmtMbps, fmtMs } from '../../lib/format';

export function ReportsPage() {
  const { can } = useAuth();
  const [days, setDays] = useState('14');
  const compare = useAnalytics<{ items: any[] }>('compare-buildings', { days });
  const recurring = useAnalytics<{ items: any[] }>('recurring-problems', { days });
  const staff = useAnalytics<{ items: any[] }>('staff-activity', { days }, can('analytics.staffActivity'));
  const rows = compare.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Compare & reports"
        subtitle="Building comparison, recurring problems, IT support activity and CSV exports."
        actions={<Segmented label="Range" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title="Compare buildings"
          subtitle="Average health score and complaints"
          legend={<><LegendItem color="#2a78d6" label="Avg score" /><LegendItem color="#eb6834" label="Complaints" /></>}
          table={{ columns: ['Building', 'Locations', 'Tests', 'Score', 'Download', 'Ping', 'Poor tests', 'Complaints', 'Open'], rows: rows.map((r) => [r.building, r.locations, r.tests, r.avg_score, fmtMbps(r.avg_download), fmtMs(r.avg_ping), r.poor_tests, r.complaints, r.open_complaints]) }}
        >
          <QueryState q={compare}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2} barCategoryGap="25%">
                <CartesianGrid {...GRID} />
                <XAxis dataKey="building" {...AXIS} interval={0} tick={{ fontSize: 11, fill: '#66728a' }} />
                <YAxis {...AXIS} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef2f6' }} />
                <Bar dataKey="avg_score" name="Avg score" fill="#2a78d6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="complaints" name="Complaints" fill="#eb6834" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </QueryState>
        </ChartFrame>

        <Card title="Building comparison" pad={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Building</th><th className="text-right">Tests</th><th className="text-right">Score</th><th className="text-right">Down</th><th className="text-right">Ping</th><th className="text-right">Poor %</th><th className="text-right">Open</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.building}>
                    <td className="font-medium">{r.building}<div className="text-[12px] font-normal text-ink-3">{r.locations} location{r.locations === 1 ? '' : 's'}</div></td>
                    <td className="num text-right">{r.tests}</td>
                    <td className="num text-right font-medium">{r.avg_score ?? '–'}</td>
                    <td className="num text-right">{fmtMbps(r.avg_download)}</td>
                    <td className="num text-right">{fmtMs(r.avg_ping)}</td>
                    <td className="num text-right">{r.tests ? Math.round((r.poor_tests / r.tests) * 100) : 0}%</td>
                    <td className="num text-right">{r.open_complaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recurring problems" subtitle="The same problem at the same place on 3 or more different days." pad={false}>
          <QueryState q={recurring} empty={!recurring.data?.items.length && <EmptyState icon={<Repeat className="h-5 w-5" />} title="No recurring problems" />}>
            <ul className="max-h-[380px] overflow-y-auto">
              {recurring.data?.items.map((r, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{r.location_name} <span className="font-normal text-ink-3">· {r.building}</span></div>
                    <div className="text-[12.5px] text-ink-2">{r.problem}</div>
                  </div>
                  <Badge tone={r.days >= 7 ? 'danger' : 'warn'}>{r.days} days</Badge>
                  <span className="w-20 text-right text-[12px] text-ink-3">{r.count} × · {fmtAgo(r.last_seen)}</span>
                </li>
              ))}
            </ul>
          </QueryState>
        </Card>

        {can('reports.view') && (
          <Card title="Download reports" subtitle="CSV files open in Excel or Google Sheets.">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['Speed tests', '/api/reports/tests.csv'],
                ['Complaints', '/api/reports/complaints.csv'],
                ['Location summary', `/api/reports/summary.csv?days=${days}`],
              ].map(([label, href]) => (
                <a key={href} href={href} download>
                  <Button variant="secondary" className="w-full" icon={<Download className="h-4 w-4" />}>{label}</Button>
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>

      {can('analytics.staffActivity') && (
        <Card title="IT support activity" subtitle="Workload and resolution time per IT staff member." className="mt-5" pad={false}>
          <QueryState q={staff} empty={!staff.data?.items.length}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Staff</th><th className="text-right">Assigned (open)</th><th className="text-right">In progress</th><th className="text-right">Resolved</th><th className="text-right">Avg resolution</th><th className="text-right">Actions in range</th><th>Last action</th></tr></thead>
                <tbody>
                  {staff.data?.items.map((s) => (
                    <tr key={s.user_id}>
                      <td><div className="font-medium">{s.name}</div><div className="text-[12px] text-ink-3">{s.email}</div></td>
                      <td className="num text-right">{s.assigned_open}</td>
                      <td className="num text-right">{s.in_progress}</td>
                      <td className="num text-right font-medium">{s.resolved}</td>
                      <td className="num text-right">{s.avg_resolution_hours != null ? `${s.avg_resolution_hours} h` : '–'}</td>
                      <td className="num text-right">{s.actions}</td>
                      <td className="text-ink-3">{fmtAgo(s.last_action_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </Card>
      )}
    </>
  );
}
